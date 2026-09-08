## Fix E02 topology bugs (B01–B09)

### 1. Backend: `diff_service.py` — emit edge_type + node indicators

**B01 — Edge type alignment (critical)**
- Add `"edge_type"` field to every edge dict in `generate_graph_data`:
  - `exact_match` → `edge_type: "exact"`, `"confidence": score`
  - `ai_match` → `edge_type: "ai"`, `"confidence": match["confidence"]`
  - `published_mapping` → `edge_type: "business_rule"`, `"confidence": null`
  - `has_issues` tables not in target → new `"missing"` edge with `edge_type: "missing"`
- Keep existing `"type"` field for backward compat.
- Extract AI match confidence from label string into a proper `"confidence"` numeric field.

**B02 — Node indicator fields (critical)**
- `sensitivity`: derive from existing per-column `cls_lookup` levels (already computed at L122-130). Map: any `"High"` → `"critical"`, else max level → lowercase.
- `lineage_confidence`: from `diff_result["table_diffs"][table]["score"]` for matched tables; `None` otherwise.
- `drift_status`: accept a new `drift_events_by_table: Dict[str, bool]` param (computed in `schema.py` router, passed down). Per-table boolean: `"drifted"` or `"stable"`.

**B04 — Target classification symmetry**
- Add `classifications_target` param to `generate_graph_data`. Populate `classification` on target columns identically to source columns.

**B07 — Remove dead x/y computation** (ride-along cleanup)

### 2. Backend: `schema.py` — router changes for drift + target classification

- Compute `target_classifications = SecurityService.classify_schema(target_schema)` (line 222 already does this for source).
- Query latest `DriftEvent` per connection (source + target). Build `drift_events_by_table` dict: for each table in the schema, check if it appears in `tables_added/removed/columns_added/columns_removed/type_changes`.
- Pass `classifications_target` and `drift_events_by_table` to `generate_graph_data`.

### 3. Frontend: `graphLayout.ts` — B05 height fix

- Add indicator row height (~28px) and confidence bar height (~24px) to `estimateNodeHeight`. The function needs to accept an optional `indicators` param (or we add fixed budget that matches the render guards — simpler).
- Add test: node with indicators is taller than without.

### 4. Frontend: `page.tsx` — B03, B06, B08 fixes

**B03 — Edge filtering**: Build `visibleIds = new Set(visibleNodes.map(n => n.id))`, filter edges to `visibleIds.has(e.source) && visibleIds.has(e.target)`.

**B06 — Risk border alignment**: Replace the local `riskColors` map with values from `SeverityChip`'s config (orange for high, amber for medium, neutral for low) so border and chip can never disagree.

**B08 — Detail panel**: Add drift status and lineage confidence to the selected-node detail panel.

### 5. Tests

**Backend `test_graph_real_mappings.py`**: Assert `edge_type` on each edge variant, assert `sensitivity` + `lineage_confidence` on nodes, assert `drift_status` when drift_events provided.

**Backend `test_graph_router.py`**: Assert full endpoint response includes new fields.

**Frontend `graphLayout.test.ts`**: Add height-with-indicators test.

**Frontend `page.test.tsx`** (new): Test edge filtering in source-only mode drops cross-group edges.

### 6. Verify

- `pytest` in `backend/tests/schema/` — all pass
- `npx vitest run` — all topology tests pass
- `npm run lint` — clean on touched files
- `npm run build` — clean
- Update `E02_topology_lineage.md` task statuses and progress log
- Append to `MEMORY.md`