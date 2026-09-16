import re

with open("backend/app/services/databricks_ingestion_service.py", "r") as f:
    content = f.read()

mysql_repl = """
# Databricks notebook source
# COMMAND ----------
import sys
import os
from pyspark.sql import SparkSession

spark = SparkSession.builder.appName("DataOne_MySQL_Ingestion").getOrCreate()

def get_param(name, default_val=None):
    try:
        val = dbutils.widgets.get(name)
        return val if val else default_val
    except:
        return default_val

source_host = get_param("dataone.source.host")
source_port = get_param("dataone.source.port", "3306")
source_db = get_param("dataone.source.database")
source_user = get_param("dataone.source.username")
source_password = get_param("dataone.source.password")
target_catalog = get_param("dataone.target.catalog", "main")
target_schema = get_param("dataone.target.schema", "dataone_ingested")
"""

content = re.sub(r"import sys\nimport os\nimport argparse\nfrom pyspark\.sql import SparkSession[\s\S]*?target_schema = args\.target_schema", mysql_repl.strip(), content, flags=re.MULTILINE)

postgres_repl = """
# Databricks notebook source
# COMMAND ----------
import sys
from pyspark.sql import SparkSession

spark = SparkSession.builder.appName("DataOne_PostgreSQL_Ingestion").getOrCreate()

def get_param(name, default_val=None):
    try:
        val = dbutils.widgets.get(name)
        return val if val else default_val
    except:
        return default_val

source_host = get_param("dataone.source.host")
source_port = get_param("dataone.source.port", "5432")
source_db = get_param("dataone.source.database")
source_user = get_param("dataone.source.username")
source_password = get_param("dataone.source.password")
target_catalog = get_param("dataone.target.catalog", "main")
target_schema = get_param("dataone.target.schema", "dataone_ingested")
"""
content = re.sub(r"import sys\nimport argparse\nfrom pyspark\.sql import SparkSession[\s\S]*?target_schema = args\.target_schema", postgres_repl.strip(), content, flags=re.MULTILINE)


mongo_repl = """
# Databricks notebook source
# COMMAND ----------
from pyspark.sql import SparkSession

spark = SparkSession.builder.appName("DataOne_MongoDB_Ingestion").getOrCreate()

def get_param(name, default_val=None):
    try:
        val = dbutils.widgets.get(name)
        return val if val else default_val
    except:
        return default_val

conn_str = get_param("dataone.source.connection_string")
source_db = get_param("dataone.source.database")
target_catalog = get_param("dataone.target.catalog", "main")
target_schema = get_param("dataone.target.schema", "dataone_ingested")
collections = get_param("dataone.source.collections", "").split(",")
"""
content = re.sub(r"import argparse\nfrom pyspark\.sql import SparkSession[\s\S]*?collections = args\.source_collections\.split\(\",\"\)", mongo_repl.strip(), content, flags=re.MULTILINE)

task_repl = """            # Create Databricks Job with embedded Python Notebook
            from databricks.sdk.service.jobs import (
                JobSettings, Task, NotebookTask
            )
            from databricks.sdk.service.workspace import ImportFormat
            from databricks.sdk.service.workspace import Language
            
            script_path = f"/Shared/DataOne/Scripts/{source_type}_ingestion.py"

            # Use Serverless compute by defining a NotebookTask
            job_settings = JobSettings(
                name=job_name,
                tasks=[
                    Task(
                        task_key="ingestion",
                        notebook_task=NotebookTask(
                            notebook_path=f"/Workspace{script_path}",
                            source="WORKSPACE"
                        ),
                        timeout_seconds=7200,
                    )
                ],
            )"""

content = re.sub(r"            # Create Databricks Job with embedded Python script[\s\S]*?timeout_seconds=7200,\n                    \)\n                \],\n            \)", task_repl, content)

trigger_repl = """            # Trigger job run with notebook_params
            run_response = ws.jobs.run_now(
                job_id=job_id,
                notebook_params={k: str(v) for k, v in params.items()},
            )"""
content = re.sub(r"            # Trigger job run with spark_conf overrides[\s\S]*?python_params=python_params,\n            \)", trigger_repl, content)

import_repl = """                ws.workspace.import_(
                    path=script_path,
                    format=ImportFormat.SOURCE,
                    language=Language.PYTHON,
                    content=base64.b64encode(script_bytes).decode("utf-8"),
                    overwrite=True,
                )"""
content = re.sub(r"                ws\.workspace\.import_\([\s\S]*?overwrite=True,\n                \)", import_repl, content)

with open("backend/app/services/databricks_ingestion_service.py", "w") as f:
    f.write(content)

