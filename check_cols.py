import sys, os
os.environ["DATABASE_URL"] = "postgresql://dataone:Salonii%40123@ep-mute-moon-d8ql2bc9.database.us-east-2.cloud.databricks.com/databricks_postgres?sslmode=require"
from sqlalchemy import create_engine, inspect
engine = create_engine(os.environ["DATABASE_URL"])
print(inspect(engine).get_columns("schema_snapshots"))
