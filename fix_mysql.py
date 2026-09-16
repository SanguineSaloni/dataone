import re

with open("backend/app/services/databricks_ingestion_service.py", "r") as f:
    content = f.read()

mysql_repl = """tables = [row[0] for row in tables_df.collect()]"""

content = re.sub(r"tables = \[row\.table_name or row\.TABLE_NAME for row in tables_df\.collect\(\)\]", mysql_repl, content)

with open("backend/app/services/databricks_ingestion_service.py", "w") as f:
    f.write(content)
