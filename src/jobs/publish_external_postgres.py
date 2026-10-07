# Databricks notebook source
import re
import unicodedata
from urllib.parse import urlparse


from pyspark.sql import functions as F


CATALOG = "workspace"
GOLD_SCHEMA = "dataone_gold"
OUTPUT_TABLE_PATTERN = re.compile(r"^[a-z][a-z0-9_]{0,119}$")
RUN_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{8,80}$")
POSTGRES_IDENTIFIER_PATTERN = re.compile(r"^[a-z_][a-z0-9_]{0,62}$")
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


enabled = widget("enabled", "false").lower() == "true"
project_name = widget("project_name", "DataOne Project")
run_id = widget("run_id", "manual-run")
output_table = widget("output_table", "dataone_project")
target_schema = widget("target_schema", "public").lower()
secret_scope = widget("secret_scope", "dataone-target")
jdbc_url_key = widget("jdbc_url_key", "jdbc-url")
user_key = widget("user_key", "username")
password_key = widget("password_key", "password")

if not enabled:
    dbutils.notebook.exit("External PostgreSQL publication is disabled for this bundle target")

if len(project_name) < 3 or len(project_name) > 120:
    raise ValueError("project_name must contain 3-120 characters")
if not RUN_ID_PATTERN.fullmatch(run_id):
    raise ValueError("run_id must be an 8-80 character identifier")
if not OUTPUT_TABLE_PATTERN.fullmatch(output_table):
    raise ValueError("output_table must be a safe lowercase Unity Catalog table name")
if output_table != project_table_name(project_name):
    raise ValueError("output_table must be derived from project_name")
if not POSTGRES_IDENTIFIER_PATTERN.fullmatch(target_schema):
    raise ValueError("target_schema must be a safe PostgreSQL identifier")

# [DBX-TARGET-SECRETS] The Job run-as identity reads fixed secret keys selected
# by the bundle administrator. Secret values are never accepted as Job
# parameters, returned to the UI, or written to logs.
jdbc_url = dbutils.secrets.get(scope=secret_scope, key=jdbc_url_key)
target_user = dbutils.secrets.get(scope=secret_scope, key=user_key)
target_password = dbutils.secrets.get(scope=secret_scope, key=password_key)
if not jdbc_url.startswith("jdbc:postgresql://"):
    raise ValueError("The configured target JDBC URL must use PostgreSQL")

target_url = urlparse(jdbc_url.removeprefix("jdbc:"))
target_host = target_url.hostname
target_port = target_url.port or 5432
target_database = target_url.path.lstrip("/")
if not target_host or not target_database:
    raise ValueError("The configured target JDBC URL must include a PostgreSQL host and database")

qualified_gold = f"`{CATALOG}`.`{GOLD_SCHEMA}`.`{output_table}`"
gold = spark.table(qualified_gold).filter(F.col("_dataone_run_id") == run_id)
if gold.limit(1).count() == 0:
    raise ValueError(f"No Gold rows exist for run {run_id!r} in {qualified_gold}")

# [DBX-TARGET-BUSINESS-COLUMNS] DataOne lineage remains in Unity Catalog. The
# external PostgreSQL table receives only the transformed business columns.
business_columns = [column for column in gold.columns if column not in RESERVED_METADATA_COLUMNS]
if not business_columns:
    raise ValueError("The Gold table has no business columns to publish")
target = gold.select(*business_columns)
qualified_target = f"{target_schema}.{output_table}"

(
    # [DBX-SERVERLESS-POSTGRES] Serverless Jobs require Databricks' bundled
    # PostgreSQL data source rather than a generic JDBC DataFrame write.
    target.write.format("postgresql")
    .option("host", target_host)
    .option("port", str(target_port))
    .option("database", target_database)
    .option("dbtable", qualified_target)
    .option("user", target_user)
    .option("password", target_password)
    .mode("overwrite")
    .save()
)

# [DBX-TARGET-VERIFY] A second PostgreSQL read proves that the target contains the
# same number of published business rows before the Job can succeed.
expected_count = target.count()
actual_count = (
    spark.read.format("postgresql")
    .option("host", target_host)
    .option("port", str(target_port))
    .option("database", target_database)
    .option("dbtable", qualified_target)
    .option("user", target_user)
    .option("password", target_password)
    .load()
    .count()
)
if actual_count != expected_count:
    raise RuntimeError(
        f"PostgreSQL verification failed for {target_schema}.{output_table}: "
        f"expected {expected_count} rows, found {actual_count}"
    )

dbutils.notebook.exit(
    f"Published and verified {actual_count} business rows in PostgreSQL "
    f"{target_schema}.{output_table}"
)
