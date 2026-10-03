import os
from databricks.sdk import WorkspaceClient
from databricks.sdk.service import catalog

print("Testing Databricks SDK connection...")
try:
    ws = WorkspaceClient()
    print("WorkspaceClient initialized.")
    options = {
        "host": "database-1.c50uus42awel.ap-south-1.rds.amazonaws.com",
        "port": "5432",
        "user": "postgres",
        "password": "Vaibhav123"
    }
    connection_name = "test_postgres_dataone_federation"
    print(f"Creating connection {connection_name}...")
    ws.connections.create(
        name=connection_name,
        connection_type=catalog.ConnectionType.POSTGRESQL,
        options=options,
        comment="Test connection"
    )
    print("Connection created successfully!")
    
    print("Creating catalog...")
    ws.catalogs.create(
        name="test_target_catalog",
        connection_name=connection_name,
        options={"database": "postgres"},
        comment="Test catalog"
    )
    print("Catalog created successfully!")
except Exception as e:
    print(f"Error occurred: {e}")
    import traceback
    traceback.print_exc()

# Cleanup
try:
    print("Cleaning up...")
    ws.catalogs.delete(name="test_target_catalog", force=True)
    ws.connections.delete(name=connection_name)
except:
    pass
