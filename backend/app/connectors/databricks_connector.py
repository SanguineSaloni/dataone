"""
Databricks SQL Warehouse connector using databricks-sql-connector.
Implements BaseConnector interface for Unity Catalog integration.

Schema metadata (get_tables / get_table_schema) is fetched using native
Spark Python code via the Databricks Command Execution API so that the
Schema Mapper Workbench shows Unity Catalog metadata through Spark,
without creating any Job pipelines.
"""
import json
import time
import logging
from typing import List, Dict, Any, Optional
from databricks import sql
from databricks.sql.client import Connection

from .base import (
    BaseConnector, 
    ColumnProfileResult, 
    TestConnectionResult, 
    classify_connection_error
)

logger = logging.getLogger(__name__)


class DatabricksConnector(BaseConnector):
    """
    Connector for Databricks SQL Warehouses with Unity Catalog support.
    
    Supports:
    - SQL Warehouse query execution
    - Unity Catalog metadata introspection
    - Automatic lineage tracking
    - Column profiling on Delta tables
    """
    
    def __init__(
        self, 
        server_hostname: str, 
        http_path: str, 
        access_token: str,
        catalog: Optional[str] = None,
        schema: Optional[str] = None
    ):
        """
        Initialize Databricks connector.
        
        Args:
            server_hostname: Workspace URL (e.g., adb-xxx.azuredatabricks.net)
            http_path: SQL Warehouse HTTP path (e.g., /sql/1.0/warehouses/xxx)
            access_token: Personal access token or OAuth token
            catalog: Unity Catalog name (optional, defaults to current)
            schema: Schema name (optional, defaults to 'default')
        """
        catalog = catalog or 'dataone_3_mysql_catalog'
        if catalog == 'main':
            catalog = 'dataone_3_mysql_catalog'
            
        self.config = {
            'server_hostname': server_hostname,
            'http_path': http_path,
            'access_token': access_token,
            'catalog': catalog,
            'schema': schema or 'default'
        }
        self.conn: Optional[Connection] = None
        # Workspace SDK client — lazily initialised for Command Execution
        self._wc = None
        
    def connect(self) -> Connection:
        """Establish connection to Databricks SQL Warehouse."""
        if not self.conn:
            import os
            try:
                connect_kwargs = {
                    "server_hostname": self.config['server_hostname'],
                    "http_path": self.config['http_path'],
                    "catalog": self.config['catalog'],
                    "schema": self.config['schema'],
                    "_socket_timeout": 10
                }
                
                # Check if we are running in Databricks Apps (OAuth M2M env injected)
                client_id = os.environ.get("DATABRICKS_CLIENT_ID")
                client_secret = os.environ.get("DATABRICKS_CLIENT_SECRET")
                is_databricks_apps = bool(client_id and client_secret)
                
                if is_databricks_apps:
                    logger.info("[SQL] Databricks Apps environment detected — fetching M2M OAuth token directly for SQL connection")
                    import requests
                    host = self.config['server_hostname']
                    token_url = f"https://{host}/oidc/v1/token"
                    data = {"grant_type": "client_credentials", "scope": "all-apis"}
                    auth = (client_id, client_secret)
                    
                    r = requests.post(token_url, data=data, auth=auth, timeout=10)
                    r.raise_for_status()
                    m2m_token = r.json().get("access_token")
                    
                    connect_kwargs["access_token"] = m2m_token
                elif self.config.get('access_token'):
                    # Local / external deployment, use explicitly provided PAT
                    connect_kwargs["access_token"] = self.config['access_token']
                    
                self.conn = sql.connect(**connect_kwargs)
                logger.info(
                    "Connected to Databricks SQL Warehouse: %s",
                    self.config['http_path']
                )
            except Exception as e:
                logger.error("Failed to connect to Databricks: %s", e)
                raise
        return self.conn
    
    def test_connection(self) -> TestConnectionResult:
        """Test connectivity and return structured diagnostics."""
        try:
            start = time.monotonic()
            conn = self.connect()
            cursor = conn.cursor()
            
            # Test query - get current catalog and version info
            cursor.execute("SELECT current_catalog(), current_database(), current_version()")
            result = cursor.fetchone()
            catalog, database, version = result if result else (None, None, None)
            
            cursor.close()
            latency = int((time.monotonic() - start) * 1000)
            
            version_str = f"Databricks {version}" if version else "Databricks SQL Warehouse"
            
            return TestConnectionResult(
                success=True,
                version=version_str,
                latency_ms=latency,
                reachable=True,
                authenticated=True,
                database_accessible=True
            )
            
        except Exception as e:
            error_msg = str(e).lower()
            
            # Databricks-specific error classification
            if "authentication" in error_msg or "token" in error_msg or "unauthorized" in error_msg:
                return TestConnectionResult(
                    success=False,
                    reachable=True,
                    authenticated=False,
                    database_accessible=False,
                    error_message=str(e),
                    error_code="AUTH_FAILED"
                )
            elif "warehouse" in error_msg and ("not found" in error_msg or "does not exist" in error_msg):
                return TestConnectionResult(
                    success=False,
                    reachable=True,
                    authenticated=True,
                    database_accessible=False,
                    error_message=str(e),
                    error_code="WAREHOUSE_NOT_FOUND"
                )
            elif "catalog" in error_msg or "schema" in error_msg:
                return TestConnectionResult(
                    success=False,
                    reachable=True,
                    authenticated=True,
                    database_accessible=False,
                    error_message=str(e),
                    error_code="CATALOG_UNAVAILABLE"
                )
            else:
                # Use base error classifier
                return classify_connection_error(str(e))
    
    # ------------------------------------------------------------------
    # Spark-based schema fetching (no Job pipelines)
    # ------------------------------------------------------------------

    def _get_workspace_client(self):
        """Lazily create a Databricks SDK WorkspaceClient for Command Execution.

        When running as a Databricks App the runtime already injects OAuth M2M
        credentials via environment variables (DATABRICKS_HOST,
        DATABRICKS_CLIENT_ID, DATABRICKS_CLIENT_SECRET). Passing an explicit
        PAT token on top of those causes the SDK to raise
        'more than one authorization method configured'.

        Strategy:
        - If OAuth env vars are present → let the SDK auto-configure from env
          (do NOT pass token).
        - Otherwise → configure explicitly with the PAT from the connection.
        """
        if self._wc is None:
            import os
            from databricks.sdk import WorkspaceClient
            from databricks.sdk.core import Config

            is_databricks_apps = bool(
                os.environ.get("DATABRICKS_CLIENT_ID")
                or os.environ.get("DATABRICKS_CLIENT_SECRET")
            )

            if is_databricks_apps:
                # Let SDK pick up OAuth M2M from environment automatically.
                # DATABRICKS_HOST is already set in the env.
                logger.info("[Spark] Databricks Apps environment detected — using OAuth M2M from env")
                self._wc = WorkspaceClient()
            else:
                # Local / external deployment — use PAT from connector config.
                config = Config(
                    host=f"https://{self.config['server_hostname']}",
                    token=self.config['access_token']
                )
                self._wc = WorkspaceClient(config=config)
        return self._wc


    def _run_spark_python(self, python_code: str) -> Any:
        """
        Execute a Spark Python snippet on the first available interactive
        cluster via the Databricks Command Execution API.
        Returns the parsed JSON value printed by the snippet.
        """
        import time as _time
        from databricks.sdk.service import compute

        wc = self._get_workspace_client()

        # Pick a running interactive cluster (not a Job cluster)
        clusters = list(wc.clusters.list())
        running = [
            c for c in clusters
            if c.state == compute.State.RUNNING
            and c.cluster_source != compute.ClusterSource.JOB
        ]
        if not running:
            running = [c for c in clusters if c.state == compute.State.RUNNING]
        if not running:
            raise RuntimeError(
                "No running Databricks cluster found. "
                "Please start an interactive cluster before fetching schema."
            )

        cluster_id = running[0].cluster_id
        logger.info("[Spark] Using cluster %s for schema fetch", cluster_id)

        # Create an execution context
        ctx = wc.command_execution.create(
            cluster_id=cluster_id,
            language=compute.Language.PYTHON
        )
        ctx_id = ctx.id

        try:
            cmd = wc.command_execution.execute(
                cluster_id=cluster_id,
                context_id=ctx_id,
                language=compute.Language.PYTHON,
                command=python_code
            )
            cmd_id = cmd.id
            status = cmd.status

            # Poll until finished
            while status in (compute.CommandStatus.RUNNING, compute.CommandStatus.QUEUED):
                _time.sleep(2)
                s = wc.command_execution.command_status(
                    cluster_id=cluster_id,
                    context_id=ctx_id,
                    command_id=cmd_id
                )
                status = s.status
                if status not in (compute.CommandStatus.RUNNING, compute.CommandStatus.QUEUED):
                    cmd = s
                    break

            if status != compute.CommandStatus.FINISHED:
                summary = getattr(getattr(cmd, 'results', None), 'summary', str(cmd))
                raise RuntimeError(f"Spark command failed: {summary}")

            result_type = getattr(cmd.results, 'result_type', None)
            if result_type == compute.ResultType.ERROR:
                raise RuntimeError(f"Spark error: {cmd.results.summary}")

            output_str = cmd.results.data or ""
            # Find the last valid JSON line
            for line in reversed(output_str.strip().split('\n')):
                line = line.strip()
                if not line:
                    continue
                try:
                    parsed = json.loads(line)
                    if isinstance(parsed, dict) and "_error" in parsed:
                        raise RuntimeError(parsed["_error"])
                    return parsed
                except json.JSONDecodeError:
                    continue
            raise RuntimeError(f"No valid JSON found in Spark output: {output_str!r}")
        finally:
            try:
                wc.command_execution.destroy(cluster_id=cluster_id, context_id=ctx_id)
            except Exception:
                pass

    def get_tables(self) -> List[str]:
        """
        Fetch list of all table names in the current catalog/schema
        using Spark Python (spark.catalog.listTables) via Command Execution API.
        No Job pipeline is created.
        """
        catalog = self.config['catalog']
        schema = self.config['schema']

        try:
            code = f"""
import json
from pyspark.sql import SparkSession
spark = SparkSession.builder.getOrCreate()
try:
    tables = []
    try:
        df = spark.sql(f"SHOW TABLES IN `{catalog}`.`{schema}`")
        tables = [row.tableName for row in df.collect() if not row.isTemporary]
    except Exception as e:
        if "SCHEMA_NOT_FOUND" in str(e) or "NOT_FOUND" in str(e):
            dbs = spark.catalog.listDatabases("{catalog}")
            for db in dbs:
                if db.name.lower() in ("information_schema", "app_database", "mysql", "performance_schema", "sys"): continue
                for t in spark.catalog.listTables(f"{catalog}.{{db.name}}"):
                    if not t.isTemporary:
                        tables.append(f"{{db.name}}.{{t.name}}")
        else:
            raise e
    print(json.dumps(tables))
except Exception as e:
    print(json.dumps({{"_error": str(e)}}))
"""
            result = self._run_spark_python(code)
            if not isinstance(result, list):
                raise RuntimeError(f"Unexpected Spark output: {result}")
            logger.info("[Spark] Found %d tables in %s.%s", len(result), catalog, schema)
            return result
        except Exception as e:
            logger.warning(
                "[Spark] get_tables failed for %s.%s (%s); falling back to SQL",
                catalog, schema, e
            )
            # Fallback: use SQL warehouse
            conn = self.connect()
            cursor = conn.cursor()
            try:
                cursor.execute(f"SHOW SCHEMAS IN `{catalog}`")
                schemas = [row.databaseName for row in cursor.fetchall()]
                tables = []
                if schema in schemas:
                    cursor.execute(f"SHOW TABLES IN `{catalog}`.`{schema}`")
                    tables = [row.tableName for row in cursor.fetchall() if not row.isTemporary]
                else:
                    for sch in schemas:
                        if sch.lower() in ("information_schema", "app_database", "mysql", "performance_schema", "sys"): continue
                        cursor.execute(f"SHOW TABLES IN `{catalog}`.`{sch}`")
                        for row in cursor.fetchall():
                            if not row.isTemporary:
                                tables.append(f"{sch}.{row.tableName}")
                logger.info("[SQL fallback] Found %d tables in %s", len(tables), catalog)
                return tables
            finally:
                cursor.close()
    
    def get_table_schema(self, table_name: str) -> List[Dict[str, Any]]:
        """
        Fetch columns of a table using Spark Python (spark.catalog.listColumns)
        via the Databricks Command Execution API.
        Falls back to SQL warehouse if Spark execution is unavailable.
        No Job pipeline is created.
        """
        catalog = self.config['catalog']
        schema = self.config['schema']

        if table_name.endswith("(empty_schema)"):
            return []

        try:
            code = f"""
import json
from pyspark.sql import SparkSession
spark = SparkSession.builder.getOrCreate()
try:
    table_name = "{table_name}"
    if "." in table_name:
        sch, tbl = table_name.split(".", 1)
        full_name = f"{catalog}.{{sch}}.{{tbl}}"
        used_schema = sch
    else:
        full_name = f"{catalog}.{schema}.{{table_name}}"
        used_schema = "{schema}"
        
    cols = spark.catalog.listColumns(full_name)
    results = []
    for i, c in enumerate(cols):
        results.append({{
            "name": c.name,
            "type": c.dataType,
            "nullable": c.nullable,
            "primary_key": False,
            "foreign_keys": [],
            "ordinal_position": i + 1,
            "default": None,
            "comment": c.description,
            "databricks": {{"catalog": "{catalog}", "schema": used_schema}}
        }})
    print(json.dumps(results))
except Exception as e:
    print(json.dumps({{"_error": str(e)}}))
"""
            result = self._run_spark_python(code)
            if not isinstance(result, list):
                raise RuntimeError(f"Unexpected Spark output: {result}")
            logger.info(
                "[Spark] Fetched %d columns for %s.%s.%s",
                len(result), catalog, schema, table_name
            )
            return result
        except Exception as e:
            logger.warning(
                "[Spark] get_table_schema failed for %s.%s.%s (%s); falling back to SQL",
                catalog, schema, table_name, e
            )
            # Fallback: SQL warehouse via system.information_schema + DESCRIBE
            conn = self.connect()
            cursor = conn.cursor()
            try:
                if "." in table_name:
                    q_sch, q_tbl = table_name.split(".", 1)
                else:
                    q_sch, q_tbl = schema, table_name
                    
                query = """
                    SELECT column_name, data_type, is_nullable,
                           ordinal_position, column_default, comment
                    FROM system.information_schema.columns
                    WHERE table_catalog = ?
                      AND table_schema = ?
                      AND table_name = ?
                    ORDER BY ordinal_position
                """
                cursor.execute(query, (catalog, q_sch, q_tbl))
                columns = []
                for row in cursor.fetchall():
                    col_name, data_type, is_nullable, pos, default, comment = row
                    columns.append({
                        "name": col_name,
                        "type": data_type,
                        "nullable": is_nullable == "YES",
                        "primary_key": False,
                        "foreign_keys": [],
                        "ordinal_position": pos,
                        "default": default,
                        "comment": comment,
                        "databricks": {"catalog": catalog, "schema": q_sch}
                    })

                if not columns:
                    # Last-resort: DESCRIBE TABLE
                    try:
                        cursor.execute(f"DESCRIBE TABLE `{catalog}`.`{q_sch}`.`{q_tbl}`")
                        columns = []
                        pos = 1
                        for row in cursor.fetchall():
                            col_name = row.col_name
                            if not col_name or col_name.startswith("#"):
                                break
                            columns.append({
                                "name": col_name,
                                "type": row.data_type,
                                "nullable": True,
                                "primary_key": False,
                                "foreign_keys": [],
                                "ordinal_position": pos,
                                "default": None,
                                "comment": row.comment,
                                "databricks": {"catalog": catalog, "schema": schema}
                            })
                            pos += 1
                    except Exception as desc_e:
                        logger.debug(
                            "DESCRIBE TABLE fallback failed for %s.%s.%s: %s",
                            catalog, schema, table_name, desc_e
                        )
                return columns
            finally:
                cursor.close()
    
    def close(self):
        """Close connection safely."""
        if self.conn:
            try:
                self.conn.close()
                logger.info("Closed Databricks connection")
            except Exception as e:
                logger.warning("Error closing Databricks connection: %s", e)
            finally:
                self.conn = None
    
    def profile_column(
        self, 
        table: str, 
        column: str,
        sample_limit: int = 1000,
        distinct_scan_limit: int = 100000
    ) -> ColumnProfileResult:
        """
        Profile a single column in a Databricks table.
        
        Optimized for Delta tables with column statistics.
        """
        conn = self.connect()
        cursor = conn.cursor()
        
        # Fully qualified table name
        fqn = f"`{self.config['catalog']}`.`{self.config['schema']}`.`{table}`"
        col_escaped = f"`{column}`"
        
        try:
            # Get total count and null count
            query = f"SELECT COUNT(*) as total, COUNT({col_escaped}) as non_null FROM {fqn}"
            cursor.execute(query)
            result = cursor.fetchone()
            total, non_null = result if result else (0, 0)
            
            null_count = total - non_null
            null_rate = null_count / total if total > 0 else 0.0
            
            # Get distinct count (limited scan)
            distinct_count = None
            try:
                # Use APPROX_COUNT_DISTINCT for better performance on large tables
                query = f"""
                    SELECT APPROX_COUNT_DISTINCT({col_escaped}) 
                    FROM (SELECT {col_escaped} FROM {fqn} LIMIT {int(distinct_scan_limit)})
                """
                cursor.execute(query)
                result = cursor.fetchone()
                distinct_count = result[0] if result else None
            except Exception as e:
                logger.warning("Could not compute distinct count for %s.%s: %s", table, column, e)
            
            # Get min/max
            min_val = max_val = None
            try:
                query = f"SELECT MIN({col_escaped}), MAX({col_escaped}) FROM {fqn}"
                cursor.execute(query)
                result = cursor.fetchone()
                min_val, max_val = result if result else (None, None)
            except Exception as e:
                logger.warning("Could not compute min/max for %s.%s: %s", table, column, e)
            
            # Get sample values
            sample = []
            try:
                query = f"""
                    SELECT {col_escaped} 
                    FROM {fqn} 
                    WHERE {col_escaped} IS NOT NULL 
                    LIMIT {int(sample_limit)}
                """
                cursor.execute(query)
                sample = [row[0] for row in cursor.fetchall()]
            except Exception as e:
                logger.warning("Could not get sample values for %s.%s: %s", table, column, e)
            
            return ColumnProfileResult(
                null_count=null_count,
                null_rate=null_rate,
                distinct_count=distinct_count,
                min_value=str(min_val) if min_val is not None else None,
                max_value=str(max_val) if max_val is not None else None,
                sample_values=sample,
                sample_size_used=len(sample),
                row_count=total,
                error=None
            )
            
        except Exception as e:
            logger.error("Error profiling column %s.%s: %s", table, column, e)
            return ColumnProfileResult(
                null_count=0,
                null_rate=0.0,
                error=f"Profiling failed: {str(e)}"
            )
        finally:
            cursor.close()
    
    def get_catalogs(self) -> List[Dict[str, Any]]:
        """Get all catalogs the user has access to (Unity Catalog)."""
        conn = self.connect()
        cursor = conn.cursor()
        
        try:
            cursor.execute("SHOW CATALOGS")
            catalogs = []
            for row in cursor.fetchall():
                # SHOW CATALOGS returns: catalog_name
                catalogs.append({
                    "name": row[0],
                    "type": "unity_catalog"
                })
            return catalogs
        finally:
            cursor.close()
    
    def get_schemas(self, catalog: str) -> List[Dict[str, Any]]:
        """Get all schemas in a catalog (Unity Catalog)."""
        conn = self.connect()
        cursor = conn.cursor()
        
        try:
            cursor.execute(f"SHOW SCHEMAS IN `{catalog}`")
            schemas = []
            for row in cursor.fetchall():
                # SHOW SCHEMAS returns: database_name
                schemas.append({
                    "name": row[0],
                    "catalog": catalog
                })
            return schemas
        finally:
            cursor.close()
    
    def execute_query(
        self, 
        query: str, 
        params: Optional[Dict[str, Any]] = None,
        fetch_limit: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Execute a SQL query and return results.
        
        Args:
            query: SQL query string
            params: Optional parameters for parameterized queries
            fetch_limit: Optional limit on rows returned
            
        Returns:
            List of row dictionaries
        """
        conn = self.connect()
        cursor = conn.cursor()
        
        try:
            if params:
                cursor.execute(query, params)
            else:
                cursor.execute(query)
            
            # Get column names
            if cursor.description:
                columns = [desc[0] for desc in cursor.description]
                
                # Fetch results
                if fetch_limit:
                    rows = cursor.fetchmany(fetch_limit)
                else:
                    rows = cursor.fetchall()
                
                # Convert to list of dicts
                results = []
                for row in rows:
                    results.append(dict(zip(columns, row)))
                
                return results
            else:
                # No results (e.g., DDL statement)
                return []
                
        finally:
            cursor.close()
