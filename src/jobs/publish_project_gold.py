# Databricks notebook source
import re
import unicodedata

from pyspark.sql import functions as F
from pyspark.sql.types import StringType, StructField, StructType
from pyspark.sql.window import Window


CATALOG = "workspace"
GOLD_SCHEMA = "dataone_gold"
OPS_SCHEMA = "dataone_ops"
OUTPUT_TABLE_PATTERN = re.compile(r"^[a-z][a-z0-9_]{0,119}$")
RUN_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{8,80}$")
RESERVED_METADATA_COLUMNS = {
    "_dataone_project_name",
    "_dataone_run_id",
    "_dataone_source_identifier",
    "_dataone_record_id",
    "_dataone_transformed_count",
    "_dataone_published_at",
}


def widget(name: str, default: str) -> str:
    dbutils.widgets.text(name, default)
    return dbutils.widgets.get(name).strip()


def normalize_identifier(value: str, fallback: str) -> str:
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    normalized = re.sub(r"[^a-z0-9]+", "_", ascii_value.lower()).strip("_")
    return normalized or fallback


def project_table_name(project_name: str) -> str:
    normalized = normalize_identifier(project_name, "dataone_project")
    if normalized[0].isdigit():
        normalized = f"project_{normalized}"
    return normalized[:120].rstrip("_")


def unique_target_columns(profile_rows):
    used = set(RESERVED_METADATA_COLUMNS)
    mapped = []
    for row in profile_rows:
        base = normalize_identifier(row.target_column, "unnamed_column")
        candidate = base
        suffix = 2
        while candidate in used:
            candidate = f"{base}_{suffix}"
            suffix += 1
        used.add(candidate)
        mapped.append((row.source_column, candidate))
    return mapped


project_name = widget("project_name", "DataOne Project")
run_id = widget("run_id", "manual-run")
output_table = widget("output_table", "dataone_project")

if len(project_name) < 3 or len(project_name) > 120:
    raise ValueError("project_name must contain 3-120 characters")
if not RUN_ID_PATTERN.fullmatch(run_id):
    raise ValueError("run_id must be an 8-80 character identifier")
if not OUTPUT_TABLE_PATTERN.fullmatch(output_table):
    raise ValueError("output_table must be a safe lowercase Unity Catalog table name")
if output_table != project_table_name(project_name):
    raise ValueError("output_table must be derived from project_name")

# [DBX-UC-METADATA] The Job reads the schema contract produced by the profile
# task. This is metadata stored in Unity Catalog, never a browser-supplied SQL
# fragment.
profile_rows = (
    spark.read.table(f"{CATALOG}.{OPS_SCHEMA}.schema_profiles")
    .filter((F.col("project_name") == project_name) & (F.col("run_id") == run_id))
    .select("ordinal", "source_column", "target_column", "profiled_at")
    # Older runs may contain duplicate profile rows after a Job repair. Keep
    # the newest contract per source ordinal so publication remains repair-safe.
    .withColumn(
        "_profile_rank",
        F.row_number().over(
            Window.partitionBy("ordinal").orderBy(F.col("profiled_at").desc())
        ),
    )
    .filter(F.col("_profile_rank") == 1)
    .drop("_profile_rank", "profiled_at")
    .orderBy("ordinal")
    .collect()
)
if not profile_rows:
    raise ValueError(f"No schema profile exists for project {project_name!r}, run {run_id!r}")

source_fields = [StructField(row.source_column, StringType(), True) for row in profile_rows]
target_columns = unique_target_columns(profile_rows)

# [DBX-PIPELINE-OUTPUT] cleaned_records is the governed output of the upstream
# Spark Declarative Pipeline. Publish every cleaned source record so datasets
# with missing or invalid values do not silently become empty. Quality issues
# and quarantine counts remain available in the shared quality views for
# investigation; invalid values have already been normalized to NULL.
checked_records = (
    spark.read.table(f"{CATALOG}.{GOLD_SCHEMA}.cleaned_records")
    .filter((F.col("project_name") == project_name) & (F.col("run_id") == run_id))
)
if checked_records.limit(1).count() == 0:
    raise ValueError(f"No pipeline output exists for project {project_name!r}, run {run_id!r}")

publishable_records = checked_records.withColumn(
    "_parsed_record", F.from_json(F.col("cleaned_record_json"), StructType(source_fields))
)
project_columns = [
    F.col("_parsed_record").getField(source_column).alias(target_column)
    for source_column, target_column in target_columns
]
published = publishable_records.select(
    *project_columns,
    F.col("project_name").alias("_dataone_project_name"),
    F.col("run_id").alias("_dataone_run_id"),
    F.col("source_identifier").alias("_dataone_source_identifier"),
    F.col("row_id").alias("_dataone_record_id"),
    F.col("transformed_count").alias("_dataone_transformed_count"),
    F.current_timestamp().alias("_dataone_published_at"),
)

# [DBX-PROJECT-GOLD-WRITE] The table identifier is quoted only after strict
# validation and equality checking against project_name. Re-running the same
# project intentionally replaces its final managed Delta table with the newest
# successful run and its current schema.
qualified_output = f"`{CATALOG}`.`{GOLD_SCHEMA}`.`{output_table}`"
published.write.format("delta").mode("overwrite").option("overwriteSchema", "true").saveAsTable(qualified_output)

published_count = spark.table(qualified_output).count()
quarantined_count = checked_records.filter(F.col("is_quarantined")).count()
dbutils.notebook.exit(
    f"Published {published_count} checked rows to {CATALOG}.{GOLD_SCHEMA}.{output_table}; "
    f"retained {quarantined_count} quarantined rows in cleaned_records"
)
