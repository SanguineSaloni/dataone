-- @param run_id STRING
WITH selected_run AS (
  SELECT CASE
    WHEN :run_id <> '' THEN :run_id
    ELSE max_by(run_id, started_at)
  END AS run_id
  FROM workspace.dataone_ops.project_runs
)
SELECT
  c.row_id AS record_id,
  c.cleaned_record_json,
  c.issue_count,
  c.transformed_count,
  c.is_quarantined,
  CASE WHEN c.is_quarantined THEN 'QUARANTINED' ELSE 'READY' END AS record_status,
  c.cleaned_at
FROM workspace.dataone_gold.cleaned_records AS c
INNER JOIN selected_run AS s ON c.run_id = s.run_id
ORDER BY c.is_quarantined DESC, c.issue_count DESC, c.row_id ASC
LIMIT 100;
