import re

file_path = "backend/app/connectors/databricks_connector.py"
with open(file_path, "r") as f:
    content = f.read()

new_get_tables = """    def get_tables(self) -> List[str]:
        \"\"\"
        Fetch list of all table names in the current catalog/schema
        using Databricks Connect V2 natively.
        \"\"\"
        catalog = self.config['catalog']
        schema = self.config['schema']

        # Skip system/internal schemas that can cause quota exceeded errors in free tiers
        if schema.lower() in ("information_schema", "app_database", "mysql", "performance_schema", "sys", "__databricks_internal", "system"):
            logger.info("[Spark] Skipping system schema %s.%s", catalog, schema)
            return []

        try:
            spark = self._get_spark_session()
            tables = []
            
            logger.info("[Spark] Executing SHOW TABLES IN `%s`.`%s`", catalog, schema)
            df = spark.sql(f"SHOW TABLES IN `{catalog}`.`{schema}`")
            
            for row in df.collect():
                if not row.isTemporary:
                    tables.append(row.tableName)
                    
            logger.info("[Spark] Found %d tables in %s.%s", len(tables), catalog, schema)
            return tables
        except Exception as e:
            # If a schema has too many tables for the UC free tier quota, skip it gracefully
            if "QUOTA_EXCEEDED" in str(e):
                logger.warning("[Spark] Quota exceeded for %s.%s: %s", catalog, schema, e)
                return []
            logger.error("[Spark] get_tables failed for %s.%s: %s", catalog, schema, e)
            raise e"""

# Replace the existing get_tables with the new one
content = re.sub(
    r"    def get_tables\(self\) -> List\[str\]:.*?    def get_table_schema\(self, table_name: str\) -> List\[Dict\[str, Any\]\]:",
    new_get_tables + "\n\n    def get_table_schema(self, table_name: str) -> List[Dict[str, Any]]:",
    content,
    flags=re.DOTALL
)

with open(file_path, "w") as f:
    f.write(content)

print("Patched get_tables successfully")
