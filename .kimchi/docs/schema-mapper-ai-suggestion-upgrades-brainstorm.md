# Schema Mapper — AI Suggestion Brainstorm: Next-Gen Upgrades

**Date:** 2026-08-01  
**Audience:** Schema Mapper team  
**Based on:** current codebase state (backend `AIService.match_schemas` + `mapping_tasks.py` + `SuggestionPanel.tsx` + `useMapping.ts`)

---

## 1. Current State Summary

| Capability | Status |
|---|---|
| Per-column AI suggestions from `match_schemas` (one LLM call per `source_table→target_table` pair) | ✅ Shipped |
| Name-similarity + type-compatibility + semantic components | ✅ Shipped |
| 11-kind transformation grammar (direct/cast/concat/coalesce/...) | ✅ Shipped |
| Confidence heatmap + breakdown by component | ✅ Shipped |
| Accept/reject with audit | ✅ Shipped |
| `propose_transformations` (null-handling + type-familiy-aware proposals) | ✅ Shipped |
| Per-connection schema catalog + historic column-profile data | ✅ Shipped |

## 2. Gap Analysis

### G1. Single-source bias: no multi-source N:1 intelligence
Current `match_schemas` picks one best source per target column. If a target column needs 3 source columns concatenated (e.g. `full_name = first_name || ' ' || middle_initial || ' ' || last_name`), the suggestion creates *one* source→target match — not a multi-source expression. The `TransformationProposer` *does* generate multi-source concat for N:1, but the suggestion itself doesn't model the relationship. A user who accepts must manually add extra sources.

### G2. Value-pattern analysis is a hard-coded 0.0 placeholder
`_compute_components` returns `value_pattern: 0.0` always. The LLM prompt doesn't ask for value patterns. The backend has `CatalogColumn` + `ColumnProfile` tables with `null_rate`, `distinct_count`, `min_value`, `max_value` — but the suggestion path never queries them. A column `email` with 100% `@` pattern vs `name` with no pattern is a real signal.

### G3. Semantic layer is flat — doesn't use the relationship graph
The system has `Mapping`, `Pipeline`, `SemanticRelation`, `CatalogColumn` — but `match_schemas` treats each column pair in isolation. There's no awareness that `crm_users.email` and `dw_customers.contact_email` are *already related* via an existing pipeline or a business-term tag (`user_identity`).

### G4. No batch / table-level intelligence
Every suggestion is per column. There's no "suggest all columns for this target table at once" mode — the user must click "AI Suggest" per-table. A table with 50 unmapped columns calls `match_schemas` 50 times (once per source table loop), with no shared context between them.

### G5. No drift-triggered re-suggestion
When a schema scan detects a new column or a dropped column, `match_schemas` doesn't re-evaluate existing suggestions. If `source_table` adds a column, no new suggestion fires unless the user explicitly clicks "AI Suggest" again.

### G6. Suggestion confidence is not calibrated
Confidence ranges 0-100 but there's no calibration. Two different `match_schemas` runs can return 95 for "obvious" (same name) and 95 for "weak" (tokens overlap 1/10 but type matches). The `ConfidenceHeatmap` shows a single number — no `expected_accuracy` / `variance` / `n_samples` signal.

### G7. Feedback loop is one-dimensional
`HistoricalMatchService.lookup` bumps score by `15% × accepted_count`. There's no:
- Negative feedback decay (rejected × 2 = lower score next time)
- User-specific model (if Alice always rejects `cast → VARCHAR`, her next suggestion skips it)
- Session-level re-rank (reject `crm_users→dw_customers` → next suggestion prefers a different source)

### G8. Transformation suggestions are too narrow
`propose_transformations` suggests `direct`, `cast`, `coalesce`. An LLM-backed `match_schemas` could propose richer transformations: `concat(first_name, last_name)` → `full_name`, `extract(year from date)` → `year`, `case when status=1 then 'active' else 'inactive'` → `status_label`. The grammar *supports* 11 kinds; only `direct`/`cast`/`coalesce` are proposed.

---

## 3. Upgrade Proposals (A–H, priority-ordered)

### A. Multi-source suggestion intelligence (High)
**Problem:** G1 — one source per target.  
**What:** `match_schemas` returns a *set* of source columns per target, not a single best match. The frontend shows "3 sources → 1 target" in the suggestion card, and `propose_transformations` auto-builds the multi-source concat expression.  
**Cost:** moderate — `Mapping` model supports multi-source edges already (`sources: JSON` is a list). The `AISuggestion` model needs a `sources` array field (currently `source_table`/`source_column` are single).  
**Signal:** null_rate analysis: if 3 source columns each have ≤5% nulls, a concat is safe; if 2/3 are 80% null, suggest `coalesce`.

### B. Value-pattern profile injection (High)
**Problem:** G2 — `value_pattern = 0.0`.  
**What:** Before `match_schemas`, query `ColumnProfile` for each unmapped target column: `distinct_count`, `null_rate`, `min/max`, `sample_values`. Pass this to the LLM prompt as "patterns observed." A column with `distinct_count = 1` (all same value) → `{kind: "default", value: "FIXED"}`. `null_rate > 0.8` → `{kind: "coalesce"}`.  
**Cost:** low — data is already in `CatalogColumn` + `ColumnProfile` tables. One query per unmapped column.  
**Signal:** improve `_compute_components` from `value_pattern: 0.0` to `value_pattern: 85` (real). Feeds into the `ConfidenceHeatmap` visibly.

### C. Relationship-aware semantic matching (High)
**Problem:** G3 — no graph awareness.  
**What:** Before `match_schemas`, query `Pipeline` table: does a pipeline already exist between `source_table` and `target_table`? Query `SemanticRelation`: are any columns already tagged with the same `business_term`? Query `Mapping`: has this exact column pair been mapped in another workspace?  
**Injection:** Add `components["relationship_match"] = 75` when a pipeline connects the tables. Add `components["business_term_match"] = 90` when both columns share a governance term.  
**Cost:** low — 2-3 extra DB queries per `match_schemas` call.  
**Signal:** shows in the "Why this match?" expansion panel as a new bar. Feels smarter without changing the LLM.

### D. Batch suggest mode (Medium)
**Problem:** G4 — per-column only.  
**What:** Add "Suggest all unmapped" button below the existing "AI Suggest" per-table. Calls `match_schemas` once per `(source_table, target_table)` pair with *all* unmapped target columns for that table in one shot (like a `SELECT *` analysis). The LLM sees the full schema and can detect intra-table patterns (e.g. "this table has `phone_mobile`, `phone_work`, `phone_home` — suggest a single `phone_contact` target").  
**Cost:** moderate — changes `match_schemas` API shape from `source_name, target_name, target_schema: [column]` to `target_schema: [full_table]`.  
**UX:** Add a `SegmentedControl` on `SuggestionPanel` with `"Per column" | "Per table"` mode.

### E. Drift-triggered re-suggest + suggestion expiry (Medium)
**Problem:** G5 — stale suggestions.  
**What:** When `SchemaService` detects drift (`new_column` / `dropped_column`), mark existing `AISuggestion` rows for the affected table as `stale` (not `pending` — keep them for audit). On next "AI Suggest" click, the UI shows "3 suggestions are stale due to schema drift — re-generate?"  
**Cost:** low — add `AISuggestion.status: "stale"` enum, `updated_at` column.  
**UX:** Show a "Schema changed" badge on `SuggestionPanel` when drift is detected for the mapping's source/target.

### F. Confidence calibration + uncertainty display (Medium)
**Problem:** G6 — uncalibrated confidence.  
**What:** 
- Track `accept_rate` per `(source_type, target_type)` pair in a new `ConfidenceCalibration` table.
- On every accept/reject, update: `pair (varchar→text) = accepted 12 / rejected 3, p = 0.80`.
- Frontend shows `80%` confidence *range* (not point) — `±10%` when n < 50, `±2%` when n > 1,000.
- `ConsistencyHeatmap`: show predicted confidence vs actual acceptance rate for each type pair.  
**Cost:** moderate — needs a new DB table `confidence_calibration` + a background refresh on the `SuggestionPanel`.  
**UX:** The `ConfidenceHeatmap` already shows per-component bars. Add a "Learned" label to calibrated bars vs "Heuristic" for uncalibrated.

### G. Domain-aware (business glossary) suggestion reranking (Low)
**Problem:** G3 variant — `match_schemas` doesn't know business terms.  
**What:** If `business_term` is set on a source column (e.g. `email_address → PII/email`), and the target column has `PII/email` tag, add `components["domain_match"] = 95`. Rerank: a `domain_match = 95` suggestion shows before a `type_compatibility = 90` + `name_similarity = 80` suggestion even if the raw confidence is lower (because domain relevance is more important).  
**Cost:** low — query `CatalogColumn.governance_classification` if set.  
**UX:** Show "Domain: PII/Email" in the suggestion reason text alongside the existing components.

### H. "Accept and transform" — one-click suggestion apply with richer transforms (Low)
**Problem:** G8 — only `direct`/`cast`/`coalesce`.  
**What:** When a user accepts a suggestion, if `match_schemas` returned a `transformation` field (not just a raw match), the Accept button feeds it into `TransformEditor` pre-filled. The user sees `{kind: "concat", parts: [...]}` already loaded and can tweak rather than starting from scratch.  
**Cost:** low — `AISuggestion` already has `suggested_transformation`. Flow already exists in `acceptSuggestion` — just needs to propagate the `transformation` field through the UI.  
**UX:** The `SuggestionPanel` already shows `suggested_transformation` as a label in the expansion area. Make it clickable instead of a badge.

---

## 4. Implementation Phasing

**Phase 1 (Next sprint — ~2 weeks)**
- ✅ A: Multi-source suggestions (model + backend changes)
- ✅ B: Value-pattern injection (query `ColumnProfile` before `match_schemas`)
- ✅ C: Relationship-aware components (pipeline + semantic relation queries)
- ✅ F: Confidence calibration table + acceptance-rate tracking

**Phase 2 (Following sprint — ~1 week)**
- ✅ D: Batch suggest mode (segmented control + table-level `match_schemas`)
- ✅ E: Drift-triggered re-suggest + `stale` status
- ✅ H: Accept-and-transform (pre-fill TransformEditor)

**Phase 3 (Future — ~1 week)**
- ✅ G: Domain-aware rerank using governance tags
- Negative-feedback decay model
- Per-user suggestion profile (reject → skip user's next match for that pattern)

---

## 5. Risks

| Risk | Mitigation |
|---|---|
| Multi-source AISuggestion increases DB writes (3× per accept) | Keep `sources` as a JSON field on `AISuggestion` (no join table) |
| Batch suggest mode increases LLM token consumption | Cap at 20 unmapped cols, show "Too many — suggest groups" prompt |
| Significant negative feedback from G ("skip") may miss good matches | Use `downweight`, not `block` — the feature can still match through a different source |
| Calibration table needs periodic garbage collection | TTL 90 days on `(type_pair, n < 10)` rows |