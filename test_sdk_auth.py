from databricks.sdk import WorkspaceClient

# Try to initialize WorkspaceClient, which handles M2M OAuth automatically via Env Vars
try:
    w = WorkspaceClient()
    # To get the raw token:
    token = w.config.authenticate()
    print("Token fetched:", token[:10] + "..." if token else "None")
except Exception as e:
    print(e)
