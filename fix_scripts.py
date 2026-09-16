import re

with open("backend/app/services/databricks_ingestion_service.py", "r") as f:
    content = f.read()

mysql_script = '''
# Databricks notebook source
# COMMAND ----------
%pip install pymysql pandas
dbutils.library.restartPython()

# COMMAND ----------
import sys
import pymysql
import pandas as pd
from pyspark.sql import SparkSession

spark = SparkSession.builder.appName("DataOne_MySQL_Ingestion").getOrCreate()

source_host = dbutils.widgets.get("dataone.source.host")
source_port = dbutils.widgets.get("dataone.source.port")
if not source_port: source_port = "3306"
source_db = dbutils.widgets.get("dataone.source.database")
source_user = dbutils.widgets.get("dataone.source.username")
source_password = dbutils.widgets.get("dataone.source.password")
target_catalog = dbutils.widgets.get("dataone.target.catalog")
if not target_catalog: target_catalog = "workspace"
target_schema = dbutils.widgets.get("dataone.target.schema")
if not target_schema: target_schema = "default"

print(f"Connecting to MySQL at {source_host}:{source_port}...")
conn = pymysql.connect(host=source_host, port=int(source_port), user=source_user, password=source_password, database=source_db)

try:
    tables_df = pd.read_sql(f"SELECT table_name FROM information_schema.tables WHERE table_schema='{source_db}'", conn)
    tables = tables_df.iloc[:, 0].tolist()

    for table in tables:
        print(f"Extracting {table}...")
        df_pd = pd.read_sql(f"SELECT * FROM {table}", conn)
        
        if df_pd.empty:
            print(f"Table {table} is empty. Skipping.")
            continue
            
        df = spark.createDataFrame(df_pd)
        df = df.dropDuplicates()
        
        target_table = f"{target_catalog}.{target_schema}.{source_db}_{table}"
        
        # Ensure schema exists
        spark.sql(f"CREATE SCHEMA IF NOT EXISTS {target_catalog}.{target_schema}")
        
        df.write.format("delta").mode("overwrite").option("mergeSchema", "true").saveAsTable(target_table)
        print(f"[DataOne] Ingested {df.count()} rows into {target_table}")
finally:
    conn.close()

print("[DataOne] MySQL ingestion complete")
'''

content = re.sub(r'    "mysql": \'\'\'[\s\S]*?\'\'\',', f'    "mysql": \'\'\'{mysql_script}\'\'\',', content)

with open("backend/app/services/databricks_ingestion_service.py", "w") as f:
    f.write(content)
