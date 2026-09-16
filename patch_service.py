import re

with open('backend/app/services/databricks_ingestion_service.py', 'r') as f:
    content = f.read()

new_method = '''
    @staticmethod
    def setup_lakehouse_federation(source_conn, actor: str, user_token=None):
        logger.info("[databricks_ingestion] stage=setup_lakehouse_federation source_connection_id=%s actor=%s", source_conn.id, actor)
        
        src_type = source_conn.type.lower()
        if src_type not in ("mysql", "postgres", "sqlserver", "snowflake"):
            logger.info("Connection type %s not supported for Lakehouse Federation", src_type)
            return {"status": "unsupported", "type": src_type}
        
        cfg = source_conn.config or {}
        host = cfg.get("host", cfg.get("account", ""))
        port = cfg.get("port", "")
        if src_type == "snowflake":
            port = "443"
        elif not port:
            port = "3306" if src_type == "mysql" else "5432" if src_type == "postgres" else "1433"
            
        user = cfg.get("username", cfg.get("user", ""))
        password = cfg.get("password", "")
        
        import re as regex
        clean_host = regex.sub(r'[^A-Za-z0-9_]', '_', host.split('.')[0])
        connection_name = f"dataone_{source_conn.id}_{src_type}_{clean_host}".lower()
        catalog_name = f"dataone_{source_conn.id}_{src_type}_catalog".lower()
        
        try:
            ws = _get_workspace_client(user_token)
            from databricks.sdk.service import catalog
            
            # Map type
            type_map = {
                "mysql": catalog.ConnectionType.MYSQL,
                "postgres": catalog.ConnectionType.POSTGRESQL,
                "sqlserver": catalog.ConnectionType.SQLSERVER,
                "snowflake": catalog.ConnectionType.SNOWFLAKE
            }
            conn_type = type_map[src_type]
            
            options = {
                "host": host,
                "port": str(port),
                "user": user,
                "password": password
            }
            
            if src_type == "postgres" or src_type == "sqlserver":
                options["database"] = cfg.get("database", cfg.get("dbname", ""))
                
            if src_type == "snowflake":
                options["warehouse"] = cfg.get("warehouse", "")
                options["database"] = cfg.get("database", "")
                
            logger.info("Creating Databricks connection: %s", connection_name)
            try:
                ws.connections.create(
                    name=connection_name,
                    connection_type=conn_type,
                    options=options,
                    comment=f"Created by DataOne for source connection {source_conn.id}"
                )
            except Exception as e:
                logger.warning("Failed to create connection (might already exist): %s", e)
                
            logger.info("Creating Databricks foreign catalog: %s", catalog_name)
            try:
                ws.catalogs.create(
                    name=catalog_name,
                    connection_name=connection_name,
                    comment=f"Foreign catalog for DataOne source connection {source_conn.id}"
                )
            except Exception as e:
                logger.warning("Failed to create foreign catalog (might already exist): %s", e)
                
            return {
                "status": "success",
                "connection_name": connection_name,
                "catalog_name": catalog_name
            }
            
        except Exception as e:
            logger.error("[databricks_ingestion] Federation setup failed: %s", e)
            raise
'''

content = content.replace("    @staticmethod\n    def get_or_create_pipeline(", new_method + "\n    @staticmethod\n    def get_or_create_pipeline(")

with open('backend/app/services/databricks_ingestion_service.py', 'w') as f:
    f.write(content)
