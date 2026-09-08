# Schema Mapper AI Suggestion — Phase 1 Implementation Plan

**Based on:** `schema-mapper-ai-suggestion-upgrades-brainstorm.md` (prioritized)  
**Goal:** Deliver multi-source N:1 suggestions, value-pattern profile injection, relationship-aware matching, and confidence calibration.  
**Ship window:** ~2 weeks (single sprint)  

---

## Files to Create / Modify

### A — Multi-source N:1 Suggestions (model + backend)

**Files:**
- `backend/app/models/mapping.py` — modify `AISuggestion`: change `source_table`/`source_column` to `sources: JSON` (list of refs), add `suggested_transformation: JSON` field (reuse existing pattern)
- `backend/app/schemas/mapping.py` — add `SuggestionResponseV2` with `sources: List[SourceRef]` instead of `source_table`/`source_column`
- `backend/app/services/ai_service.py` — modify `match_schemas` output to return a *set* of source columns per target, not one best

**Key design:** `AISuggestion.sources` stores `[{table, column, type}, ...]` — the same shape as `FieldMapping.sources`. Accepted suggestions create a `FieldMapping` with all sources in one shot.

### B — Value-pattern profile injection

**Files:**
- `backend/app/services/ai_service.py` — add `_enrich_with_profiles(profile_data)` step before `match_schemas`
- `backend/app/services/ai_service.py` — add `_pattern_heuristic(distinct_count, null_rate, ...)` → returns `value_pattern: float`

**Heuristics:**
- `distinct_count == 1` → `value_pattern: 90` (all same value)
- `null_rate > 0.5` → `value_pattern: 75` (most are null → coalesce)
- `min_value == max_value` and type=string → `value_pattern: 85`
- `avg_length` (from ColumnProfile) vs `char_length(target_col)` → `value_pattern: 70` if near match

### C — Relationship-aware matching

**Files:**
- `backend/app/services/ai_service.py` — add `_fetch_related_entities(...)` that queries:
  - `Pipeline` → exists `source_table` ↔ `target_table`
  - `SemanticRelation` → `source_column.tags ∩ target_column.tags`
  - `Mapping` → `source_column already mapped to target_column` in any workspace
- `backend/app/services/mapping_tasks.py` — call `_fetch_related_entities` before each `match_schemas` call, pass as context

**Output:** `components["relationship_match"]` = 0–100, shown in the `SuggestionPanel` "Why this match?" expansion as an extra bar.

### F — Confidence calibration

**Files:**
- `backend/app/models/confidence_calibration.py` — new SQLAlchemy model
- `backend/app/services/confidence_calibration_service.py` — `update(src_type, tgt_type, outcome)` + `predict_range(src_type, tgt_type)`

**Schema:**
```python
class ConfidenceCalibration(Base):
    __tablename__ = "confidence_calibration"
    id = Column(Integer, pk)
    source_type_family = Column(String, nullable=False)  # normalized: "text" | "int" | ...
    target_type_family = Column(String, nullable=False)
    accepted = Column(Integer, default=0)
    rejected = Column(Integer, default=0)
    last_seen_at = Column(DateTime(timezone=True), server_default=func.now())
    # Index: (source_type_family, target_type_family, last_seen_at)
```

**Backend service:**
- `predict_range(src_family, tgt_family)` → `{low_ci, high_ci, n_samples, is_calibrated: bool}`
- `record_outcome` called by `accept_suggestion` / `reject_suggestion` on every decision

**Frontend:** `ConfidenceHeatmap` already shows per-component bars. Add a "Calibrated" label if `n_samples >= 30`, "Learned" if `n >= 10`, "Heuristic" otherwise. Confidence range is shown as `80% ± 8%` instead of `80%`.

---

## Detailed Task Breakdown

### Task 1: Model changes (A + F)
1. Modify `AISuggestion` — `sources` JSON field (list `[{table, column, type}]`), `suggested_sources_count` int
2. Create `ConfidenceCalibration` model
3. Add `migrate_alembic` entry or `Base.metadata.create_all` (no Alembic; SQLAlchemy create_all)
4. Commit

### Task 2: Backend — `match_schemas` multi-source (A)
1. Change `match_schemas` output: instead of `{"source": "col_a", "target": "col_b", "confidence": 95}` → `{"sources": [{"table": "src_t", "column": "col_a"}], "target": {"table": "tgt_t", "column": "col_b"}, "transformation": {"kind": "direct"}}`
2. Add `_build_multi_source_expression(matches)` → if 3+ sources → `concat` parts, if 2 → `coalesce`
3. Unit test: `test_match_schemas_multi_source()` — verify 3 sources → 1 target produces a concat AST

### Task 3: Value-pattern injection (B)
1. Add `_enrich_with_profiles(db, mapping_id)` to `mapping_tasks.py` — queries `CatalogColumn` + `ColumnProfile` tables
2. Pass `profile_data` to `_compute_components` → populates `value_pattern` field
3. Pattern heuristic: `AISuggestion._pattern_heuristic(distinct_count, null_rate, avg_length)`
4. Unit test: `test_value_pattern_column_with_single_value()` → `value_pattern = 90`
5. Unit test: `test_value_pattern_column_all_nulls()` → `value_pattern = 75`

### Task 4: Relationship matching (C)
1. Add `_fetch_related_entities` to `mapping_tasks.py` — query:
   - `select * from pipelines where source_connection_id = ? and target_connection_id = ?`
   - `select * from semantic_relations where source_table = ? and target_table = ?`
2. Pass `relationship_match` score to `_compute_components` → `components["relationship_match"]`
3. Map existing `Pipeline` relationships: if a pipeline already maps `src_tbl` → `tgt_tbl`, add `components["pipeline_match"] = 85`
4. Unit test: `test_relationship_matching_with_existing_pipeline()`

### Task 5: Confidence calibration (F)
1. Create `ConfidenceCalibrationService`:
   - `record_decision(db, suggestion, accepted=True/False)` — updates calibration counts
   - `predict(db, src_type, tgt_type)` → returns `{calibrated: True, range: {low, high}, n}`
2. Hook into `mapping_service.py` — `accept_suggestion` / `reject_suggestion` calls `ConfidenceCalibrationService.record_decision`
3. `SuggestionPanel.tsx` — show `80% (calibrated, n=42)` vs `80% (heuristic)` styling
4. `ConfidenceHeatmap.tsx` — add a `calibrated` vs `heuristic` toggle mode

### Task 6: Frontend — multi-source card UI (A)
1. `SuggestionPanel.tsx` — change `pending.map(...)` from showing `{source_table}.{source_column} → {target_table}.{target_column}` to showing `[{sources}.{source_column}]*N → {target_table}.{target_column}` with a `(N sources)` badge
2. Accept button → `POST .../suggestions/{id}/accept` with `sources: [...]` body — creates `FieldMapping` with all sources
3. Edit mode → pre-fills `TransformEditor` with multi-source concat

### Task 7: Tests
1. `test_mapping_tasks_multi_source.py` — fixture: 3 source cols → 1 target → `match_schemas` returns `sources: [col_a, col_b, col_c]`
2. `test_confidence_calibration_record.py` — fixture: `accept` + `reject` → `predict` returns correct range
3. `test_value_pattern_injection.py` — mock `ColumnProfile` with `distinct_count=1` → `value_pattern = 90`
4. `test_relationship_matching.py` — mock `Pipeline` with `src_tbl.name = "crm_users"` and `tgt_tbl.name = "dw_customers"` → returns `pipeline_match = 85`

---

## Commit Plan

```
commit 1: feat(mapping): add AISuggestion.sources JSON, ConfidenceCalibration model
commit 2: feat(mapping): multi-source match_schemas — returns set, not single match
commit 3: feat(mapping): value-pattern injection from ColumnProfile
commit 4: feat(mapping): relationship-aware matching — pipeline + semantic relation
commit 5: feat(mapping): confidence calibration — record + predict, UI display
```

---

## Acceptance Criteria

- [ ] `match_schemas` for `{src1, src2, src3} → tgt` returns a single `AISuggestion` with `sources: [{src1}, {src2}, {src3}]` instead of 3 separate `AISuggestion` rows
- [ ] Accepting a multi-source suggestion creates `FieldMapping` with `sources: [{src1}, {src2}, {src3}]` and `transformation: {kind: "concat", parts: [...]}`
- [ ] Value-pattern `_enrich_with_profiles` produces `value_pattern > 0` on a column with `distinct_count == 1`, `null_rate > 0, min/max values`
- [ ] `ConfidenceHeatmap` shows a "Calibrated" label when `n >= 30` and "Heuristic" when `n < 10`
- [ ] Relationship-aware matching shows a `pipeline_match` component when a pipeline connects the same tables
- [ ] All existing unit tests pass without regression