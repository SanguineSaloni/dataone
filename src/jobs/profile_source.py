# Databricks notebook source
import re
import sqlite3
from datetime import datetime, timezone

from pyspark.sql import functions as F
from pyspark.sql.types import StringType, StructField, StructType


# [DBX-UC] All profile and run-ledger writes stay in governed Unity Catalog.
CATALOG = "workspace"
BRONZE_SCHEMA = "dataone_bronze"
OPS_SCHEMA = "dataone_ops"
LANDING_ROOT = "/Volumes/workspace/dataone_bronze/dataone_landing"
MAX_PROFILE_ROWS = 250_000
MAX_PROFILE_COLUMNS = 200
TABLE_NAME_PATTERN = re.compile(r"^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$")
RELATIVE_PATH_PATTERN = re.compile(r"^(csv|json|parquet|sqlite)/[A-Za-z0-9._/-]+$")
SQLITE_TABLE_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def widget(name: str, default: str) -> str:
    dbutils.widgets.text(name, default)
    return dbutils.widgets.get(name).strip()


project_name = widget("project_name", "DataOne Project")
run_id = widget("run_id", "manual-run")
source_mode = widget("source_mode", "uc_table")
source_path = widget("source_path", "")
source_format = widget("source_format", "csv").lower()
json_mode = widget("json_mode", "lines").lower()
source_table = widget("source_table", "workspace.default.bronze_customer_churn")

if not project_name or len(project_name) > 120:
    raise ValueError("project_name must contain 1-120 characters")
if not re.fullmatch(r"[A-Za-z0-9_-]{8,80}", run_id):
    raise ValueError("run_id must be an 8-80 character identifier")
if source_mode not in {"volume_file", "uc_table"}:
    raise ValueError("source_mode must be volume_file or uc_table")

if source_mode == "volume_file":
    # [DBX-VOLUME] source_path is a validated relative path below the single
    # resource-bound landing Volume; arbitrary filesystem paths are rejected.
    if source_format not in {"csv", "json", "parquet", "sqlite"}:
        raise ValueError("source_format must be csv, json, parquet, or sqlite")
    if json_mode not in {"lines", "multiline"}:
        raise ValueError("json_mode must be lines or multiline")
    if not RELATIVE_PATH_PATTERN.fullmatch(source_path) or ".." in source_path:
        raise ValueError("source_path must be a safe path below csv/, json/, parquet/, or sqlite/")
    expected_prefix = f"{source_format}/"
    if not source_path.startswith(expected_prefix):
        raise ValueError("source_path folder must match source_format")
    source_identifier = f"{LANDING_ROOT}/{source_path}"
    if source_format == "sqlite":
        if not source_path.lower().endswith((".db", ".sqlite", ".sqlite3")):
            raise ValueError("SQLite source_path must end in .db, .sqlite, or .sqlite3")
        if not SQLITE_TABLE_PATTERN.fullmatch(source_table):
            raise ValueError("SQLite source_table must be a safe table identifier")

        # [DBX-SQLITE-INGEST] SQLite is a local file database rather than a
        # federated server. The app uploads it to the bound UC Volume; this Job
        # opens that immutable snapshot read-only and converts the selected
        # table into Spark rows before the shared profiling/pipeline stages.
        connection = sqlite3.connect(
            f"file:{source_identifier}?mode=ro&immutable=1", uri=True
        )
        try:
            table_exists = connection.execute(
                "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
                (source_table,),
            ).fetchone()
            if table_exists is None:
                raise ValueError(f"SQLite table {source_table!r} does not exist")

            quoted_table = source_table.replace('"', '""')
            cursor = connection.execute(
                f'SELECT * FROM "{quoted_table}" LIMIT {MAX_PROFILE_ROWS}'
            )
            column_names = [description[0] for description in cursor.description or []]
            sqlite_rows = cursor.fetchall()
        finally:
            connection.close()

        sqlite_schema = StructType(
            [StructField(column_name, StringType(), True) for column_name in column_names]
        )
        normalized_rows = [
            tuple(None if value is None else str(value) for value in row)
            for row in sqlite_rows
        ]
        source_df = spark.createDataFrame(normalized_rows, sqlite_schema)
    else:
        reader = spark.read.format(source_format)
        if source_format == "csv":
            reader = reader.option("header", "true").option("inferSchema", "true")
        elif source_format == "json":
            reader = reader.option("multiLine", str(json_mode == "multiline").lower()).option("inferSchema", "true")
        source_df = reader.load(source_identifier)
else:
    # [DBX-UC-SOURCE] Three-part identifiers are validated before Spark resolves
    # the table under the Job run-as service principal's UC grants.
    if not TABLE_NAME_PATTERN.fullmatch(source_table):
        raise ValueError("source_table must be a three-part Unity Catalog table name")
    quoted_table = ".".join(f"`{segment}`" for segment in source_table.split("."))
    source_identifier = source_table
    source_df = spark.table(quoted_table)

if not source_df.columns:
    raise ValueError("The selected source has no columns")
if len(source_df.columns) > MAX_PROFILE_COLUMNS:
    raise ValueError(f"The selected source has more than {MAX_PROFILE_COLUMNS} columns")
if len(set(source_df.columns)) != len(source_df.columns):
    raise ValueError("The selected source contains duplicate column names")


def source_column(column_name: str):
    escaped = column_name.replace("`", "``")
    return F.col(f"`{escaped}`")


def write_run_rows(dataframe, table_name: str) -> None:
    # A Job repair can execute this notebook again with the same logical run ID.
    # Replace only that run's rows so Bronze/Ops metadata remains idempotent and
    # downstream schema parsing never sees duplicate ordinals or cells.
    project_literal = project_name.replace("'", "''")
    run_literal = run_id.replace("'", "''")
    replace_where = (
        f"project_name = '{project_literal}' AND run_id = '{run_literal}'"
    )
    dataframe.write.format("delta").mode("overwrite").option(
        "replaceWhere", replace_where
    ).option("overwriteSchema", "false").saveAsTable(table_name)

sampled_df = source_df.limit(MAX_PROFILE_ROWS)
row_count = sampled_df.count()
if row_count == 0:
    raise ValueError("The selected source contains no rows")

started_at = datetime.now(timezone.utc)
source_types = {field.name: field.dataType.simpleString() for field in sampled_df.schema.fields}

aggregate_expressions = []
for index, column_name in enumerate(sampled_df.columns):
    column_ref = source_column(column_name)
    aggregate_expressions.extend(
        [
            F.sum(F.when(column_ref.isNull() | (F.trim(column_ref.cast("string")) == ""), 1).otherwise(0)).alias(
                f"null_{index}"
            ),
            F.approx_count_distinct(column_ref).alias(f"distinct_{index}"),
        ]
    )

aggregate_row = sampled_df.agg(*aggregate_expressions).first().asDict()


def target_name(column_name: str) -> str:
    normalized = re.sub(r"[^A-Za-z0-9]+", "_", column_name).strip("_").lower()
    return normalized or "unnamed_column"


profile_rows = []
for index, column_name in enumerate(sampled_df.columns):
    normalized_name = target_name(column_name)
    confidence = 0.99 if normalized_name == column_name.lower() else 0.94
    profile_rows.append(
        (
            project_name,
            run_id,
            source_mode,
            source_identifier,
            index + 1,
            column_name,
            normalized_name,
            source_types[column_name],
            source_types[column_name],
            int(row_count),
            int(aggregate_row[f"null_{index}"] or 0),
            int(aggregate_row[f"distinct_{index}"] or 0),
            float(confidence),
            started_at,
        )
    )

profile_schema = """
project_name STRING, run_id STRING, source_mode STRING, source_identifier STRING,
ordinal INT, source_column STRING, target_column STRING, source_type STRING,
target_type STRING, row_count BIGINT, null_count BIGINT, distinct_count BIGINT,
mapping_confidence DOUBLE, profiled_at TIMESTAMP
"""
write_run_rows(
    spark.createDataFrame(profile_rows, profile_schema),
    f"{CATALOG}.{OPS_SCHEMA}.schema_profiles",
)

source_with_row_id = sampled_df.withColumn("_dataone_row_id", F.monotonically_increasing_id().cast("string"))
cell_structs = [
    F.struct(
        F.lit(column_name).alias("column_name"),
        F.lit(source_types[column_name]).alias("source_type"),
        source_column(column_name).cast("string").alias("raw_value"),
    )
    for column_name in sampled_df.columns
]

cells_df = (
    source_with_row_id.select("_dataone_row_id", F.explode(F.array(*cell_structs)).alias("cell"))
    .select(
        F.lit(project_name).alias("project_name"),
        F.lit(run_id).alias("run_id"),
        F.lit(source_mode).alias("source_mode"),
        F.lit(source_identifier).alias("source_identifier"),
        F.col("_dataone_row_id").alias("row_id"),
        F.col("cell.column_name").alias("column_name"),
        F.col("cell.source_type").alias("source_type"),
        F.col("cell.raw_value").alias("raw_value"),
        F.lit(started_at).cast("timestamp").alias("ingested_at"),
    )
)
write_run_rows(cells_df, f"{CATALOG}.{BRONZE_SCHEMA}.ingested_cells")

run_rows = [
    (
        project_name,
        run_id,
        source_mode,
        source_identifier,
        source_format if source_mode == "volume_file" else "unity_catalog",
        int(row_count),
        len(sampled_df.columns),
        "PROFILED",
        started_at,
    )
]
run_schema = """
project_name STRING, run_id STRING, source_mode STRING, source_identifier STRING,
source_format STRING, row_count BIGINT, column_count INT, status STRING, started_at TIMESTAMP
"""
write_run_rows(
    spark.createDataFrame(run_rows, run_schema),
    f"{CATALOG}.{OPS_SCHEMA}.project_runs",
)

dbutils.notebook.exit(
    f"Profiled {row_count} rows and {len(source_df.columns)} columns for run {run_id}"
)
