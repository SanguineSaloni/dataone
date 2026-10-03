from app.services.databricks_ingestion_service import _get_workspace_client

try:
    ws = _get_workspace_client(None)
    for c in ws.connections.list():
        print(c.name, c.connection_type)
    print("---")
    for c in ws.catalogs.list():
        print(c.name)
except Exception as e:
    print(f"Error: {e}")
