-- @param run_id STRING
WITH selected_run AS (
  SELECT CASE
    WHEN :run_id <> '' THEN :run_id
    ELSE max_by(run_id, started_at)
  END AS run_id
  FROM workspace.dataone_ops.project_runs
)
SELECT
  COALESCE(c.category, 'Uncategorized') AS category,
  c.order_count,
  COALESCE(c.revenue, 0.0) AS revenue,
  c.delivered_orders,
  ROUND(COALESCE(c.revenue, 0.0) / NULLIF(c.order_count, 0), 2) AS revenue_per_order,
  ROUND(100.0 * c.delivered_orders / NULLIF(c.order_count, 0), 1) AS delivery_rate_pct
FROM workspace.dataone_gold.commerce_performance AS c
INNER JOIN selected_run AS s ON c.run_id = s.run_id
ORDER BY revenue DESC, category ASC;
