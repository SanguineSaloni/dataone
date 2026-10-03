import re

with open("backend/app/connectors/databricks_connector.py", "r") as f:
    content = f.read()

# Replace listTables with SHOW TABLES for live fetch
content = content.replace(
    'spark_tables = spark.catalog.listTables(f"{catalog}.{schema}")\n        tables = [t.name for t in spark_tables if not t.isTemporary]',
    'df = spark.sql(f"SHOW TABLES IN `{catalog}`.`{schema}`")\n        tables = [row.tableName for row in df.collect() if not row.isTemporary]'
)

with open("backend/app/connectors/databricks_connector.py", "w") as f:
    f.write(content)

