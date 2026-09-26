import sys
import os

sys.path.insert(0, os.path.abspath("backend"))
os.environ["DATABASE_URL"] = "postgresql://dataone:Salonii%40123@ep-mute-moon-d8ql2bc9.database.us-east-2.cloud.databricks.com/databricks_postgres?sslmode=require"

from sqlalchemy import create_engine, text
engine = create_engine(os.environ["DATABASE_URL"])
with engine.connect() as conn:
    conn.execute(text("DROP TABLE IF EXISTS schema_snapshots CASCADE;"))
    conn.commit()
    print("Dropped schema_snapshots table successfully!")
