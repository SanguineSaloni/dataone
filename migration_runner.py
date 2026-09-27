import argparse
import json
import requests
import sys
import logging
from pyspark.sql import SparkSession

logger = logging.getLogger(__name__)

# Note: In Databricks, spark and dbutils are injected automatically into the global scope.
try:
    spark = SparkSession.builder.getOrCreate()
except Exception:
    pass

def update_status(api_url, mapping_id, run_id, token, state, rows_read=None, rows_written=None, error=None):
    url = f"{api_url.rstrip('/')}/api/v1/mappings/{mapping_id}/runs/{run_id}/status"
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"state": state}
    if rows_read is not None: payload["rows_read"] = rows_read
    if rows_written is not None: payload["rows_written"] = rows_written
    if error is not None: payload["error"] = error
    
    try:
        requests.post(url, json=payload, headers=headers, timeout=10)
    except Exception as e:
        logger.error(f"Failed to update status {state}: {e}")

def main():
    try:
        # Databricks Notebook Task widgets
        mapping_id = int(dbutils.widgets.get("mapping_id"))
        run_id = int(dbutils.widgets.get("run_id"))
        run_token = dbutils.widgets.get("run_token")
        api_url = dbutils.widgets.get("api_url")
    except Exception:
        # Fallback to argparse for spark_python_task / local testing
        parser = argparse.ArgumentParser()
        parser.add_argument("--mapping_id", type=int, required=True)
        parser.add_argument("--run_id", type=int, required=True)
        parser.add_argument("--run_token", type=str, required=True)
        parser.add_argument("--api_url", type=str, required=True)
        args = parser.parse_args()
        mapping_id = args.mapping_id
        run_id = args.run_id
        run_token = args.run_token
        api_url = args.api_url
    
    update_status(api_url, mapping_id, run_id, run_token, "running")
    
    try:
        # Fetch mapping details from DataOne API using the dedicated run token endpoint
        url = f"{api_url.rstrip('/')}/api/v1/mappings/{mapping_id}/runs/{run_id}/export"
        headers = {"Authorization": f"Bearer {run_token}"}
        resp = requests.get(url, headers=headers)
        resp.raise_for_status()
        mapping_spec = resp.json()
        
        # We assume export_json returns a simplified structure containing edges and source/target table meta.
        # But wait, we can also just fetch the mapping JSON natively. 
        # For this PoC, we expect mapping_spec to have `source_table`, `target_table`, `edges`, `target_conn`.
        
        source_table_name = mapping_spec.get("source_table")  # catalog.schema.table
        target_table_name = mapping_spec.get("target_table")
        edges = mapping_spec.get("edges", [])
        
        # Read from UC foreign catalog
        df = spark.table(source_table_name)
        rows_read = df.count()
        
        # Apply selectExpr transformations
        # Expecting edges: [{"source": "col1", "target": "col1_target", "cast": "string"}]
        # or we construct it from the FieldMapping structure.
        exprs = []
        for edge in edges:
            src = edge["sources"][0]["column"] if edge.get("sources") else "NULL"
            tgt = edge["target"]["column"]
            tgt_type = edge["target"].get("type")
            if tgt_type:
                exprs.append(f"CAST({src} AS {tgt_type}) AS {tgt}")
            else:
                exprs.append(f"{src} AS {tgt}")
        
        if exprs:
            df = df.selectExpr(*exprs)
            
        # Target connection details (this should ideally be passed in the spec securely or fetched)
        target_conn = mapping_spec.get("target_connection", {})
        db_type = target_conn.get("db_type", "postgresql")
        host = target_conn.get("host")
        port = target_conn.get("port")
        db_name = target_conn.get("database")
        user = target_conn.get("username")
        
        # Fetch password from DBUtils Secrets
        secret_scope = target_conn.get("secret_scope")
        secret_key = target_conn.get("secret_key")
        password = dbutils.secrets.get(scope=secret_scope, key=secret_key) if secret_scope and secret_key else ""
        
        jdbc_url = f"jdbc:{db_type}://{host}:{port}/{db_name}"
        
        df.write \
            .format("jdbc") \
            .option("url", jdbc_url) \
            .option("dbtable", target_table_name.split(".")[-1]) \
            .option("user", user) \
            .option("password", password) \
            .mode("append") \
            .save()
            
        update_status(api_url, mapping_id, run_id, run_token, "succeeded", rows_read=rows_read, rows_written=rows_read)
        
    except Exception as e:
        logger.exception("Migration failed")
        update_status(api_url, mapping_id, run_id, run_token, "failed", error=str(e))
        sys.exit(1)

if __name__ == "__main__":
    main()
