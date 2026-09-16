import re
with open("backend/app/services/databricks_ingestion_service.py", "r") as f:
    content = f.read()

mongo_script = '''
# Databricks notebook source
# COMMAND ----------
%pip install pymongo pandas
dbutils.library.restartPython()

# COMMAND ----------
import sys
import pymongo
import pandas as pd
from pyspark.sql import SparkSession

spark = SparkSession.builder.appName("DataOne_MongoDB_Ingestion").getOrCreate()

source_host = dbutils.widgets.get("dataone.source.host")
source_port = dbutils.widgets.get("dataone.source.port")
if not source_port: source_port = "27017"
source_db = dbutils.widgets.get("dataone.source.database")
source_user = dbutils.widgets.get("dataone.source.username")
source_password = dbutils.widgets.get("dataone.source.password")
target_catalog = dbutils.widgets.get("dataone.target.catalog")
if not target_catalog: target_catalog = "workspace"
target_schema = dbutils.widgets.get("dataone.target.schema")
if not target_schema: target_schema = "default"

print(f"Connecting to MongoDB at {source_host}:{source_port}...")
mongo_uri = f"mongodb://{source_user}:{source_password}@{source_host}:{source_port}/?authSource={source_db}"
client = pymongo.MongoClient(mongo_uri)
db = client[source_db]

try:
    collections = db.list_collection_names()
    
    for coll in collections:
        print(f"Extracting {coll}...")
        cursor = db[coll].find()
        
        # Convert to pandas
        records = list(cursor)
        if not records:
            print(f"Collection {coll} is empty. Skipping.")
            continue
            
        # Convert ObjectIds to strings
        for doc in records:
            if "_id" in doc:
                doc["_id"] = str(doc["_id"])
                
        df_pd = pd.DataFrame(records)
        # Convert any nested dicts/lists to strings to prevent PySpark schema issues
        for col in df_pd.columns:
            if df_pd[col].dtype == 'object':
                df_pd[col] = df_pd[col].astype(str)
                
        df = spark.createDataFrame(df_pd)
        df = df.dropDuplicates()
        
        target_table = f"{target_catalog}.{target_schema}.{source_db}_{coll}"
        
        spark.sql(f"CREATE SCHEMA IF NOT EXISTS {target_catalog}.{target_schema}")
        df.write.format("delta").mode("overwrite").option("mergeSchema", "true").saveAsTable(target_table)
        print(f"[DataOne] Ingested {df.count()} rows into {target_table}")
finally:
    client.close()

print("[DataOne] MongoDB ingestion complete")
'''

content = re.sub(r'    "mongodb": \'\'\'[\s\S]*?\'\'\',', f'    "mongodb": \'\'\'{mongo_script}\'\'\',', content)

with open("backend/app/services/databricks_ingestion_service.py", "w") as f:
    f.write(content)
