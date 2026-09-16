import re
with open("backend/app/services/databricks_ingestion_service.py", "r") as f:
    content = f.read()

content = content.replace("notebook_path=f\"/Workspace{script_path}\"", "notebook_path=script_path")

with open("backend/app/services/databricks_ingestion_service.py", "w") as f:
    f.write(content)
