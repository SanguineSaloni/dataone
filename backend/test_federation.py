from app.core.database import SessionLocal
from app.models.connection import DBConnection
from app.services.databricks_ingestion_service import DatabricksIngestionService

db = SessionLocal()
# Create a dummy postgres connection
conn = DBConnection(
    name="test_target_postgres",
    type="postgres",
    environment="prod",
    config={
        "host": "database-1.c50uus42awel.ap-south-1.rds.amazonaws.com",
        "port": "5432",
        "dbname": "postgres",
        "user": "postgres",
        "password": "Vaibhav123"
    }
)
db.add(conn)
db.commit()

try:
    print(f"Testing Federation for connection {conn.id}...")
    DatabricksIngestionService.setup_lakehouse_federation(source_conn=conn, actor="system")
    print("Success!")
except Exception as e:
    print(f"Failed: {e}")

# clean up
db.delete(conn)
db.commit()
