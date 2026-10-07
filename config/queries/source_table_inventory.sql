-- @param sourceCatalog STRING = dataone_mysql_source
-- @param sourceSchema STRING = dataone_source
-- @param refreshToken STRING = initial

-- [DBX-FEDERATION-METADATA] Present only the AWS MySQL datasets installed under
-- the configured foreign catalog. The browser receives friendly database/table
-- metadata; the three-part Unity Catalog identifier is assembled internally.
SELECT
  'AWS RDS MySQL' AS source_system,
  t.table_schema AS database_name,
  t.table_name AS dataset_name,
  t.table_catalog,
  t.table_schema,
  t.table_name,
  t.table_type,
  t.is_insertable_into,
  COUNT(c.column_name) AS column_count
FROM system.information_schema.tables AS t
LEFT JOIN system.information_schema.columns AS c
  ON t.table_catalog = c.table_catalog
 AND t.table_schema = c.table_schema
 AND t.table_name = c.table_name
WHERE t.table_catalog = :sourceCatalog
  AND t.table_schema = :sourceSchema
  AND t.table_type = 'FOREIGN'
  -- refreshToken is intentionally included in the query signature so the UI
  -- can invalidate AppKit's query cache after REFRESH FOREIGN SCHEMA succeeds.
  AND :refreshToken IS NOT NULL
GROUP BY
  t.table_catalog,
  t.table_schema,
  t.table_name,
  t.table_type,
  t.is_insertable_into
ORDER BY t.table_name
LIMIT 2000;
