import re
with open("backend/app/services/databricks_ingestion_service.py", "r") as f:
    content = f.read()

# Remove the task_libraries block
content = re.sub(r"            task_libraries = \[\]\n            if source_type == \"mysql\":\n                task_libraries\.append\(Library\(maven=MavenLibrary\(coordinates=\"mysql:mysql-connector-java:8\.0\.33\"\)\)\)\n            elif source_type == \"postgres\":\n                task_libraries\.append\(Library\(maven=MavenLibrary\(coordinates=\"org\.postgresql:postgresql:42\.6\.0\"\)\)\)\n            elif source_type == \"mongodb\":\n                task_libraries\.append\(Library\(maven=MavenLibrary\(coordinates=\"org\.mongodb\.spark:mongo-spark-connector_2\.12:3\.0\.2\"\)\)\)\n\n", "", content)

# Remove the libraries param from NotebookTask
content = re.sub(r"                        libraries=task_libraries if task_libraries else None,\n", "", content)

with open("backend/app/services/databricks_ingestion_service.py", "w") as f:
    f.write(content)
