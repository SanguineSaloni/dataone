-- @param run_id STRING
WITH selected_run AS (
  SELECT CASE
    WHEN :run_id <> '' THEN :run_id
    ELSE max_by(run_id, started_at)
  END AS run_id
  FROM workspace.dataone_ops.project_runs
)
SELECT
  q.column_name,
  q.source_type,
  q.cell_count,
  q.missing_count,
  q.issue_count,
  q.transformed_count,
  q.quality_score,
  ROUND(100.0 * (q.cell_count - q.missing_count) / NULLIF(q.cell_count, 0), 1) AS completeness_pct,
  CASE
    WHEN q.quality_score >= 95 THEN 'HEALTHY'
    WHEN q.quality_score >=90 THEN 'REVIEW'
    ELSE 'CRITICAL'
  END AS health_status
FROM workspace.dataone_gold.quality_by_column AS q
INNER JOIN selected_run AS s ON q.run_id = s.run_id
ORDER BY q.quality_score ASC, q.issue_count DESC, q.column_name ASC;
