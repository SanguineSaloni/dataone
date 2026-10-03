from databricks.sdk import WorkspaceClient
import inspect
try:
    print(dir(WorkspaceClient.command_execution))
except Exception as e:
    print(e)
