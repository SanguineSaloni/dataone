-- [DBX-UC-METADATA] Unity Catalog information_schema supplies the governed
-- asset inventory; the browser never calls catalog metadata APIs directly.
WITH dataone_schemas AS (
  SELECT *
  FROM VALUES
    ('dataone_bronze', 'INGEST', 1),
    ('dataone_silver', 'STANDARDIZE', 2),
    ('dataone_gold', 'SERVE', 3),
    ('dataone_ops', 'CONTROL', 4)
  AS schemas(schema_name, data_layer, layer_order)
),
visible_tables AS (
  SELECT table_schema, table_name, table_type
  FROM workspace.information_schema.tables
  WHERE table_schema IN ('dataone_bronze', 'dataone_silver', 'dataone_gold', 'dataone_ops')
    AND table_name NOT RLIKE '^(__materialization_|event_log_)'
),
column_counts AS (
  SELECT table_schema, table_name, COUNT(*) AS column_count
  FROM workspace.information_schema.columns
  WHERE table_schema IN ('dataone_bronze', 'dataone_silver', 'dataone_gold', 'dataone_ops')
    AND table_name NOT RLIKE '^(__materialization_|event_log_)'
  GROUP BY table_schema, table_name
)
SELECT
  s.schema_name,
  s.data_layer,
  COUNT(v.table_name) AS table_count,
  SUM(CASE WHEN v.table_type = 'MATERIALIZED_VIEW' THEN 1 ELSE 0 END) AS materialized_view_count,
  SUM(CASE WHEN v.table_type = 'MANAGED' THEN 1 ELSE 0 END) AS managed_table_count,
  COALESCE(SUM(c.column_count), 0) AS column_count,
  COALESCE(concat_ws(', ', sort_array(collect_set(v.table_name))), '') AS assets
FROM dataone_schemas AS s
LEFT JOIN visible_tables AS v ON s.schema_name = v.table_schema
LEFT JOIN column_counts AS c
  ON v.table_schema = c.table_schema AND v.table_name = c.table_name
GROUP BY s.schema_name, s.data_layer, s.layer_order
ORDER BY s.layer_order ASC;
