import re
with open("backend/app/services/databricks_ingestion_service.py", "r") as f:
    content = f.read()

content = content.replace("spark.conf.get(\"dataone.target.catalog\", \"main\")", "spark.conf.get(\"dataone.target.catalog\", \"workspace\")")
content = content.replace("tcfg.get(\"catalog\", \"main\")", "tcfg.get(\"catalog\", \"workspace\")")
content = content.replace("params.get(\"dataone.target.catalog\", \"main\")", "params.get(\"dataone.target.catalog\", \"workspace\")")

with open("backend/app/services/databricks_ingestion_service.py", "w") as f:
    f.write(content)
