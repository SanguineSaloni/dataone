"""
Databricks Ingestion Service

Handles:
  1. Creating Databricks Jobs idempotently per source type (stored in IngestionPipelineCatalog)
  2. Triggering job runs with connection parameters as job params
  3. Polling run status from Databricks and syncing to DataOne DB
  4. Genie AI pipeline triggering

Design: DataOne owns the pipeline code. Each source type has an embedded
PySpark/DLT task definition that is submitted to Databricks Jobs API on
first use for that source type. Subsequent triggers reuse the same job.
"""

import json
import logging
from datetime import datetime
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.ingestion_run import IngestionRun, IngestionPipelineCatalog
from app.models.connection import DBConnection

logger = logging.getLogger(__name__)


# ── Embedded DLT / PySpark task Python code per source type ─────────────────
# These are submitted as notebook-less Python tasks to Databricks Jobs API.
# Each script reads from source using params passed via spark.conf / sys.argv,
# applies DQ rules, and writes to target Delta Lake.

INGESTION_SCRIPTS: Dict[str, str] = {
    "mysql": '''
import sys
import os
from pyspark.sql import SparkSession

spark = SparkSession.builder.appName("DataOne_MySQL_Ingestion").getOrCreate()

# Read params from Databricks job config
source_host = spark.conf.get("dataone.source.host")
source_port = spark.conf.get("dataone.source.port", "3306")
source_db = spark.conf.get("dataone.source.database")
source_user = spark.conf.get("dataone.source.username")
source_password = spark.conf.get("dataone.source.password")
target_catalog = spark.conf.get("dataone.target.catalog", "main")
target_schema = spark.conf.get("dataone.target.schema", "dataone_ingested")
source_table = spark.conf.get("dataone.source.table", "*")

jdbc_url = f"jdbc:mysql://{source_host}:{source_port}/{source_db}"
connection_properties = {"user": source_user, "password": source_password, "driver": "com.mysql.cj.jdbc.Driver"}

# Get list of tables
tables_df = spark.read.jdbc(jdbc_url, "information_schema.tables",
    properties={**connection_properties, "query": f"SELECT table_name FROM information_schema.tables WHERE table_schema='{source_db}'"})
tables = [row.table_name for row in tables_df.collect()]

for table in tables:
    df = spark.read.jdbc(jdbc_url, table, properties=connection_properties)
    # Data quality: drop exact duplicates, fill nulls for string cols
    df = df.dropDuplicates()
    string_cols = [f.name for f in df.schema.fields if str(f.dataType) == "StringType()"]
    for col in string_cols:
        df = df.fillna({col: ""})
    target_table = f"{target_catalog}.{target_schema}.{source_db}_{table}"
    df.write.format("delta").mode("overwrite").option("mergeSchema", "true").saveAsTable(target_table)
    print(f"[DataOne] Ingested {df.count()} rows into {target_table}")

print("[DataOne] MySQL ingestion complete")
''',

    "postgres": '''
import sys
from pyspark.sql import SparkSession

spark = SparkSession.builder.appName("DataOne_PostgreSQL_Ingestion").getOrCreate()

source_host = spark.conf.get("dataone.source.host")
source_port = spark.conf.get("dataone.source.port", "5432")
source_db = spark.conf.get("dataone.source.database")
source_user = spark.conf.get("dataone.source.username")
source_password = spark.conf.get("dataone.source.password")
target_catalog = spark.conf.get("dataone.target.catalog", "main")
target_schema = spark.conf.get("dataone.target.schema", "dataone_ingested")

jdbc_url = f"jdbc:postgresql://{source_host}:{source_port}/{source_db}"
props = {"user": source_user, "password": source_password, "driver": "org.postgresql.Driver"}

tables_query = "(SELECT table_name FROM information_schema.tables WHERE table_schema='public') t"
tables_df = spark.read.jdbc(jdbc_url, tables_query, properties=props)
tables = [row.table_name for row in tables_df.collect()]

for table in tables:
    df = spark.read.jdbc(jdbc_url, f"public.{table}", properties=props)
    df = df.dropDuplicates()
    target_table = f"{target_catalog}.{target_schema}.{source_db}_{table}"
    df.write.format("delta").mode("overwrite").option("mergeSchema", "true").saveAsTable(target_table)
    print(f"[DataOne] Ingested {df.count()} rows -> {target_table}")

print("[DataOne] PostgreSQL ingestion complete")
''',

    "mongodb": '''
from pyspark.sql import SparkSession

spark = SparkSession.builder.appName("DataOne_MongoDB_Ingestion").getOrCreate()

conn_str = spark.conf.get("dataone.source.connection_string")
source_db = spark.conf.get("dataone.source.database")
target_catalog = spark.conf.get("dataone.target.catalog", "main")
target_schema = spark.conf.get("dataone.target.schema", "dataone_ingested")
collections = spark.conf.get("dataone.source.collections", "").split(",")

for collection in [c.strip() for c in collections if c.strip()]:
    df = (spark.read.format("mongodb")
          .option("connection.uri", conn_str)
          .option("database", source_db)
          .option("collection", collection)
          .load())
    df = df.dropDuplicates()
    target_table = f"{target_catalog}.{target_schema}.{source_db}_{collection}"
    df.write.format("delta").mode("overwrite").option("mergeSchema", "true").saveAsTable(target_table)
    print(f"[DataOne] Ingested MongoDB collection {collection} -> {target_table}")

print("[DataOne] MongoDB ingestion complete")
''',

    "csv": '''
from pyspark.sql import SparkSession

spark = SparkSession.builder.appName("DataOne_CSV_Ingestion").getOrCreate()

csv_path = spark.conf.get("dataone.source.path")  # dbfs:// or s3:// or /Volumes/...
target_catalog = spark.conf.get("dataone.target.catalog", "main")
target_schema = spark.conf.get("dataone.target.schema", "dataone_ingested")
target_table_name = spark.conf.get("dataone.target.table", "csv_import")

df = spark.read.option("header", "true").option("inferSchema", "true").csv(csv_path)
df = df.dropDuplicates()
# Drop rows where ALL values are null
df = df.dropna(how="all")

target_table = f"{target_catalog}.{target_schema}.{target_table_name}"
df.write.format("delta").mode("overwrite").option("mergeSchema", "true").saveAsTable(target_table)
print(f"[DataOne] Ingested {df.count()} rows from CSV -> {target_table}")
''',

    "snowflake": '''
from pyspark.sql import SparkSession

spark = SparkSession.builder.appName("DataOne_Snowflake_Ingestion").getOrCreate()

sfUrl = spark.conf.get("dataone.source.host")
sfUser = spark.conf.get("dataone.source.username")
sfPassword = spark.conf.get("dataone.source.password")
sfDatabase = spark.conf.get("dataone.source.database")
sfSchema = spark.conf.get("dataone.source.schema", "PUBLIC")
sfWarehouse = spark.conf.get("dataone.source.warehouse", "COMPUTE_WH")
target_catalog = spark.conf.get("dataone.target.catalog", "main")
target_schema_name = spark.conf.get("dataone.target.schema", "dataone_ingested")

snowflake_opts = {
    "sfUrl": sfUrl, "sfUser": sfUser, "sfPassword": sfPassword,
    "sfDatabase": sfDatabase, "sfSchema": sfSchema, "sfWarehouse": sfWarehouse,
}

tables_df = (spark.read.format("net.snowflake.spark.snowflake")
    .options(**snowflake_opts)
    .option("query", f"SELECT table_name FROM information_schema.tables WHERE table_schema='{sfSchema}'")
    .load())

for row in tables_df.collect():
    table = row.TABLE_NAME
    df = (spark.read.format("net.snowflake.spark.snowflake")
          .options(**snowflake_opts).option("dbtable", table).load())
    df = df.dropDuplicates()
    target_table = f"{target_catalog}.{target_schema_name}.{sfDatabase}_{table}"
    df.write.format("delta").mode("overwrite").option("mergeSchema", "true").saveAsTable(target_table)
    print(f"[DataOne] Ingested {table} -> {target_table}")

print("[DataOne] Snowflake ingestion complete")
''',

    "sqlserver": '''
from pyspark.sql import SparkSession

spark = SparkSession.builder.appName("DataOne_SQLServer_Ingestion").getOrCreate()

source_host = spark.conf.get("dataone.source.host")
source_port = spark.conf.get("dataone.source.port", "1433")
source_db = spark.conf.get("dataone.source.database")
source_user = spark.conf.get("dataone.source.username")
source_password = spark.conf.get("dataone.source.password")
target_catalog = spark.conf.get("dataone.target.catalog", "main")
target_schema = spark.conf.get("dataone.target.schema", "dataone_ingested")

jdbc_url = f"jdbc:sqlserver://{source_host}:{source_port};databaseName={source_db};encrypt=true;trustServerCertificate=true"
props = {"user": source_user, "password": source_password, "driver": "com.microsoft.sqlserver.jdbc.SQLServerDriver"}

tables_df = spark.read.jdbc(jdbc_url,
    f"(SELECT table_name FROM information_schema.tables WHERE table_catalog='{source_db}' AND table_type='BASE TABLE') t",
    properties=props)

for row in tables_df.collect():
    table = row.table_name
    df = spark.read.jdbc(jdbc_url, f"dbo.{table}", properties=props)
    df = df.dropDuplicates()
    target_table = f"{target_catalog}.{target_schema}.{source_db}_{table}"
    df.write.format("delta").mode("overwrite").option("mergeSchema", "true").saveAsTable(target_table)
    print(f"[DataOne] Ingested {table} -> {target_table}")

print("[DataOne] SQL Server ingestion complete")
''',
}


SOURCE_TYPE_DISPLAY = {
    "mysql": "MySQL", "postgres": "PostgreSQL", "mongodb": "MongoDB",
    "csv": "CSV/S3", "snowflake": "Snowflake", "sqlserver": "SQL Server",
    "redshift": "Amazon Redshift", "oracle": "Oracle", "salesforce": "Salesforce",
}


def _get_workspace_client(token: Optional[str] = None):
    """Return a Databricks WorkspaceClient using provided token or env config."""
    try:
        from databricks.sdk import WorkspaceClient
        if token:
            return WorkspaceClient(
                host=settings.DATABRICKS_WORKSPACE_URL,
                token=token,
            )
        return WorkspaceClient(
            host=settings.DATABRICKS_WORKSPACE_URL,
            token=settings.DATABRICKS_ACCESS_TOKEN,
        )
    except Exception as e:
        logger.error("[databricks_ingestion] stage=get_client failed: %s", e)
        raise


def _build_job_params(source_conn: DBConnection, target_conn: Optional[DBConnection]) -> Dict[str, str]:
    """Build Databricks spark_conf params from DataOne connection objects."""
    params = {}
    cfg = source_conn.config or {}
    src_type = source_conn.type.lower()

    if src_type in ("mysql", "postgres", "sqlserver", "oracle"):
        params["dataone.source.host"] = cfg.get("host", "")
        params["dataone.source.port"] = str(cfg.get("port", ""))
        params["dataone.source.database"] = cfg.get("database", cfg.get("dbname", ""))
        params["dataone.source.username"] = cfg.get("username", cfg.get("user", ""))
        params["dataone.source.password"] = cfg.get("password", "")
    elif src_type == "mongodb":
        params["dataone.source.connection_string"] = cfg.get("connection_string",
            f"mongodb://{cfg.get('username','')}:{cfg.get('password','')}@{cfg.get('host','localhost')}:{cfg.get('port', 27017)}")
        params["dataone.source.database"] = cfg.get("database", "")
        params["dataone.source.collections"] = cfg.get("collections", "")
    elif src_type == "snowflake":
        params["dataone.source.host"] = cfg.get("account", cfg.get("host", "")) + ".snowflakecomputing.com"
        params["dataone.source.username"] = cfg.get("username", "")
        params["dataone.source.password"] = cfg.get("password", "")
        params["dataone.source.database"] = cfg.get("database", "")
        params["dataone.source.schema"] = cfg.get("schema", "PUBLIC")
        params["dataone.source.warehouse"] = cfg.get("warehouse", "COMPUTE_WH")
    elif src_type == "csv":
        params["dataone.source.path"] = cfg.get("path", cfg.get("url", ""))
        params["dataone.target.table"] = cfg.get("table_name", "csv_import")

    # Target params
    if target_conn:
        tcfg = target_conn.config or {}
        params["dataone.target.catalog"] = tcfg.get("catalog", "main")
        params["dataone.target.schema"] = tcfg.get("schema", "dataone_ingested")

    return params


class DatabricksIngestionService:
    """Service for creating and triggering Databricks ingestion pipelines from DataOne."""

    @staticmethod
    def get_or_create_pipeline(
        source_type: str,
        db: Session,
        user_token: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Idempotently get or create a Databricks Job for the given source type.
        Checks IngestionPipelineCatalog first; creates the Databricks Job if missing.
        Returns {job_id, job_name}.
        """
        logger.info("[databricks_ingestion] stage=get_or_create_pipeline source_type=%s", source_type)

        # Check local catalog first
        catalog_entry = (
            db.query(IngestionPipelineCatalog)
            .filter(IngestionPipelineCatalog.source_type == source_type)
            .first()
        )
        if catalog_entry:
            logger.info(
                "[databricks_ingestion] stage=reuse_existing_job job_id=%s",
                catalog_entry.databricks_job_id,
            )
            catalog_entry.last_used_at = datetime.utcnow()
            db.commit()
            return {
                "job_id": catalog_entry.databricks_job_id,
                "job_name": catalog_entry.job_name,
                "created": False,
            }

        # Get script for this source type (fallback to generic JDBC)
        script = INGESTION_SCRIPTS.get(source_type, INGESTION_SCRIPTS.get("mysql", ""))
        job_name = f"DataOne_{SOURCE_TYPE_DISPLAY.get(source_type, source_type.title())}_Ingestion"

        if not settings.DATABRICKS_WORKSPACE_URL or not settings.DATABRICKS_ACCESS_TOKEN:
            logger.warning(
                "[databricks_ingestion] stage=no_credentials — Databricks not configured, returning mock job_id"
            )
            # In dev/test mode without Databricks, store a mock entry
            mock_entry = IngestionPipelineCatalog(
                source_type=source_type,
                databricks_job_id=999000 + len(source_type),
                job_name=job_name,
                pipeline_type="mock",
            )
            db.add(mock_entry)
            db.commit()
            return {"job_id": mock_entry.databricks_job_id, "job_name": job_name, "created": True, "mock": True}

        try:
            ws = _get_workspace_client(user_token)

            # Create Databricks Job with embedded Python script
            from databricks.sdk.service.jobs import (
                JobSettings, Task, SparkPythonTask, JobCluster,
                ClusterSpec, AutoScale, RuntimeEngine,
            )

            job_settings = JobSettings(
                name=job_name,
                tasks=[
                    Task(
                        task_key="ingestion",
                        spark_python_task=SparkPythonTask(
                            python_file=f"dbfs:/dataone/scripts/{source_type}_ingestion.py",
                        ),
                        job_cluster_key="dataone_cluster",
                        timeout_seconds=7200,
                    )
                ],
                job_clusters=[
                    JobCluster(
                        job_cluster_key="dataone_cluster",
                        new_cluster=ClusterSpec(
                            spark_version="14.3.x-scala2.12",
                            node_type_id="Standard_DS3_v2",
                            autoscale=AutoScale(min_workers=1, max_workers=4),
                            runtime_engine=RuntimeEngine.PHOTON,
                        ),
                    )
                ],
            )

            # Upload the script to DBFS first
            try:
                import base64
                script_bytes = script.encode("utf-8")
                ws.dbfs.mkdirs("/dataone/scripts")
                ws.dbfs.put(
                    path=f"/dataone/scripts/{source_type}_ingestion.py",
                    contents=base64.b64encode(script_bytes).decode("utf-8"),
                    overwrite=True,
                )
                logger.info("[databricks_ingestion] stage=script_uploaded source_type=%s", source_type)
            except Exception as upload_err:
                logger.warning("[databricks_ingestion] stage=script_upload_failed: %s", upload_err)

            created_job = ws.jobs.create(**job_settings.__dict__)
            job_id = created_job.job_id

            logger.info("[databricks_ingestion] stage=job_created job_id=%s source_type=%s", job_id, source_type)

            # Persist to catalog
            catalog_entry = IngestionPipelineCatalog(
                source_type=source_type,
                databricks_job_id=job_id,
                job_name=job_name,
                pipeline_type="job",
                last_used_at=datetime.utcnow(),
            )
            db.add(catalog_entry)
            db.commit()

            return {"job_id": job_id, "job_name": job_name, "created": True}

        except Exception as e:
            logger.error("[databricks_ingestion] stage=create_pipeline_failed source_type=%s: %s", source_type, e)
            raise

    @staticmethod
    def trigger_ingestion(
        source_connection_id: int,
        target_connection_id: Optional[int],
        db: Session,
        actor: str,
        user_token: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Trigger a Databricks ingestion job for the given source/target connections.
        Returns IngestionRun record dict with databricks_run_id.
        """
        logger.info(
            "[databricks_ingestion] stage=trigger source=%s target=%s actor=%s",
            source_connection_id, target_connection_id, actor,
        )

        # Fetch connections
        source_conn = db.query(DBConnection).filter(
            DBConnection.id == source_connection_id, DBConnection.is_deleted == False
        ).first()
        if not source_conn:
            raise ValueError(f"Source connection {source_connection_id} not found")

        target_conn = None
        if target_connection_id:
            target_conn = db.query(DBConnection).filter(
                DBConnection.id == target_connection_id, DBConnection.is_deleted == False
            ).first()

        source_type = source_conn.type.lower()

        # Get or create the Databricks job
        pipeline_info = DatabricksIngestionService.get_or_create_pipeline(
            source_type, db, user_token=user_token
        )
        job_id = pipeline_info["job_id"]
        is_mock = pipeline_info.get("mock", False)

        # Build params
        params = _build_job_params(source_conn, target_conn)

        # Create IngestionRun record
        run_record = IngestionRun(
            source_type=source_type,
            source_connection_id=source_connection_id,
            target_connection_id=target_connection_id,
            databricks_job_id=job_id,
            status="pending",
            actor=actor,
            trigger_params=params,
        )
        db.add(run_record)
        db.flush()  # get run_record.id

        if is_mock:
            # Dev mode — simulate a run
            run_record.databricks_run_id = 99900000 + run_record.id
            run_record.status = "running"
            run_record.databricks_run_url = "https://mock.databricks.com/run"
            db.commit()
            logger.info("[databricks_ingestion] stage=mock_run id=%s", run_record.id)
            return _run_to_dict(run_record)

        try:
            ws = _get_workspace_client(user_token)

            # Trigger job run with spark_conf overrides
            from databricks.sdk.service.jobs import RunNow, SparkConfPair
            run_response = ws.jobs.run_now(
                job_id=job_id,
                job_parameters=params,
            )
            databricks_run_id = run_response.run_id

            # Build run URL
            run_url = f"{settings.DATABRICKS_WORKSPACE_URL}#job/{job_id}/run/{databricks_run_id}"

            run_record.databricks_run_id = databricks_run_id
            run_record.status = "running"
            run_record.databricks_run_url = run_url
            db.commit()

            logger.info(
                "[databricks_ingestion] stage=triggered run_id=%s job_id=%s source=%s",
                databricks_run_id, job_id, source_type,
            )

            return _run_to_dict(run_record)

        except Exception as e:
            run_record.status = "failed"
            run_record.error_message = str(e)
            db.commit()
            logger.error("[databricks_ingestion] stage=trigger_failed: %s", e)
            raise

    @staticmethod
    def get_run_status(
        ingestion_run_id: int,
        db: Session,
        user_token: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Get the latest status of an ingestion run.
        Syncs status from Databricks if run_id is available.
        """
        logger.info("[databricks_ingestion] stage=get_status ingestion_run_id=%s", ingestion_run_id)

        run_record = db.query(IngestionRun).filter(IngestionRun.id == ingestion_run_id).first()
        if not run_record:
            raise ValueError(f"IngestionRun {ingestion_run_id} not found")

        # If terminal status, return cached
        if run_record.status in ("succeeded", "failed", "cancelled"):
            return _run_to_dict(run_record)

        # If no Databricks run_id or mock mode, return as-is
        if not run_record.databricks_run_id or run_record.databricks_run_id >= 99900000:
            return _run_to_dict(run_record)

        try:
            ws = _get_workspace_client(user_token)
            run_info = ws.jobs.get_run(run_id=run_record.databricks_run_id)

            state = run_info.state
            life_cycle = state.life_cycle_state.value if state and state.life_cycle_state else "RUNNING"
            result_state = state.result_state.value if state and state.result_state else None

            # Map Databricks states to DataOne states
            if life_cycle in ("PENDING", "WAITING_FOR_RETRY"):
                new_status = "pending"
            elif life_cycle in ("RUNNING", "BLOCKED"):
                new_status = "running"
            elif life_cycle == "TERMINATED":
                new_status = "succeeded" if result_state == "SUCCESS" else "failed"
            elif life_cycle == "SKIPPED":
                new_status = "cancelled"
            else:
                new_status = "running"

            run_record.status = new_status
            if new_status in ("succeeded", "failed", "cancelled"):
                run_record.completed_at = datetime.utcnow()
                if result_state != "SUCCESS" and state:
                    run_record.error_message = state.state_message

            db.commit()
            logger.info(
                "[databricks_ingestion] stage=status_synced run_id=%s status=%s",
                run_record.databricks_run_id, new_status,
            )

        except Exception as e:
            logger.warning("[databricks_ingestion] stage=status_sync_failed (non-fatal): %s", e)

        return _run_to_dict(run_record)

    @staticmethod
    def list_pipelines(db: Session) -> list:
        """List all pre-created ingestion pipelines from the catalog."""
        return [
            {
                "id": c.id,
                "source_type": c.source_type,
                "job_id": c.databricks_job_id,
                "job_name": c.job_name,
                "pipeline_type": c.pipeline_type,
                "last_used_at": c.last_used_at.isoformat() if c.last_used_at else None,
            }
            for c in db.query(IngestionPipelineCatalog).all()
        ]

    @staticmethod
    def trigger_genie(
        question: str,
        db: Session,
        actor: str,
        space_id: Optional[str] = None,
        user_token: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Trigger Databricks Genie AI for natural language queries.
        """
        logger.info("[databricks_ingestion] stage=genie question_len=%d actor=%s", len(question), actor)

        effective_space_id = space_id or settings.DATABRICKS_GENIE_SPACE_ID
        if not effective_space_id:
            return {"error": "DATABRICKS_GENIE_SPACE_ID not configured", "answer": None}

        try:
            ws = _get_workspace_client(user_token)
            # Databricks Genie API (preview)
            genie = ws.genie
            conversation = genie.start_conversation_and_wait(
                space_id=effective_space_id,
                content=question,
            )
            message = conversation.messages[-1] if conversation.messages else None
            answer = None
            if message and message.attachments:
                for att in message.attachments:
                    if hasattr(att, "text") and att.text:
                        answer = att.text.content
                        break
                    elif hasattr(att, "query") and att.query:
                        answer = f"SQL: {att.query.query}"
                        break
            return {
                "conversation_id": conversation.conversation_id,
                "answer": answer or "No answer returned from Genie",
                "space_id": effective_space_id,
            }
        except Exception as e:
            logger.error("[databricks_ingestion] stage=genie_failed: %s", e)
            return {"error": str(e), "answer": None}


def _run_to_dict(run: IngestionRun) -> Dict[str, Any]:
    """Serialize an IngestionRun to a dict."""
    return {
        "id": run.id,
        "databricks_run_id": run.databricks_run_id,
        "databricks_job_id": run.databricks_job_id,
        "source_type": run.source_type,
        "source_connection_id": run.source_connection_id,
        "target_connection_id": run.target_connection_id,
        "status": run.status,
        "rows_ingested": run.rows_ingested,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        "error_message": run.error_message,
        "actor": run.actor,
        "databricks_run_url": run.databricks_run_url,
    }


# Global singleton
databricks_ingestion_service = DatabricksIngestionService()
