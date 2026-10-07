-- @param run_id STRING
-- [DBX-SCHEMA-MAPPING] Reads the run's materialized mapping proposals. Review
-- is read-only here; publishing requires a separate authorized mutation store.
WITH selected_run AS (
  SELECT CASE
    WHEN :run_id <> '' THEN :run_id
    ELSE max_by(run_id, started_at)
  END AS run_id
  FROM workspace.dataone_ops.project_runs
)
SELECT
  m.ordinal,
  m.source_column,
  m.target_column,
  m.source_type,
  m.target_type,
  ROUND(100.0 * m.mapping_confidence, 1) AS confidence_pct,
  CASE
    WHEN m.source_column = m.target_column THEN 'EXACT_NAME'
    ELSE 'NORMALIZED_NAME'
  END AS name_comparison,
  CASE
    WHEN m.source_type = m.target_type THEN 'TYPE_MATCH'
    ELSE 'TYPE_CHANGE'
  END AS type_comparison,
  CASE
    WHEN m.mapping_confidence >= 0.95 AND m.source_type = m.target_type THEN 'AUTO_MAPPED'
    ELSE 'REVIEW_REQUIRED'
  END AS review_status,
  m.profiled_at
FROM workspace.dataone_gold.schema_mapping AS m
INNER JOIN selected_run AS s ON m.run_id = s.run_id
QUALIFY row_number() OVER (
  PARTITION BY m.run_id, m.ordinal
  ORDER BY m.profiled_at DESC
) = 1
ORDER BY m.ordinal ASC;
