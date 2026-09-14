from databricks.sdk.core import Config
import inspect

config = Config(host="https://fake.databricks.com", token="fake")
provider = config.authenticate
print(type(provider))
print(callable(provider))
if callable(provider):
    try:
        val = provider()
        print(type(val))
    except Exception as e:
        print(e)
