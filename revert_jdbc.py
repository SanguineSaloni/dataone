import re

with open("backend/app/services/databricks_ingestion_service.py", "r") as f:
    content = f.read()

mysql_script = '''
# Databricks notebook source
# COMMAND ----------
import sys
from pyspark.sql import SparkSession

spark = SparkSession.builder.appName("DataOne_MySQL_Ingestion").getOrCreate()

# Safely fetch widgets without a wrapper function to prevent PySpark pickling dbutils
try:
    source_host = dbutils.widgets.get("dataone.source.host")
except:
    source_host = None
    
source_port = "3306"
try:
    source_port = dbutils.widgets.get("dataone.source.port") or "3306"
except:
    pass
    
try:
    source_db = dbutils.widgets.get("dataone.source.database")
    source_user = dbutils.widgets.get("dataone.source.username")
    source_password = dbutils.widgets.get("dataone.source.password")
except:
    pass

target_catalog = "workspace"
try:
    target_catalog = dbutils.widgets.get("dataone.target.catalog") or "workspace"
except:
    pass
    
target_schema = "dataone_ingested"
try:
    target_schema = dbutils.widgets.get("dataone.target.schema") or "dataone_ingested"
except:
    pass

jdbc_url = f"jdbc:mysql://{source_host}:{source_port}/{source_db}"
connection_properties = {"user": source_user, "password": source_password, "driver": "com.mysql.cj.jdbc.Driver"}

# Get list of tables safely using PySpark subquery to avoid option conflicts
tables_query = f"(SELECT table_name FROM information_schema.tables WHERE table_schema='{source_db}') t"
tables_df = spark.read.jdbc(jdbc_url, tables_query, properties=connection_properties)
tables = [row[0] for row in tables_df.collect()]

for table in tables:
    df = spark.read.jdbc(jdbc_url, table, properties=connection_properties)
    # Data quality: drop exact duplicates, fill nulls for string cols
    df = df.dropDuplicates()
    string_cols = [f.name for f in df.schema.fields if str(f.dataType) == "StringType()"]
    for col in string_cols:
        df = df.fillna({col: ""})
    target_table = f"{target_catalog}.{target_schema}.{source_db}_{table}"
    
    spark.sql(f"CREATE SCHEMA IF NOT EXISTS {target_catalog}.{target_schema}")
    df.write.format("delta").mode("overwrite").option("mergeSchema", "true").saveAsTable(target_table)
    print(f"[DataOne] Ingested {df.count()} rows into {target_table}")

print("[DataOne] MySQL ingestion complete")
'''

pg_script = '''
# Databricks notebook source
# COMMAND ----------
import sys
from pyspark.sql import SparkSession

spark = SparkSession.builder.appName("DataOne_PostgreSQL_Ingestion").getOrCreate()

try:
    source_host = dbutils.widgets.get("dataone.source.host")
except:
    source_host = None
    
source_port = "5432"
try:
    source_port = dbutils.widgets.get("dataone.source.port") or "5432"
except:
    pass
    
try:
    source_db = dbutils.widgets.get("dataone.source.database")
    source_user = dbutils.widgets.get("dataone.source.username")
    source_password = dbutils.widgets.get("dataone.source.password")
except:
    pass

target_catalog = "workspace"
try:
    target_catalog = dbutils.widgets.get("dataone.target.catalog") or "workspace"
except:
    pass
    
target_schema = "dataone_ingested"
try:
    target_schema = dbutils.widgets.get("dataone.target.schema") or "dataone_ingested"
except:
    pass

jdbc_url = f"jdbc:postgresql://{source_host}:{source_port}/{source_db}"
props = {"user": source_user, "password": source_password, "driver": "org.postgresql.Driver"}

tables_query = "(SELECT table_name FROM information_schema.tables WHERE table_schema='public') t"
tables_df = spark.read.jdbc(jdbc_url, tables_query, properties=props)
tables = [row[0] for row in tables_df.collect()]

for table in tables:
    df = spark.read.jdbc(jdbc_url, f"public.{table}", properties=props)
    df = df.dropDuplicates()
    string_cols = [f.name for f in df.schema.fields if str(f.dataType) == "StringType()"]
    for col in string_cols:
        df = df.fillna({col: ""})
        
    target_table = f"{target_catalog}.{target_schema}.{source_db}_{table}"
    spark.sql(f"CREATE SCHEMA IF NOT EXISTS {target_catalog}.{target_schema}")
    df.write.format("delta").mode("overwrite").option("mergeSchema", "true").saveAsTable(target_table)
    print(f"[DataOne] Ingested {df.count()} rows into {target_table}")

print("[DataOne] PostgreSQL ingestion complete")
'''

# Wait, MongoDB uses mongo-spark-connector which is not a standard JDBC!
# If mongo-spark-connector is NOT preinstalled on Serverless, PySpark will crash for MongoDB.
# I will keep MongoDB as pure Python pymongo since MongoDB data is generally NoSQL JSON which Pandas handles very well and usually is smaller datasets or we can paginate it.
# Actually, I'll keep the pymongo script! It's much safer for MongoDB since we definitely know the JAR is NOT preinstalled natively on all Serverless instances.

content = re.sub(r'    "mysql": \'\'\'[\s\S]*?\'\'\',', f'    "mysql": \'\'\'{mysql_script}\'\'\',', content)
content = re.sub(r'    "postgres": \'\'\'[\s\S]*?\'\'\',', f'    "postgres": \'\'\'{pg_script}\'\'\',', content)

with open("backend/app/services/databricks_ingestion_service.py", "w") as f:
    f.write(content)
