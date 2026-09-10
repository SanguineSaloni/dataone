"""
Databricks SQL Warehouse connector using databricks-sql-connector.
Implements BaseConnector interface for Unity Catalog integration.
"""
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
        self.config = {
            'server_hostname': server_hostname,
            'http_path': http_path,
            'access_token': access_token,
            'catalog': catalog or 'main',  # Default UC catalog
            'schema': schema or 'default'
        }
        self.conn: Optional[Connection] = None
        
    def connect(self) -> Connection:
        """Establish connection to Databricks SQL Warehouse."""
        if not self.conn:
            try:
                connect_kwargs = {
                    "server_hostname": self.config['server_hostname'],
                    "http_path": self.config['http_path'],
                    "catalog": self.config['catalog'],
                    "schema": self.config['schema'],
                    "_socket_timeout": 10
                }
                
                # Only pass access_token if it's explicitly provided. 
                # If omitted, databricks-sql-connector automatically falls back to 
                # SDK credentials (like DATABRICKS_CLIENT_ID and DATABRICKS_CLIENT_SECRET)
                if self.config.get('access_token'):
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
    
    def get_tables(self) -> List[str]:
        """
        Fetch list of all table names in the current catalog/schema.
        Uses Unity Catalog information_schema (which lives in system catalog).
        """
        conn = self.connect()
        cursor = conn.cursor()
        
        try:
            # In Unity Catalog, information_schema is in the system catalog
            catalog = self.config['catalog']
            schema = self.config['schema']
            
            query = """
                SELECT table_name 
                FROM system.information_schema.tables 
                WHERE table_catalog = ? AND table_schema = ?
                ORDER BY table_name
            """
            cursor.execute(query, (catalog, schema))
            tables = [row[0] for row in cursor.fetchall()]
            
            logger.info(
                "Found %d tables in %s.%s",
                len(tables),
                catalog,
                schema
            )
            
            return tables
            
        finally:
            cursor.close()
    
    def get_table_schema(self, table_name: str) -> List[Dict[str, Any]]:
        """
        Fetch columns of a table from Unity Catalog information_schema.
        
        Returns list of dicts with column metadata including:
        - name, type, nullable, primary_key, foreign_keys
        - Unity Catalog specific: comment, tags
        """
        conn = self.connect()
        cursor = conn.cursor()
        
        try:
            # Get column information from information_schema
            # In Unity Catalog, information_schema is in the system catalog
            catalog = self.config['catalog']
            schema = self.config['schema']
            
            query = """
                SELECT 
                    column_name,
                    data_type,
                    is_nullable,
                    ordinal_position,
                    column_default,
                    comment
                FROM system.information_schema.columns
                WHERE table_catalog = ? 
                  AND table_schema = ? 
                  AND table_name = ?
                ORDER BY ordinal_position
            """
            cursor.execute(
                query,
                (catalog, schema, table_name)
            )
            
            columns = []
            for row in cursor.fetchall():
                col_name, data_type, is_nullable, pos, default, comment = row
                
                columns.append({
                    "name": col_name,
                    "type": data_type,
                    "nullable": is_nullable == "YES",
                    "primary_key": False,  # UC doesn't expose PK in information_schema
                    "foreign_keys": [],    # UC doesn't expose FK in information_schema
                    "ordinal_position": pos,
                    "default": default,
                    "comment": comment,
                    # Additional UC-specific fields
                    "databricks": {
                        "catalog": self.config['catalog'],
                        "schema": self.config['schema']
                    }
                })
            
            # Try to get primary key info from DESCRIBE DETAIL
            try:
                cursor.execute(
                    f"DESCRIBE DETAIL {self.config['catalog']}.{self.config['schema']}.{table_name}"
                )
                # Parse table properties if available
                # This is best-effort - not all tables have PK info
            except Exception as e:
                logger.debug("Could not get detailed table info: %s", e)
            
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
