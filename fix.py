import re

with open("backend/app/services/databricks_ingestion_service.py", "r") as f:
    content = f.read()

# find where job_settings should be
insert_point = "            # Use Serverless compute by defining a NotebookTask\n            \n\n            # Upload the script to Workspace Files instead of DBFS"

replacement = """            # Define compute cluster configuration
            from databricks.sdk.service.compute import ClusterSpec, AutoScale
            
            new_cluster_config = ClusterSpec(
                spark_version="13.3.x-scala2.12",
                node_type_id="i3.xlarge",
                autoscale=AutoScale(
                    min_workers=1,
                    max_workers=2
                ),
                spark_conf={
                    "spark.databricks.cluster.profile": "serverless",
                    "spark.databricks.repl.allowedLanguages": "python,sql"
                }
            )

            job_settings = JobSettings(
                name=job_name,
                max_concurrent_runs=3,
                tasks=[
                    Task(
                        task_key="ingestion",
                        notebook_task=NotebookTask(
                            notebook_path=f"/Workspace{script_path}",
                        ),
                        timeout_seconds=7200,
                        new_cluster=new_cluster_config
                    )
                ],
            )

            # Upload the script to Workspace Files instead of DBFS"""

content = content.replace(insert_point, replacement)

with open("backend/app/services/databricks_ingestion_service.py", "w") as f:
    f.write(content)
