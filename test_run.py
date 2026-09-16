import sys
import json
from backend.app.services.databricks_unity_catalog_service import _get_workspace_client

ws = _get_workspace_client(None)
run = ws.jobs.get_run(956304453939142)
print("State Message:", run.state.state_message)
