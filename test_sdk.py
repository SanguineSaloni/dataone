import os
import json
from databricks.sdk import WorkspaceClient

try:
    w = WorkspaceClient()
    warehouses = w.warehouses.list()
    running_wh = None
    for wh in warehouses:
        if wh.state.name == "RUNNING" or wh.state.name == "STARTING":
            running_wh = wh
            break
            
    if not running_wh:
        for wh in warehouses:
            running_wh = wh
            break

    if running_wh:
        print(f"Found warehouse: {running_wh.name}, HTTP Path: {running_wh.odbc_params.path}")
    else:
        print("No warehouses found")
        
except Exception as e:
    print(f"Error: {e}")
