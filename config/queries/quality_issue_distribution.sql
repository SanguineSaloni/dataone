-- @param run_id STRING
WITH selected_run AS (
  SELECT CASE
    WHEN :run_id <> '' THEN :run_id
    ELSE max_by(run_id, started_at)
  END AS run_id
  FROM workspace.dataone_ops.project_runs
),
issues AS (
  SELECT q.quality_issue, q.issue_count
  FROM workspace.dataone_gold.quality_issue_distribution AS q
  INNER JOIN selected_run AS s ON q.run_id = s.run_id
)
SELECT
  quality_issue,
  initcap(replace(quality_issue, '_', ' ')) AS issue_label,
  issue_count,
  ROUND(100.0 * issue_count / NULLIF(SUM(issue_count) OVER (), 0), 1) AS share_pct,
  quality_issue <> 'valid' AS is_issue
FROM issues
ORDER BY is_issue DESC, issue_count DESC, quality_issue ASC;
