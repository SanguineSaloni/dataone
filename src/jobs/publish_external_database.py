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
SUPPORTED_TARGET_ENGINES = {"postgresql", "mysql"}
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
target_engine = widget("target_engine", "postgresql").lower()
target_schema = widget("target_schema", "public").lower()
secret_scope = widget("secret_scope", "dataone-target")
postgresql_jdbc_url_key = widget("postgresql_jdbc_url_key", "jdbc-url")
postgresql_user_key = widget("postgresql_user_key", "username")
postgresql_password_key = widget("postgresql_password_key", "password")
mysql_jdbc_url_key = widget("mysql_jdbc_url_key", "mysql-jdbc-url")
mysql_user_key = widget("mysql_user_key", "mysql-username")
mysql_password_key = widget("mysql_password_key", "mysql-password")

if not enabled:
    dbutils.notebook.exit("External database publication is disabled for this bundle target")

if target_engine not in SUPPORTED_TARGET_ENGINES:
    raise ValueError("target_engine must be postgresql or mysql")
if len(project_name) < 3 or len(project_name) > 120:
    raise ValueError("project_name must contain 3-120 characters")
if not RUN_ID_PATTERN.fullmatch(run_id):
    raise ValueError("run_id must be an 8-80 character identifier")
if not OUTPUT_TABLE_PATTERN.fullmatch(output_table):
    raise ValueError("output_table must be a safe lowercase Unity Catalog table name")
if output_table != project_table_name(project_name):
    raise ValueError("output_table must be derived from project_name")
if target_engine == "postgresql" and not POSTGRES_IDENTIFIER_PATTERN.fullmatch(target_schema):
    raise ValueError("target_schema must be a safe PostgreSQL identifier")

if target_engine == "postgresql":
    jdbc_url_key = postgresql_jdbc_url_key
    user_key = postgresql_user_key
    password_key = postgresql_password_key
    expected_jdbc_prefix = "jdbc:postgresql://"
    default_port = 5432
    qualified_target = f"{target_schema}.{output_table}"
else:
    jdbc_url_key = mysql_jdbc_url_key
    user_key = mysql_user_key
    password_key = mysql_password_key
    expected_jdbc_prefix = "jdbc:mysql://"
    default_port = 3306
    qualified_target = output_table

# [DBX-TARGET-SECRETS] The UI chooses only the target engine. The Job run-as
# identity reads the corresponding administrator-managed secret keys; secret
# values never enter browser state, Job parameters, or logs.
jdbc_url = dbutils.secrets.get(scope=secret_scope, key=jdbc_url_key)
target_user = dbutils.secrets.get(scope=secret_scope, key=user_key)
target_password = dbutils.secrets.get(scope=secret_scope, key=password_key)
if not jdbc_url.startswith(expected_jdbc_prefix):
    raise ValueError(f"The configured target JDBC URL must use {target_engine}")

target_url = urlparse(jdbc_url.removeprefix("jdbc:"))
target_host = target_url.hostname
target_port = target_url.port or default_port
target_database = target_url.path.lstrip("/")
if not target_host or not target_database:
    raise ValueError("The configured target JDBC URL must include a host and database")

qualified_gold = f"`{CATALOG}`.`{GOLD_SCHEMA}`.`{output_table}`"
gold = spark.table(qualified_gold).filter(F.col("_dataone_run_id") == run_id)
if gold.limit(1).count() == 0:
    raise ValueError(f"No Gold rows exist for run {run_id!r} in {qualified_gold}")

# [DBX-TARGET-BUSINESS-COLUMNS] DataOne lineage stays in Unity Catalog. Only
# transformed business columns are published into the selected AWS database.
business_columns = [column for column in gold.columns if column not in RESERVED_METADATA_COLUMNS]
if not business_columns:
    raise ValueError("The Gold table has no business columns to publish")
target = gold.select(*business_columns)


def external_options(frame):
    configured = (
        frame.format(target_engine)
        .option("host", target_host)
        .option("port", str(target_port))
        .option("database", target_database)
        .option("dbtable", qualified_target)
        .option("user", target_user)
        .option("password", target_password)
    )
    if target_engine == "mysql":
        configured = configured.option("useSSL", "true").option("requireSSL", "true")
    return configured


# [DBX-SERVERLESS-DATABASE-WRITE] Databricks' bundled serverless data sources
# use format("postgresql") or format("mysql") with separate connection options.
external_options(target.write).mode("overwrite").save()

# [DBX-TARGET-VERIFY] Read the published table back and require the same number
# of rows before the Job can report success.
expected_count = target.count()
actual_count = external_options(spark.read).load().count()
if actual_count != expected_count:
    raise RuntimeError(
        f"{target_engine} verification failed for {qualified_target}: "
        f"expected {expected_count} rows, found {actual_count}"
    )

dbutils.notebook.exit(
    f"Published and verified {actual_count} business rows in {target_engine} {qualified_target}"
)
