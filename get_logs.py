import sys
import json
from backend.app.services.databricks_unity_catalog_service import _get_workspace_client

ws = _get_workspace_client(None)
run_id = 460340767745958

try:
    output = ws.jobs.get_run_output(run_id)
    print("Error:", getattr(output, 'error', 'No explicit error field'))
    print("Error Trace:", getattr(output, 'error_trace', 'No trace'))
    print("Logs:", output.logs)
except Exception as e:
    print("Could not fetch output:", e)
