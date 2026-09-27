# Databricks notebook source
import argparse
import json
import requests
import sys
import logging
from pyspark.sql import SparkSession
from databricks.sdk import WorkspaceClient

logger = logging.getLogger(__name__)

try:
    spark = SparkSession.builder.getOrCreate()
except Exception:
    pass


def get_platform_auth_header(app_name: str) -> dict:
    """Exchange this job's notebook token for an OAuth token scoped to the DataOne app,
    so requests actually pass Databricks Apps' own front-door authentication."""
    notebook_token = (
        dbutils.notebook.entry_point.getDbutils()
        .notebook().getContext().apiToken().get()
    )
    workspace_host = (
        dbutils.notebook.entry_point.getDbutils()
        .notebook().getContext().apiUrl().get()
    )

    # Fetch app details directly via REST to bypass older SDK missing oauth2_app_client_id
    app_resp = requests.get(
        f"{workspace_host}/api/2.0/apps/{app_name}",
        headers={"Authorization": f"Bearer {notebook_token}"},
        timeout=10
    )
    app_resp.raise_for_status()
    app_client_id = app_resp.json().get("oauth2_app_client_id")
    if not app_client_id:
        # Fallback just in case
        app_client_id = app_resp.json().get("service_principal_client_id")


    resp = requests.post(
        f"{workspace_host}/oidc/v1/token",
        data={
            "grant_type": "urn:ietf:params:oauth:grant-type:token-exchange",
            "subject_token": notebook_token,
            "subject_token_type": "urn:databricks:params:oauth:token-type:personal-access-token",
            "requested_token_type": "urn:ietf:params:oauth:token-type:access_token",
            "scope": "all-apis",
            "audience": app_client_id,
        },
        timeout=10,
    )
    if resp.status_code != 200:
        print("TOKEN EXCHANGE FAILED:", resp.status_code)
        print("BODY:", resp.text)
    resp.raise_for_status()
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def update_status(api_url, app_name, mapping_id, run_id, run_token, platform_headers, state,
                   rows_read=None, rows_written=None, error=None):
    url = f"{api_url.rstrip('/')}/api/v1/mappings/{mapping_id}/runs/{run_id}/status"
    headers = {**platform_headers, "X-Run-Token": run_token}
    payload = {"state": state}
    if rows_read is not None: payload["rows_read"] = rows_read
    if rows_written is not None: payload["rows_written"] = rows_written
    if error is not None: payload["error"] = error

    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=10)
        if resp.status_code >= 400:
            print(f"STATUS UPDATE FAILED {resp.status_code}: {resp.text}")
        resp.raise_for_status()
    except Exception as e:
        logger.error(f"Failed to update status {state}: {e}")


def main():
    try:
        mapping_id = int(dbutils.widgets.get("mapping_id"))
        run_id = int(dbutils.widgets.get("run_id"))
        run_token = dbutils.widgets.get("run_token")
        api_url = dbutils.widgets.get("api_url")
        app_name = dbutils.widgets.get("app_name")
    except Exception:
        parser = argparse.ArgumentParser()
        parser.add_argument("--mapping_id", type=int, required=True)
        parser.add_argument("--run_id", type=int, required=True)
        parser.add_argument("--run_token", type=str, required=True)
        parser.add_argument("--api_url", type=str, required=True)
        parser.add_argument("--app_name", type=str, required=True)
        args = parser.parse_args()
        mapping_id, run_id, run_token, api_url, app_name = (
            args.mapping_id, args.run_id, args.run_token, args.api_url, args.app_name
        )

    platform_headers = get_platform_auth_header(app_name)

    update_status(api_url, app_name, mapping_id, run_id, run_token, platform_headers, "running")

    try:
        url = f"{api_url.rstrip('/')}/api/v1/mappings/{mapping_id}/runs/{run_id}/export"
        headers = {**platform_headers, "X-Run-Token": run_token}
        resp = requests.get(url, headers=headers, timeout=15)
        if resp.status_code != 200:
            print("STATUS:", resp.status_code)
            print("BODY:", resp.text)
        resp.raise_for_status()
        mapping_spec = resp.json()

        edges = mapping_spec.get("field_mappings", [])
        
        target_table_name = mapping_spec.get("target_table")
        source_table_name = mapping_spec.get("source_table")
        
        if not source_table_name or not target_table_name:
            # Fallback to extracting from edges if root keys aren't present
            if not edges:
                raise ValueError("No table names provided and no field mappings found in published version")
            target_table_name = target_table_name or edges[0].get("target_table")
            for edge in edges:
                if edge.get("sources") and len(edge["sources"]) > 0:
                    source_table_name = source_table_name or edge["sources"][0].get("table")
                    break

        if not source_table_name or not target_table_name:
            raise ValueError("Could not determine source or target table")

        df = spark.table(source_table_name)
        rows_read = df.count()

        exprs = []
        for edge in edges:
            src = edge["sources"][0]["column"] if edge.get("sources") else "NULL"
            tgt = edge["target"]["column"]
            tgt_type = edge["target"].get("type")
            exprs.append(f"CAST({src} AS {tgt_type}) AS {tgt}" if tgt_type else f"{src} AS {tgt}")

        if exprs:
            df = df.selectExpr(*exprs)

        target_conn = mapping_spec.get("target", {})
        db_type = target_conn.get("db_type") or target_conn.get("type", "postgresql")
        host = target_conn.get("host")
        port = target_conn.get("port")
        db_name = target_conn.get("database")
        user = target_conn.get("username")

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

        update_status(api_url, app_name, mapping_id, run_id, run_token, platform_headers,
                       "succeeded", rows_read=rows_read, rows_written=rows_read)

    except Exception as e:
        logger.exception("Migration failed")
        update_status(api_url, app_name, mapping_id, run_id, run_token, platform_headers,
                       "failed", error=str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()