import re

file_path = "backend/app/connectors/databricks_connector.py"
with open(file_path, "r") as f:
    content = f.read()

new_session = """    def _get_spark_session(self) -> Any:
        \"\"\"
        Initialize a Databricks Connect V2 session.
        Attempts to use an interactive cluster, and falls back to Serverless Compute if none is found.
        \"\"\"
        from databricks.connect import DatabricksSession
        from databricks.sdk.service import compute
        from databricks.sdk.core import Config
        import os

        wc = self._get_workspace_client()

        is_databricks_apps = bool(
            os.environ.get("DATABRICKS_CLIENT_ID")
            or os.environ.get("DATABRICKS_CLIENT_SECRET")
        )

        builder = DatabricksSession.builder
        if not is_databricks_apps:
            config = Config(
                host=f"https://{self.config['server_hostname']}",
                token=self.config['access_token']
            )
            builder = builder.sdkConfig(config)

        # Pick a running interactive cluster (not a Job cluster)
        clusters = list(wc.clusters.list())
        running = [
            c for c in clusters
            if c.state == compute.State.RUNNING
            and c.cluster_source != compute.ClusterSource.JOB
        ]
        if not running:
            running = [c for c in clusters if c.state == compute.State.RUNNING]

        if running:
            cluster_id = running[0].cluster_id
            logger.info("[Spark] Using interactive cluster %s for schema fetch via Databricks Connect", cluster_id)
            return builder.clusterId(cluster_id).getOrCreate()
        else:
            logger.info("[Spark] No running Databricks cluster found. Defaulting to Serverless Compute via Databricks Connect.")
            # Use serverless compute
            return builder.serverless().getOrCreate()"""

# Replace the existing _get_spark_session with the new one
content = re.sub(
    r"    def _get_spark_session\(self\) -> Any:.*?    def get_tables\(self\) -> List\[str\]:",
    new_session + "\n\n    def get_tables(self) -> List[str]:",
    content,
    flags=re.DOTALL
)

with open(file_path, "w") as f:
    f.write(content)

print("Patched successfully")
