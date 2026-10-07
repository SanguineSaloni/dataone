# [DBX-PIPELINE] Lakeflow Spark Declarative Pipelines manages table refresh,
# expectations, lineage, and publication of the DataOne Gold views below.
from pyspark import pipelines as dp
from pyspark.sql import functions as F


CATALOG = spark.conf.get("dataone.catalog", "workspace")
BRONZE_SCHEMA = spark.conf.get("dataone.bronze_schema", "dataone_bronze")
OPS_SCHEMA = spark.conf.get("dataone.ops_schema", "dataone_ops")


@dp.table(name="clean_cells", comment="Cell-level values cleaned and classified by DataOne")
@dp.expect_all(
    {
        "run_id_present": "run_id IS NOT NULL",
        "project_name_present": "project_name IS NOT NULL",
        "column_name_present": "column_name IS NOT NULL",
    }
)
def clean_cells():
    source = spark.readStream.table(f"{CATALOG}.{BRONZE_SCHEMA}.ingested_cells")
    column_key = F.lower(F.col("column_name"))
    trimmed = F.trim(F.col("raw_value"))
    is_missing = F.col("raw_value").isNull() | (trimmed == "")
    is_email = column_key.rlike("(^|_)email($|_)")
    is_date = column_key.rlike("(^|_)(date|time|timestamp|created_at|updated_at)($|_)")
    is_number = column_key.rlike("(^|_)(amount|price|cost|quantity|qty|count|score|rate|total)($|_)")
    parsed_number = F.expr("try_cast(regexp_replace(trim(raw_value), ',', '') AS DOUBLE)")
    parsed_date = F.expr("try_cast(trim(raw_value) AS DATE)")

    issue = (
        F.when(is_missing, F.lit("missing"))
        .when(is_email & ~trimmed.rlike(r"^[^@\s]+@[^@\s]+\.[^@\s]+$"), F.lit("invalid_email"))
        .when(is_number & parsed_number.isNull(), F.lit("invalid_number"))
        .when(is_date & parsed_date.isNull(), F.lit("invalid_date"))
        .otherwise(F.lit("valid"))
    )

    cleaned = (
        F.when(is_missing, F.lit(None).cast("string"))
        .when(is_email, F.lower(trimmed))
        .when(column_key.rlike("(^|_)country($|_)") & F.lower(trimmed).isin("in", "india"), F.lit("INDIA"))
        .when(column_key.rlike("(^|_)country($|_)") & F.lower(trimmed).isin("us", "usa", "united states"), F.lit("USA"))
        .when(column_key.rlike("(^|_)status($|_)"), F.initcap(F.lower(trimmed)))
        # Typed columns stay type-safe for downstream publication: values that
        # fail validation remain visible as quality issues and clean to NULL.
        .when(is_date, F.date_format(parsed_date, "yyyy-MM-dd"))
        .when(
            is_number,
            F.when(parsed_number.isNotNull(), F.regexp_replace(trimmed, ",", "")).otherwise(
                F.lit(None).cast("string")
            ),
        )
        .when(column_key.rlike("(^|_)(first_name|last_name|name)($|_)"), F.initcap(F.lower(trimmed)))
        .otherwise(trimmed)
    )

    return source.select(
        "project_name",
        "run_id",
        "source_mode",
        "source_identifier",
        "row_id",
        "column_name",
        "source_type",
        "raw_value",
        cleaned.alias("clean_value"),
        issue.alias("quality_issue"),
        (issue == "valid").alias("is_valid"),
        (~F.col("raw_value").eqNullSafe(cleaned)).alias("was_transformed"),
        "ingested_at",
        F.current_timestamp().alias("cleaned_at"),
    )


def latest_clean_cells():
    key_columns = [
        "project_name",
        "run_id",
        "source_mode",
        "source_identifier",
        "row_id",
        "column_name",
    ]
    latest_value = F.max_by(
        F.struct(
            "source_type",
            "raw_value",
            "clean_value",
            "quality_issue",
            "is_valid",
            "was_transformed",
            "ingested_at",
            "cleaned_at",
        ),
        F.col("cleaned_at"),
    ).alias("latest")
    return (
        spark.read.table("clean_cells")
        .groupBy(*key_columns)
        .agg(latest_value)
        .select(*key_columns, "latest.*")
    )


@dp.materialized_view(name="quality_summary", comment="Run-level DataOne quality index and transformation totals")
def quality_summary():
    clean = latest_clean_cells()
    return clean.groupBy("project_name", "run_id", "source_mode", "source_identifier").agg(
        F.countDistinct("row_id").alias("row_count"),
        F.countDistinct("column_name").alias("column_count"),
        F.count("*").alias("cell_count"),
        F.sum(F.when(F.col("is_valid"), 1).otherwise(0)).alias("valid_cells"),
        F.sum(F.when(~F.col("is_valid"), 1).otherwise(0)).alias("issue_cells"),
        F.sum(F.when(F.col("was_transformed"), 1).otherwise(0)).alias("transformed_cells"),
        F.round(100.0 * F.avg(F.when(F.col("is_valid"), 1.0).otherwise(0.0)), 1).alias("quality_score"),
        F.max("cleaned_at").alias("updated_at"),
    )


@dp.materialized_view(name="cleaned_records", comment="Governed cleaned records serialized from arbitrary source schemas")
def cleaned_records():
    clean = latest_clean_cells()
    per_column = clean.groupBy(
        "project_name",
        "run_id",
        "source_mode",
        "source_identifier",
        "row_id",
        "column_name",
    ).agg(
        F.max_by("clean_value", "cleaned_at").alias("clean_value"),
        F.max(F.when(F.col("quality_issue") != "valid", 1).otherwise(0)).alias("issue_flag"),
        F.max(F.when(F.col("was_transformed"), 1).otherwise(0)).alias("transformed_flag"),
        F.max("cleaned_at").alias("cleaned_at"),
    )
    records = per_column.groupBy(
        "project_name", "run_id", "source_mode", "source_identifier", "row_id"
    ).agg(
        F.to_json(
            F.map_from_entries(
                F.collect_list(F.struct(F.col("column_name"), F.col("clean_value")))
            )
        ).alias("cleaned_record_json"),
        F.sum("issue_flag").alias("issue_count"),
        F.sum("transformed_flag").alias("transformed_count"),
        F.max("cleaned_at").alias("cleaned_at"),
    )
    return records.withColumn("is_quarantined", F.col("issue_count") > 0)


@dp.materialized_view(name="quality_by_column", comment="Per-column quality and completeness for schema review")
def quality_by_column():
    clean = latest_clean_cells()
    return clean.groupBy("project_name", "run_id", "column_name", "source_type").agg(
        F.count("*").alias("cell_count"),
        F.sum(F.when(F.col("quality_issue") == "missing", 1).otherwise(0)).alias("missing_count"),
        F.sum(F.when(F.col("quality_issue") != "valid", 1).otherwise(0)).alias("issue_count"),
        F.sum(F.when(F.col("was_transformed"), 1).otherwise(0)).alias("transformed_count"),
        F.round(100.0 * F.avg(F.when(F.col("is_valid"), 1.0).otherwise(0.0)), 1).alias("quality_score"),
    )


@dp.materialized_view(name="quality_issue_distribution", comment="Issue distribution for DataOne visual analysis")
def quality_issue_distribution():
    return latest_clean_cells().groupBy("project_name", "run_id", "quality_issue").agg(
        F.count("*").alias("issue_count")
    )


@dp.materialized_view(name="transformation_summary", comment="Cleaning transformations applied by run")
def transformation_summary():
    clean = latest_clean_cells()
    transformation = (
        F.when(F.lower(F.col("column_name")).rlike("email"), F.lit("Normalize email"))
        .when(F.lower(F.col("column_name")).rlike("country"), F.lit("Standardize country"))
        .when(F.lower(F.col("column_name")).rlike("date|time|timestamp|created_at|updated_at"), F.lit("Normalize date"))
        .when(F.lower(F.col("column_name")).rlike("amount|price|cost|quantity|qty|count|score|rate|total"), F.lit("Validate number"))
        .otherwise(F.lit("Trim and normalize text"))
    )
    return clean.withColumn("transformation", transformation).groupBy(
        "project_name", "run_id", "transformation"
    ).agg(
        F.count("*").alias("evaluated_cells"),
        F.sum(F.when(F.col("was_transformed"), 1).otherwise(0)).alias("changed_cells"),
    )


@dp.materialized_view(name="schema_mapping", comment="Heuristic schema mapping proposals with confidence scores")
def schema_mapping():
    return spark.read.table(f"{CATALOG}.{OPS_SCHEMA}.schema_profiles").select(
        "project_name",
        "run_id",
        "ordinal",
        "source_column",
        "target_column",
        "source_type",
        "target_type",
        "mapping_confidence",
        "profiled_at",
    )


@dp.materialized_view(name="commerce_performance", comment="Demo revenue view when customer-order fields are present")
def commerce_performance():
    clean = latest_clean_cells().filter(
        F.col("column_name").isin("category", "quantity", "unit_price", "order_status")
    )
    rows = clean.groupBy("project_name", "run_id", "row_id").pivot(
        "column_name", ["category", "quantity", "unit_price", "order_status"]
    ).agg(F.first("clean_value"))
    return rows.groupBy("project_name", "run_id", "category").agg(
        F.count("*").alias("order_count"),
        F.round(F.sum(F.expr("try_cast(quantity AS DOUBLE) * try_cast(unit_price AS DOUBLE)")), 2).alias("revenue"),
        F.sum(F.when(F.lower(F.col("order_status")) == "delivered", 1).otherwise(0)).alias("delivered_orders"),
    )
