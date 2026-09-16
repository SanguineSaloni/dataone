import re

with open("backend/app/services/databricks_ingestion_service.py", "r") as f:
    content = f.read()

# Replace mysql params
mysql_repl = """
import sys
import os
import argparse
from pyspark.sql import SparkSession

parser = argparse.ArgumentParser()
parser.add_argument("--source_host")
parser.add_argument("--source_port", default="3306")
parser.add_argument("--source_database")
parser.add_argument("--source_username")
parser.add_argument("--source_password")
parser.add_argument("--target_catalog", default="main")
parser.add_argument("--target_schema", default="dataone_ingested")
args, _ = parser.parse_known_args()

spark = SparkSession.builder.appName("DataOne_MySQL_Ingestion").getOrCreate()

source_host = args.source_host
source_port = args.source_port
source_db = args.source_database
source_user = args.source_username
source_password = args.source_password
target_catalog = args.target_catalog
target_schema = args.target_schema
"""

content = re.sub(r"import sys\nimport os\nfrom pyspark\.sql import SparkSession\n\nspark = SparkSession\.builder\.appName\(\"DataOne_MySQL_Ingestion\"\)\.getOrCreate\(\)\n\n# Read params from Databricks job config\nsource_host = spark\.conf\.get\(\"dataone\.source\.host\"\)\nsource_port = spark\.conf\.get\(\"dataone\.source\.port\", \"3306\"\)\nsource_db = spark\.conf\.get\(\"dataone\.source\.database\"\)\nsource_user = spark\.conf\.get\(\"dataone\.source\.username\"\)\nsource_password = spark\.conf\.get\(\"dataone\.source\.password\"\)\ntarget_catalog = spark\.conf\.get\(\"dataone\.target\.catalog\", \"main\"\)\ntarget_schema = spark\.conf\.get\(\"dataone\.target\.schema\", \"dataone_ingested\"\)\nsource_table = spark\.conf\.get\(\"dataone\.source\.table\", \"\*\"\)", mysql_repl.strip(), content, flags=re.MULTILINE)

postgres_repl = """
import sys
import argparse
from pyspark.sql import SparkSession

parser = argparse.ArgumentParser()
parser.add_argument("--source_host")
parser.add_argument("--source_port", default="5432")
parser.add_argument("--source_database")
parser.add_argument("--source_username")
parser.add_argument("--source_password")
parser.add_argument("--target_catalog", default="main")
parser.add_argument("--target_schema", default="dataone_ingested")
args, _ = parser.parse_known_args()

spark = SparkSession.builder.appName("DataOne_PostgreSQL_Ingestion").getOrCreate()

source_host = args.source_host
source_port = args.source_port
source_db = args.source_database
source_user = args.source_username
source_password = args.source_password
target_catalog = args.target_catalog
target_schema = args.target_schema
"""

content = re.sub(r"import sys\nfrom pyspark\.sql import SparkSession\n\nspark = SparkSession\.builder\.appName\(\"DataOne_PostgreSQL_Ingestion\"\)\.getOrCreate\(\)\n\nsource_host = spark\.conf\.get\(\"dataone\.source\.host\"\)\nsource_port = spark\.conf\.get\(\"dataone\.source\.port\", \"5432\"\)\nsource_db = spark\.conf\.get\(\"dataone\.source\.database\"\)\nsource_user = spark\.conf\.get\(\"dataone\.source\.username\"\)\nsource_password = spark\.conf\.get\(\"dataone\.source\.password\"\)\ntarget_catalog = spark\.conf\.get\(\"dataone\.target\.catalog\", \"main\"\)\ntarget_schema = spark\.conf\.get\(\"dataone\.target\.schema\", \"dataone_ingested\"\)", postgres_repl.strip(), content, flags=re.MULTILINE)

mongo_repl = """
import argparse
from pyspark.sql import SparkSession

parser = argparse.ArgumentParser()
parser.add_argument("--source_connection_string")
parser.add_argument("--source_database")
parser.add_argument("--target_catalog", default="main")
parser.add_argument("--target_schema", default="dataone_ingested")
parser.add_argument("--source_collections", default="")
args, _ = parser.parse_known_args()

spark = SparkSession.builder.appName("DataOne_MongoDB_Ingestion").getOrCreate()

conn_str = args.source_connection_string
source_db = args.source_database
target_catalog = args.target_catalog
target_schema = args.target_schema
collections = args.source_collections.split(",")
"""

content = re.sub(r"from pyspark\.sql import SparkSession\n\nspark = SparkSession\.builder\.appName\(\"DataOne_MongoDB_Ingestion\"\)\.getOrCreate\(\)\n\nconn_str = spark\.conf\.get\(\"dataone\.source\.connection_string\"\)\nsource_db = spark\.conf\.get\(\"dataone\.source\.database\"\)\ntarget_catalog = spark\.conf\.get\(\"dataone\.target\.catalog\", \"main\"\)\ntarget_schema = spark\.conf\.get\(\"dataone\.target\.schema\", \"dataone_ingested\"\)\ncollections = spark\.conf\.get\(\"dataone\.source\.collections\", \"\"\)\.split\(\",\"\)", mongo_repl.strip(), content, flags=re.MULTILINE)


trigger_repl = """            python_params = []
            for k, v in params.items():
                arg_name = "--" + k.replace("dataone.", "").replace(".", "_")
                python_params.extend([arg_name, str(v)])

            run_response = ws.jobs.run_now(
                job_id=job_id,
                python_params=python_params,
            )"""

content = re.sub(r"            run_response = ws\.jobs\.run_now\(\n                job_id=job_id,\n                job_parameters=params,\n            \)", trigger_repl, content)

with open("backend/app/services/databricks_ingestion_service.py", "w") as f:
    f.write(content)

