-- @param run_id STRING
WITH selected_run AS (
  SELECT CASE
    WHEN :run_id <> '' THEN :run_id
    ELSE max_by(run_id, started_at)
  END AS run_id
  FROM workspace.dataone_ops.project_runs
)
SELECT
  t.transformation,
  t.evaluated_cells,
  t.changed_cells,
  ROUND(100.0 * t.changed_cells / NULLIF(t.evaluated_cells, 0), 1) AS change_rate_pct,
  CASE WHEN t.changed_cells > 0 THEN 'APPLIED' ELSE 'NO_CHANGE' END AS action_status
FROM workspace.dataone_gold.transformation_summary AS t
INNER JOIN selected_run AS s ON t.run_id = s.run_id
ORDER BY t.changed_cells DESC, t.evaluated_cells DESC, t.transformation ASC;
