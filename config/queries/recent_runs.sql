WITH ranked_runs AS (
  SELECT
    p.*,
    row_number() OVER (PARTITION BY p.run_id ORDER BY p.started_at DESC) AS run_rank
  FROM workspace.dataone_ops.project_runs AS p
),
mapping AS (
  SELECT
    run_id,
    ROUND(100.0 * AVG(mapping_confidence), 1) AS mapping_confidence_pct
  FROM (
    SELECT candidate.*
    FROM workspace.dataone_gold.schema_mapping AS candidate
    QUALIFY row_number() OVER (
      PARTITION BY candidate.run_id, candidate.ordinal
      ORDER BY candidate.profiled_at DESC
    ) = 1
  )
  GROUP BY run_id
),
records AS (
  SELECT
    run_id,
    SUM(CASE WHEN is_quarantined THEN 1 ELSE 0 END) AS quarantined_rows
  FROM workspace.dataone_gold.cleaned_records
  GROUP BY run_id
)
SELECT
  p.run_id,
  p.project_name,
  p.source_mode,
  p.source_format,
  p.source_identifier,
  p.row_count,
  p.column_count,
  COALESCE(q.quality_score, 0.0) AS quality_score,
  COALESCE(m.mapping_confidence_pct, 0.0) AS mapping_confidence_pct,
  COALESCE(r.quarantined_rows, 0) AS quarantined_rows,
  CASE WHEN q.run_id IS NOT NULL THEN 'COMPLETED' ELSE p.status END AS run_status,
  p.started_at,
  q.updated_at
FROM ranked_runs AS p
LEFT JOIN workspace.dataone_gold.quality_summary AS q ON p.run_id = q.run_id
LEFT JOIN mapping AS m ON p.run_id = m.run_id
LEFT JOIN records AS r ON p.run_id = r.run_id
WHERE p.run_rank = 1
ORDER BY p.started_at DESC
LIMIT 20;
