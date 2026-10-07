-- @param run_id STRING
-- [DBX-ANALYTICS][DBX-UC] AppKit executes this named, parameterized query on
-- the resource-bound SQL Warehouse against governed Ops and Gold tables.
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
),
mapping AS (
  SELECT
    m.run_id,
    COUNT(*) AS mapped_columns,
    ROUND(100.0 * AVG(m.mapping_confidence), 1) AS mapping_confidence_pct
  FROM (
    SELECT candidate.*
    FROM workspace.dataone_gold.schema_mapping AS candidate
    INNER JOIN selected_run AS s ON candidate.run_id = s.run_id
    QUALIFY row_number() OVER (
      PARTITION BY candidate.run_id, candidate.ordinal
      ORDER BY candidate.profiled_at DESC
    ) = 1
  ) AS m
  GROUP BY m.run_id
),
records AS (
  SELECT
    c.run_id,
    COUNT(*) AS cleaned_rows,
    SUM(CASE WHEN c.is_quarantined THEN 1 ELSE 0 END) AS quarantined_rows
  FROM workspace.dataone_gold.cleaned_records AS c
  INNER JOIN selected_run AS s ON c.run_id = s.run_id
  GROUP BY c.run_id
)
SELECT
  p.run_id,
  p.project_name,
  p.source_mode,
  p.source_format,
  p.source_identifier,
  p.row_count,
  p.column_count,
  q.cell_count,
  q.valid_cells,
  q.issue_cells,
  q.transformed_cells,
  q.quality_score,
  COALESCE(m.mapped_columns, 0) AS mapped_columns,
  COALESCE(m.mapping_confidence_pct, 0.0) AS mapping_confidence_pct,
  COALESCE(r.cleaned_rows, 0) AS cleaned_rows,
  COALESCE(r.quarantined_rows, 0) AS quarantined_rows,
  CASE WHEN q.run_id IS NOT NULL THEN 'COMPLETED' ELSE p.status END AS run_status,
  p.started_at,
  q.updated_at
FROM run_info AS p
LEFT JOIN workspace.dataone_gold.quality_summary AS q ON p.run_id = q.run_id
LEFT JOIN mapping AS m ON p.run_id = m.run_id
LEFT JOIN records AS r ON p.run_id = r.run_id;
