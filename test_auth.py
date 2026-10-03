from databricks.sdk.core import Config
cfg = Config()
print("Auth:", cfg.authenticate)
