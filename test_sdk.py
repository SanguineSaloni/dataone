from databricks.sdk import WorkspaceClient
from databricks.sdk.core import Config
import inspect
c = Config(host="https://fake", token="fake")
print(c.authenticate)
