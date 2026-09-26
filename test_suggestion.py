import sys
import os

# Ensure backend modules can be imported
sys.path.insert(0, os.path.abspath("backend"))
os.environ["DATABASE_URL"] = "postgresql://dataone:Salonii%40123@ep-mute-moon-d8ql2bc9.database.us-east-2.cloud.databricks.com/databricks_postgres?sslmode=require"
os.environ["DATABRICKS_APP_PORT"] = "1"
os.environ["DISABLE_CELERY"] = "true"

from app.workers.mapping_tasks import suggest_mappings_task
print(suggest_mappings_task(2))
