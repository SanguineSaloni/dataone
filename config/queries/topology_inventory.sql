-- @param run_id STRING
-- [DBX-TOPOLOGY] This is an application processing-stage inventory, not a claim
-- that native Unity Catalog system lineage has been queried.
WITH selected_run AS (
  SELECT CASE
    WHEN :run_id <> '' THEN :run_id
    ELSE max_by(run_id, started_at)
  END AS run_id
  FROM workspace.dataone_ops.project_runs
),
run_info AS (
  SELECT p.*
  FROM workspace.dataone_ops.project_runs AS p
  INNER JOIN selected_run AS s ON p.run_id = s.run_id
  QUALIFY row_number() OVER (PARTITION BY p.run_id ORDER BY p.started_at DESC) = 1
)
SELECT
  1 AS edge_order,
  run_id,
  source_identifier AS source_node,
  'workspace.dataone_bronze.ingested_cells' AS target_node,
  'INGEST_AND_PROFILE' AS operation,
  'Lakeflow Job' AS databricks_component,
  'CAPTURED' AS governance_state
FROM run_info
UNION ALL
SELECT 2, run_id, 'workspace.dataone_bronze.ingested_cells', 'workspace.dataone_gold.clean_cells',
  'CLEAN_AND_CLASSIFY', 'Lakeflow Pipeline', 'GOVERNED'
FROM run_info
UNION ALL
SELECT 3, run_id, 'workspace.dataone_gold.clean_cells', 'workspace.dataone_gold.quality_summary',
  'AGGREGATE_QUALITY', 'Lakeflow Pipeline', 'PUBLISHED'
FROM run_info
UNION ALL
SELECT 4, run_id, 'workspace.dataone_gold.clean_cells', 'workspace.dataone_gold.cleaned_records',
  'ASSEMBLE_RECORDS', 'Lakeflow Pipeline', 'PUBLISHED'
FROM run_info
UNION ALL
SELECT 5, run_id, 'workspace.dataone_ops.schema_profiles', 'workspace.dataone_gold.schema_mapping',
  'PUBLISH_SCHEMA_CONTRACT', 'Unity Catalog', 'PUBLISHED'
FROM run_info
UNION ALL
SELECT 6, run_id, 'workspace.dataone_gold.clean_cells', 'workspace.dataone_gold.commerce_performance',
  'BUILD_ANALYTICS', 'SQL Warehouse', 'PUBLISHED'
FROM run_info
ORDER BY edge_order ASC;
