"""
Databricks Auto-Discovery Service.

When DataOne runs as a Databricks App, automatically:
1. Detect workspace connection details
2. Create a default Databricks connection
3. Discover and cache Unity Catalog schema
4. Set up default data sources
"""
import logging
import os
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session

from app.models.connection import DBConnection
from app.connectors.databricks_connector import DatabricksConnector
from app.services.schema_catalog_service import SchemaCatalogService

logger = logging.getLogger(__name__)


class DatabricksAutoDiscoveryService:
    """Handles automatic Databricks workspace integration for Apps mode."""
    
    @staticmethod
    def is_databricks_app_mode() -> bool:
        """Check if DataOne is running as a Databricks App."""
        return os.getenv("DATABRICKS_AUTO_DISCOVER") == "true"
    
    @staticmethod
    def get_workspace_connection_details() -> Optional[Dict[str, str]]:
        """
        Extract Databricks connection details from environment.
        Returns None if not available or incomplete.
        """
        host = os.getenv("DATABRICKS_WORKSPACE_HOST") or os.getenv("DATABRICKS_SERVER_HOSTNAME") or os.getenv("DATABRICKS_HOST")
        token = os.getenv("DATABRICKS_WORKSPACE_TOKEN") or os.getenv("DATABRICKS_TOKEN")
        client_id = os.getenv("DATABRICKS_CLIENT_ID")
        client_secret = os.getenv("DATABRICKS_CLIENT_SECRET")
        http_path = os.getenv("DATABRICKS_WAREHOUSE_PATH") or os.getenv("DATABRICKS_HTTP_PATH")
        
        # We need either a token or OAuth credentials
        has_auth = bool(token) or bool(client_id and client_secret)
        
        if host and has_auth:
            # If we have OAuth but no token, fetch the M2M token explicitly
            if not token and client_id and client_secret:
                try:
                    import requests
                    logger.info("Fetching M2M OAuth token directly from Databricks...")
                    token_url = f"https://{host}/oidc/v1/token"
                    data = {"grant_type": "client_credentials", "scope": "all-apis"}
                    auth = (client_id, client_secret)
                    r = requests.post(token_url, data=data, auth=auth, timeout=10)
                    r.raise_for_status()
                    token = r.json().get("access_token")
                    logger.info("Successfully fetched M2M token!")
                except Exception as e:
                    logger.error(f"Failed to fetch M2M OAuth token: {e}")

            # If HTTP path is missing, try to auto-discover it using the SDK
            if not http_path:
                try:
                    logger.info("No HTTP Path provided. Attempting to auto-discover a SQL Warehouse...")
                    from databricks.sdk import WorkspaceClient
                    
                    # Do NOT pass token=token here, because DATABRICKS_CLIENT_ID is in the environment
                    # and the SDK will crash complaining about multiple auth methods if we pass a token too.
                    w = WorkspaceClient(host=f"https://{host}")
                    
                    # Try to find a running warehouse first
                    warehouses = w.warehouses.list()
                    selected_wh = None
                    for wh in warehouses:
                        if wh.state and wh.state.value == "RUNNING":
                            selected_wh = wh
                            break
                    
                    # Fallback to any warehouse
                    if not selected_wh:
                        for wh in warehouses:
                            selected_wh = wh
                            break
                            
                    if selected_wh and selected_wh.odbc_params:
                        http_path = selected_wh.odbc_params.path
                        logger.info(f"Auto-discovered SQL Warehouse: {selected_wh.name} ({http_path})")
                except Exception as e:
                    logger.warning(f"Failed to auto-discover SQL Warehouse: {e}")

            return {
                "server_hostname": host,
                "access_token": token or "", 
                "http_path": http_path or "/sql/1.0/warehouses/default"
            }
            
        return None
    
    @staticmethod
    def create_auto_connection(db: Session) -> Optional[DBConnection]:
        """
        Create an automatic Databricks connection if workspace details are available.
        Returns the created connection or None if not possible.
        """
        if not DatabricksAutoDiscoveryService.is_databricks_app_mode():
            return None
            
        # Check if auto-connection already exists
        existing = db.query(DBConnection).filter(
            DBConnection.name == "Databricks Workspace (Auto)",
            DBConnection.is_deleted == False
        ).first()
        
        if existing:
            logger.info("Auto-discovered Databricks connection already exists")
            return existing
            
        # Get connection details
        details = DatabricksAutoDiscoveryService.get_workspace_connection_details()
        if not details:
            logger.warning("Could not auto-discover Databricks workspace connection details")
            return None
            
        try:
            # Test the connection first
            connector = DatabricksConnector(
                server_hostname=details["server_hostname"],
                http_path=details["http_path"], 
                access_token=details["access_token"]
            )
            
            test_result = connector.test_connection()
            if not test_result.success:
                logger.error(f"Auto-discovery connection test failed: {test_result.error_message}")
                return None
                
            # Create the connection record
            connection = DBConnection(
                name="Databricks Workspace (Auto)",
                type="databricks",
                # Store connection details in config JSON
                config={
                    "server_hostname": details["server_hostname"],
                    "http_path": details["http_path"],
                    "access_token": details["access_token"],
                    "auto_discovered": True,
                    "host": details["server_hostname"],
                    "port": 443,
                    "database": "main",
                    "username": "auto-discovered",
                    "catalog": "main",
                    "schema": "default"
                },
                owner_email="admin@dataplane.ai"  # Default admin
            )
            
            db.add(connection)
            db.commit()
            db.refresh(connection)
            
            logger.info(f"Created auto-discovered Databricks connection: {connection.name}")
            return connection
            
        except Exception as e:
            logger.error(f"Failed to create auto-discovered connection: {e}")
            return None
        finally:
            connector.close()
    
    @staticmethod  
    def discover_and_cache_schema(db: Session, connection: DBConnection) -> bool:
        """
        Automatically discover Unity Catalog schema and populate DataOne's catalog.
        Returns True if successful, False otherwise.
        """
        try:
            logger.info("Starting auto-discovery of Unity Catalog schema...")
            
            # Create connector from connection config
            config = connection.config or {}
            connector = DatabricksConnector(
                server_hostname=config["server_hostname"],
                http_path=config["http_path"],
                access_token=config["access_token"], 
                catalog=config.get("catalog", "main"),
                schema=config.get("schema", "default")
            )
            
            # Discover catalogs
            catalogs = connector.get_catalogs()
            logger.info(f"Discovered {len(catalogs)} catalogs")
            
            schema_service = SchemaCatalogService()
            
            for catalog_info in catalogs[:3]:  # Limit to first 3 catalogs to avoid timeout
                catalog_name = catalog_info["name"]
                logger.info(f"Processing catalog: {catalog_name}")
                
                # Get schemas in this catalog
                schemas = connector.get_schemas(catalog_name)
                
                for schema_info in schemas[:5]:  # Limit schemas per catalog
                    schema_name = schema_info["name"] 
                    logger.info(f"Processing schema: {catalog_name}.{schema_name}")
                    
                    # Temporarily switch connector to this catalog/schema
                    schema_connector = DatabricksConnector(
                        server_hostname=config["server_hostname"],
                        http_path=config["http_path"],
                        access_token=config["access_token"],
                        catalog=catalog_name,
                        schema=schema_name
                    )
                    
                    # Get tables in this schema
                    tables = schema_connector.get_tables()
                    
                    for table_name in tables[:10]:  # Limit tables per schema
                        try:
                            # Get table schema
                            columns = schema_connector.get_table_schema(table_name)
                            
                            # Store in DataOne catalog
                            full_table_name = f"{catalog_name}.{schema_name}.{table_name}"
                            schema_service.store_table_metadata(
                                db=db,
                                connection_id=connection.id,
                                table_name=full_table_name,
                                columns=columns,
                                source_type="unity_catalog"
                            )
                            
                            logger.debug(f"Cached schema for {full_table_name}")
                            
                        except Exception as e:
                            logger.warning(f"Could not cache schema for {catalog_name}.{schema_name}.{table_name}: {e}")
                    
                    schema_connector.close()
            
            connector.close()
            logger.info("✅ Unity Catalog auto-discovery completed successfully")
            return True
            
        except Exception as e:
            logger.error(f"Auto-discovery failed: {e}")
            return False
    
    @staticmethod
    def setup_auto_discovery(db: Session) -> bool:
        """
        Full auto-discovery setup: create connection and discover schema.
        Returns True if successful, False otherwise.
        """
        if not DatabricksAutoDiscoveryService.is_databricks_app_mode():
            logger.info("Not in Databricks Apps mode - skipping auto-discovery")
            return False
            
        logger.info("🔍 Starting Databricks workspace auto-discovery...")
        
        # Step 1: Create auto connection
        connection = DatabricksAutoDiscoveryService.create_auto_connection(db)
        if not connection:
            logger.warning("Could not create auto-discovered connection")
            return False
            
        # Step 2: Discover and cache schema
        success = DatabricksAutoDiscoveryService.discover_and_cache_schema(db, connection)
        
        if success:
            logger.info("🎉 Databricks auto-discovery setup completed!")
        else:
            logger.warning("Auto-discovery setup completed with errors")
            
        return success