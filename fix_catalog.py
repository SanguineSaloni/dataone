import re
with open("backend/app/services/databricks_ingestion_service.py", "r") as f:
    content = f.read()

content = content.replace("target_catalog or \"main\"", "target_catalog or \"workspace\"")
content = content.replace("target_catalog = \"main\"", "target_catalog = \"workspace\"")

with open("backend/app/services/databricks_ingestion_service.py", "w") as f:
    f.write(content)
