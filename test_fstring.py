catalog = "dataone_3_mysql_catalog"
schema = "default"

code = f"""
import json
from pyspark.sql import SparkSession
spark = SparkSession.builder.getOrCreate()
try:
    tables = []
    try:
        spark_tables = spark.catalog.listTables(f"{catalog}.{schema}")
        tables = [t.name for t in spark_tables if not t.isTemporary]
    except Exception as e:
        if "SCHEMA_NOT_FOUND" in str(e) or "NOT_FOUND" in str(e):
            dbs = spark.catalog.listDatabases("{catalog}")
            for db in dbs:
                if db.name.lower() in ("information_schema", "app_database", "mysql", "performance_schema", "sys"): continue
                for t in spark.catalog.listTables(f"{catalog}.{{db.name}}"):
                    if not t.isTemporary:
                        tables.append(f"{{db.name}}.{{t.name}}")
        else:
            raise e
    print(json.dumps(tables))
except Exception as e:
    print(json.dumps({{"_error": str(e)}}))
"""

print(code)
