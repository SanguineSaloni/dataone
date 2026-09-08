"""
Unity Catalog integration service for Databricks connections.

This service DELEGATES catalog, lineage, and governance features to Unity Catalog
(per the assessment: ~45% of features delegated to Databricks primitives).

Multi-source fallback: For non-Databricks connections, the app-owned catalog
service remains active (preserving the multi-source capability).

OAuth Mode: When running as a Databricks Lakehouse App, this service uses
OAuth tokens from authenticated users instead of PAT tokens, respecting
Unity Catalog permissions at the user level.
"""
import logging
from typing import List, Dict, Any, Optional
from databricks import sql
from databricks.sdk import WorkspaceClient
from databricks.sdk.core import Config

from app.models.connection import DBConnection
from app.core.config import settings

logger = logging.getLogger(__name__)


class UnityCatalogService:
    """
    Service for Unity Catalog metadata, lineage, and governance operations.
    
    DELEGATE features (from assessment):
    - Schema catalog & profiling (UC information_schema)
    - Data lineage (UC automatic lineage)
    - PII/classification (UC tags + auto-classification)
    - RBAC/masking (UC grants, row filters, masks)
    
    OAuth Mode:
    - When DATABRICKS_NATIVE_MODE=true, uses user's OAuth token
    - Respects user-level Unity Catalog permissions
    - Automatically refreshes tokens when needed
    """
    
    def __init__(
        self, 
        connection: DBConnection,
        user_access_token: Optional[str] = None
    ):
        """
        Initialize UC service for a Databricks connection.
        
        Args:
            connection: DBConnection model with Databricks credentials
            user_access_token: Optional OAuth token from authenticated user
                              (used in Databricks native mode)
        """
        if connection.type.lower() != "databricks":
            raise ValueError(
                f"UnityCatalogService requires a Databricks connection, got: {connection.type}"
            )
        
        self.connection = connection
        self.config = connection.config or {}
        
        # In Databricks native mode, prefer user's OAuth token
        self.is_native_mode = getattr(settings, "DATABRICKS_NATIVE_MODE", False)
        self.access_token = user_access_token if self.is_native_mode else self.config.get("access_token")
        
        if not self.access_token:
            logger.warning(
                "No access token provided for Unity Catalog service. "
                "Using connection config token as fallback."
            )
            self.access_token = self.config.get("access_token")
        
        # Initialize SQL connection for queries
        self.sql_conn = None
        
        # Initialize SDK client for UC APIs
        self.workspace_client: Optional[WorkspaceClient] = None
        
        logger.info(
            f"UnityCatalogService initialized in {'OAuth' if self.is_native_mode else 'PAT'} mode"
        )
    
    def _get_sql_connection(self):
        """Get or create SQL connection using appropriate token."""
        if not self.sql_conn:
            self.sql_conn = sql.connect(
                server_hostname=self.config.get("server_hostname"),
                http_path=self.config.get("http_path"),
                access_token=self.access_token  # Use OAuth token in native mode
            )
        return self.sql_conn
    
    def _get_workspace_client(self) -> WorkspaceClient:
        """Get or create Workspace SDK client for UC APIs using appropriate token."""
        if not self.workspace_client:
            config = Config(
                host=f"https://{self.config.get('server_hostname')}",
                token=self.access_token  # Use OAuth token in native mode
            )
            self.workspace_client = WorkspaceClient(config=config)
        return self.workspace_client
    
    def update_access_token(self, new_token: str):
        """
        Update the access token (e.g., after refresh).
        
        This forces reconnection with the new token on next API call.
        
        Args:
            new_token: New OAuth access token
        """
        self.access_token = new_token
        
        # Close existing connections to force reconnect with new token
        self.close()
        
        logger.info("Access token updated, connections will reconnect")
    
    def get_catalogs(self) -> List[Dict[str, Any]]:
        """
        Get all Unity Catalogs the user has access to.
        
        DELEGATE: Replaces app-owned catalog listing.
        """
        try:
            wc = self._get_workspace_client()
            catalogs = wc.catalogs.list()
            
            return [
                {
                    "name": catalog.name,
                    "comment": catalog.comment,
                    "owner": catalog.owner,
                    "created_at": str(catalog.created_at) if catalog.created_at else None,
                    "updated_at": str(catalog.updated_at) if catalog.updated_at else None,
                    "metastore_id": catalog.metastore_id,
                    "full_name": catalog.full_name,
                    "type": "unity_catalog"
                }
                for catalog in catalogs
            ]
        except Exception as e:
            logger.error("Failed to list Unity Catalogs: %s", e)
            return []
    
    def get_schemas(self, catalog_name: str) -> List[Dict[str, Any]]:
        """
        Get all schemas in a Unity Catalog.
        
        DELEGATE: Replaces app-owned schema listing.
        """
        try:
            wc = self._get_workspace_client()
            schemas = wc.schemas.list(catalog_name=catalog_name)
            
            return [
                {
                    "name": schema.name,
                    "catalog": catalog_name,
                    "comment": schema.comment,
                    "owner": schema.owner,
                    "full_name": schema.full_name,
                    "created_at": str(schema.created_at) if schema.created_at else None,
                    "updated_at": str(schema.updated_at) if schema.updated_at else None
                }
                for schema in schemas
            ]
        except Exception as e:
            logger.error("Failed to list schemas in catalog %s: %s", catalog_name, e)
            return []
    
    def get_tables(self, catalog_name: str, schema_name: str) -> List[Dict[str, Any]]:
        """
        Get all tables in a Unity Catalog schema.
        
        DELEGATE: Replaces app-owned table listing.
        """
        try:
            wc = self._get_workspace_client()
            tables = wc.tables.list(catalog_name=catalog_name, schema_name=schema_name)
            
            return [
                {
                    "name": table.name,
                    "catalog": catalog_name,
                    "schema": schema_name,
                    "full_name": table.full_name,
                    "table_type": table.table_type,
                    "data_source_format": table.data_source_format,
                    "comment": table.comment,
                    "owner": table.owner,
                    "created_at": str(table.created_at) if table.created_at else None,
                    "updated_at": str(table.updated_at) if table.updated_at else None,
                    "storage_location": table.storage_location
                }
                for table in tables
            ]
        except Exception as e:
            logger.error(
                "Failed to list tables in %s.%s: %s",
                catalog_name, schema_name, e
            )
            return []
    
    def get_table_metadata(
        self, 
        catalog_name: str, 
        schema_name: str, 
        table_name: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get detailed table metadata from Unity Catalog.
        
        DELEGATE: Replaces app-owned metadata storage.
        """
        try:
            wc = self._get_workspace_client()
            full_name = f"{catalog_name}.{schema_name}.{table_name}"
            table = wc.tables.get(full_name)
            
            return {
                "full_name": table.full_name,
                "name": table.name,
                "catalog": catalog_name,
                "schema": schema_name,
                "table_type": table.table_type,
                "data_source_format": table.data_source_format,
                "columns": [
                    {
                        "name": col.name,
                        "type": col.type_name,
                        "type_text": col.type_text,
                        "type_json": col.type_json,
                        "position": col.position,
                        "comment": col.comment,
                        "nullable": col.nullable,
                        "partition_index": col.partition_index
                    }
                    for col in (table.columns or [])
                ],
                "owner": table.owner,
                "comment": table.comment,
                "properties": table.properties or {},
                "storage_location": table.storage_location,
                "view_definition": table.view_definition,
                "created_at": str(table.created_at) if table.created_at else None,
                "updated_at": str(table.updated_at) if table.updated_at else None,
                "table_id": table.table_id,
                "metastore_id": table.metastore_id
            }
        except Exception as e:
            logger.error("Failed to get table metadata for %s: %s", full_name, e)
            return None
    
    def get_table_lineage(
        self,
        catalog_name: str,
        schema_name: str,
        table_name: str
    ) -> Dict[str, Any]:
        """
        Get automatic lineage from Unity Catalog.
        
        DELEGATE: Replaces app-owned lineage tracking (catalog snapshots/diff).
        This is a major efficiency win - UC tracks lineage automatically.
        """
        try:
            wc = self._get_workspace_client()
            full_name = f"{catalog_name}.{schema_name}.{table_name}"
            
            # Get lineage using UC API
            lineage = wc.lineage.get_by_table(table_name=full_name)
            
            upstream_tables = []
            downstream_tables = []
            
            if lineage.upstreams:
                for upstream in lineage.upstreams:
                    upstream_tables.append({
                        "table_name": upstream.table_info.name if upstream.table_info else None,
                        "full_name": upstream.table_info.full_name if upstream.table_info else None,
                        "catalog": upstream.table_info.catalog_name if upstream.table_info else None,
                        "schema": upstream.table_info.schema_name if upstream.table_info else None
                    })
            
            if lineage.downstreams:
                for downstream in lineage.downstreams:
                    downstream_tables.append({
                        "table_name": downstream.table_info.name if downstream.table_info else None,
                        "full_name": downstream.table_info.full_name if downstream.table_info else None,
                        "catalog": downstream.table_info.catalog_name if downstream.table_info else None,
                        "schema": downstream.table_info.schema_name if downstream.table_info else None
                    })
            
            return {
                "table": full_name,
                "upstream": upstream_tables,
                "downstream": downstream_tables,
                "source": "unity_catalog_automatic"
            }
            
        except Exception as e:
            logger.warning("Lineage not available for %s.%s.%s: %s", 
                         catalog_name, schema_name, table_name, e)
            return {
                "table": f"{catalog_name}.{schema_name}.{table_name}",
                "upstream": [],
                "downstream": [],
                "source": "unavailable",
                "error": str(e)
            }
    
    def get_table_tags(
        self,
        catalog_name: str,
        schema_name: str,
        table_name: str
    ) -> Dict[str, str]:
        """
        Get Unity Catalog tags (includes auto-classified PII).
        
        DELEGATE: Replaces DAMA classifier for Databricks sources.
        UC auto-classification is more accurate and up-to-date.
        """
        try:
            wc = self._get_workspace_client()
            full_name = f"{catalog_name}.{schema_name}.{table_name}"
            table = wc.tables.get(full_name)
            
            return table.tags or {}
            
        except Exception as e:
            logger.warning("Could not get tags for %s: %s", full_name, e)
            return {}
    
    def get_column_tags(
        self,
        catalog_name: str,
        schema_name: str,
        table_name: str,
        column_name: str
    ) -> Dict[str, str]:
        """
        Get Unity Catalog column-level tags (PII classification).
        
        DELEGATE: Column-level PII detection from UC.
        """
        try:
            wc = self._get_workspace_client()
            full_name = f"{catalog_name}.{schema_name}.{table_name}"
            table = wc.tables.get(full_name)
            
            # Find the column
            for col in (table.columns or []):
                if col.name == column_name:
                    return col.tags or {}
            
            return {}
            
        except Exception as e:
            logger.warning(
                "Could not get column tags for %s.%s: %s",
                full_name, column_name, e
            )
            return {}
    
    def get_table_grants(
        self,
        catalog_name: str,
        schema_name: str,
        table_name: str
    ) -> List[Dict[str, Any]]:
        """
        Get access grants for a table.
        
        DELEGATE: RBAC from Unity Catalog grants.
        """
        try:
            wc = self._get_workspace_client()
            full_name = f"{catalog_name}.{schema_name}.{table_name}"
            
            grants = wc.grants.get(securable_type="TABLE", full_name=full_name)
            
            grant_list = []
            for assignment in (grants.privilege_assignments or []):
                grant_list.append({
                    "principal": assignment.principal,
                    "privileges": assignment.privileges or []
                })
            
            return grant_list
            
        except Exception as e:
            logger.warning("Could not get grants for %s: %s", full_name, e)
            return []
    
    def search_tables(
        self,
        query: str,
        max_results: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Search for tables across Unity Catalog using metadata.
        
        Args:
            query: Search query string
            max_results: Maximum number of results
            
        Returns:
            List of matching tables with metadata
        """
        conn = self._get_sql_connection()
        cursor = conn.cursor()
        
        try:
            # Search using information_schema
            sql_query = """
                SELECT 
                    table_catalog,
                    table_schema,
                    table_name,
                    table_type,
                    comment
                FROM system.information_schema.tables
                WHERE LOWER(table_name) LIKE LOWER(?)
                   OR LOWER(comment) LIKE LOWER(?)
                ORDER BY table_catalog, table_schema, table_name
                LIMIT ?
            """
            
            search_pattern = f"%{query}%"
            cursor.execute(sql_query, (search_pattern, search_pattern, max_results))
            
            results = []
            for row in cursor.fetchall():
                results.append({
                    "catalog": row[0],
                    "schema": row[1],
                    "name": row[2],
                    "full_name": f"{row[0]}.{row[1]}.{row[2]}",
                    "type": row[3],
                    "comment": row[4]
                })
            
            return results
            
        finally:
            cursor.close()
    
    def close(self):
        """Close connections."""
        if self.sql_conn:
            try:
                self.sql_conn.close()
            except Exception as e:
                logger.warning("Error closing SQL connection: %s", e)
            finally:
                self.sql_conn = None
        
        # Workspace client doesn't need explicit cleanup
        self.workspace_client = None


def get_unity_catalog_service_for_user(
    connection: DBConnection,
    user=None,
    db_session=None
) -> UnityCatalogService:
    """
    Factory function to create Unity Catalog service with proper token.
    
    In Databricks native mode (OAuth), this uses the user's OAuth token.
    In standalone mode (PAT), this uses the connection's access token.
    
    Args:
        connection: DBConnection model
        user: Current User object (for OAuth mode)
        db_session: Database session (for token refresh if needed)
        
    Returns:
        UnityCatalogService instance with appropriate token
    """
    is_native_mode = getattr(settings, "DATABRICKS_NATIVE_MODE", False)
    
    if is_native_mode and user:
        # OAuth mode: use user's token
        from app.services.databricks_auth_service import databricks_auth_service
        
        # Ensure token is valid (refresh if needed)
        if db_session:
            import asyncio
            access_token = asyncio.run(
                databricks_auth_service.ensure_token_valid(user, db_session)
            )
        else:
            access_token = user.databricks_access_token
        
        if not access_token:
            raise ValueError(
                "User does not have Databricks OAuth token. "
                "Please authenticate via /auth/databricks/login"
            )
        
        logger.info(f"Creating UC service with OAuth token for user {user.email}")
        return UnityCatalogService(connection, user_access_token=access_token)
    
    else:
        # PAT mode: use connection's token
        logger.info("Creating UC service with connection PAT token")
        return UnityCatalogService(connection)
