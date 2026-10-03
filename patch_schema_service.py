import re

with open("backend/app/services/schema_service.py", "r") as f:
    content = f.read()

new_get_full = """
    @staticmethod
    def get_full_schema(connection: DBConnection) -> Dict[str, Any]:
        \"\"\"
        Extracts full schema structure (tables and columns) from the connection.
        \"\"\"
        from app.connectors import get_connector
        connector = get_connector(connection)
        try:
            if connection.type.lower() == "databricks":
                # For Databricks Unity Catalog, the connection represents a foreign catalog that contains
                # multiple schemas (databases) from the source server. We must fetch all of them.
                schema_data = {}
                catalog_name = connector.config.get("catalog", "main")
                if catalog_name == 'main':
                    catalog_name = 'dataone_3_mysql_catalog'
                    
                schemas = connector.get_schemas(catalog_name)
                SKIP_SCHEMAS = {"information_schema", "app_database", "mysql", "performance_schema", "sys", "__databricks_internal", "system"}
                
                for sch in schemas:
                    sch_name = sch["name"]
                    if sch_name.lower() in SKIP_SCHEMAS:
                        continue
                        
                    # Create a temporary connector for this schema to fetch its tables
                    sch_connector = get_connector(connection)
                    sch_connector.config["schema"] = sch_name
                    sch_connector.config["catalog"] = catalog_name
                    
                    try:
                        tables = sch_connector.get_tables()
                        # If a schema has no tables, we add a dummy table to show the schema in the UI
                        if len(tables) == 0:
                            schema_data[f"{sch_name}.(empty_schema)"] = []
                        else:
                            for tbl in tables:
                                # Ensure we don't double prepend if get_tables() already prepended
                                if "." in tbl:
                                    full_tbl = tbl
                                else:
                                    full_tbl = f"{sch_name}.{tbl}"
                                schema_data[full_tbl] = sch_connector.get_table_schema(tbl)
                    finally:
                        sch_connector.close()
                return schema_data
            else:
                tables = connector.get_tables()
                schema_data = {}
                for table in tables:
                    schema_data[table] = connector.get_table_schema(table)
                return schema_data
        finally:
            connector.close()
"""

# Replace the get_full_schema method block
import re
content = re.sub(
    r'    @staticmethod\n    def get_full_schema.*?finally:\n            connector\.close\(\)',
    new_get_full.strip('\n'),
    content,
    flags=re.DOTALL
)

with open("backend/app/services/schema_service.py", "w") as f:
    f.write(content)

