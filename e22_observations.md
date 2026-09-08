# E2E Demo Walkthrough — Frontend Readiness Observations

Scope: verified every step of `E2E_DEMO_WALKTHROUGH.md` (Scenario A: CRM_Source_Analytics → Data_Warehouse_Target, the recommended first demo) against the actual frontend/backend code — not assumptions. Each item below was traced from UI component → `api.ts`/direct fetch → backend router → service, to confirm it's real and not a stub, mock, or placeholder.

**Verdict: the happy path is demoable end-to-end.** Nothing is a fake/mocked stub. The issues below are naming mismatches (presenter says the wrong button name and looks confused) and one real functionality gap in pipeline creation. Read the "Before you demo" section first.

---

## Before you demo — fix your script for these

1. **Step 6 (Create Pipeline) — Execution Mode and Load Strategy do not exist in the UI.** The walkthrough tells you to "Set Execution Mode: auto/manual" and "Configure Load Strategy: upsert/full_refresh/append." There is no such field anywhere in the pipeline creation form, and no such field in the backend schema (`PipelineCreate` only takes `name`, `source_connection_id`, `target_connection_id`, `mapping_id` — `backend/app/schemas/pipeline.py:16-22`). Load strategy is chosen automatically by the backend per table (`use_upsert = len(group.natural_keys) > 0`, `backend/app/services/pipeline_service.py:229-230`) — there's no "append" mode at all, and no "auto-run-immediately" concept; every pipeline is either triggered manually via "Run now" or by cron. **Skip these sub-steps in the live demo or the presenter will hunt for a control that isn't there.**
2. **AskData: `/dashboard/askdata` is a redirect stub**, not a real page — it bounces to `/dashboard/query-workspace?mode=ask` (`frontend/src/app/dashboard/askdata/page.tsx:1-5`). If your demo script has someone type that URL expecting a full chat page, it'll flash-redirect. Just navigate via the sidebar instead, and rehearse the exact NL questions in Section 7 beforehand — the backend genuinely calls Ollama (llama3) for NL-to-SQL, so output quality on arbitrary phrasing isn't guaranteed the way a canned response would be.
3. **Query Studio is not a sidebar destination** — the sidebar only has "Query Workspace." `/dashboard/query-studio` is also a redirect stub to `/dashboard/query-workspace?mode=sql`. Say "Query Workspace" during the demo, not "Query Studio."
4. **Visualize can't chart a Query Studio JOIN result.** Visualize only builds `GROUP BY` charts against one catalog table at a time — there's no handoff of arbitrary SQL results (e.g. the `fact_revenue JOIN dim_customer` query in Step 8) into the chart builder. Simple single-table charts (e.g. `dim_customer` alone) work fine; don't promise a JOIN-then-chart flow.

---

## Step-by-step findings

| Step | Status | Notes |
|---|---|---|
| 1. Login → Dashboard | ✅ Works | Governance score, connections, activity feed all live (`/api/v1/governance/score`, `/api/v1/dashboard/summary`, `/api/v1/audit/`) |
| 2. Schema Scan & Discovery | ⚠️ Partial | Sidebar label "Schema Intel" is correct, but the button is **"Scan catalog"**, not "Scan Schema." Profiling is a separate "Profile columns" button (async). PII tags, null rate, distinct count are shown; raw sample values are not (only min/max) |
| 3. Create Mapping | ✅ Works | "Schema Mapper" nav, "New Mapping" dialog, "Create mapping" button — all match doc wording exactly |
| 4. Add Field Mappings | ⚠️ Partial | AI Suggest button is actually **"🧠 Get AI Suggestions."** Real transformation kinds are Direct, Cast, Concat, Substring, Coalesce, Upper, Lower, Trim, Default, Null If, Lookup — there is **no literal "Conditional" or "Format" type** (closest equivalents: Coalesce/Default/Null If for conditional logic; Upper/Lower/Trim/Cast for formatting). "Validate" button works verbatim |
| 5. Review & Publish | ⚠️ Partial | There's no "Review" tab. Instead there's a review **stage badge** (draft → pending_review → business_approved → steward_approved → production_ready) plus a separate **Comments panel** for steward comments. "🚀 Publish" button works verbatim and does create an immutable versioned snapshot |
| 6. Create Pipeline | ⚠️ Partial | Name/source/target/mapping selection all work. **Execution Mode and Load Strategy fields don't exist** (see blocker #1 above) |
| 7. Execute Pipeline | ✅ Works | "Run now" → real Celery task → drift check blocks execution when drift detected → Run History tab with re-run action. Minor: failure messages are a string, not per-row/per-transform detail as the doc implies |
| Schema Drift Demo (§5) | ✅ Works | `simulate_e2e_drift.py` is real and functional; a subsequent run is genuinely blocked with a drift message in Run History |
| 8. Query Studio / Verify Results | ⚠️ Partial | Naming mismatch only (see blocker #3) — arbitrary SQL, JOINs, GROUP BY, and pagination (5,000-row cap) all genuinely work against real seeded connections |
| Visualize | ⚠️ Partial | Real chart builder against live data, but single-table only (see blocker #4) |
| Data Quality Scoring | ✅ Works | Real DB-backed scorecard, honest "—" for unmeasured dimensions |
| Impact Analysis | ✅ Works | Real live traversal of mapping/pipeline/semantic relations; honestly shows empty for untracked items (reports/ML models) rather than fabricating |
| Governance Tagging | ✅ Works | Real upsert of owner/steward/classification/retention/compliance fields. Note: automated retention enforcement and compliance reporting are explicitly NOT implemented — don't demo those specifically |
| PII Classification | ✅ Works | Regex/heuristic-based (not ML) — fine for demo, just don't call it "AI-detected" |
| Masking Policies | ✅ Works | Full CRUD, admin-gated |
| Audit Trail | ✅ Works | Most robust feature checked — real pagination, faceted search, CSV/NDJSON export, hash-chain integrity verification |
| AskData NL Queries | ⚠️ Partial | Real Ollama-backed NL-to-SQL, grounded in the schema catalog — but see blockers #2 above on the redirect stub and rehearsing exact phrasing |

---

## Cheat sheet: what to actually say vs. what the doc says

| Doc says | Actually says in the UI |
|---|---|
| "Click Scan Schema" | "Scan catalog" |
| "Click AI Suggest" | "🧠 Get AI Suggestions" |
| "Switch to Review tab" | Use the review stage badge + Comments panel (no tab) |
| Transformation: "Conditional" | Use Coalesce / Default / Null If |
| Transformation: "Format" | Use Upper / Lower / Trim / Cast |
| "Navigate to Query Studio" | Navigate to "Query Workspace" |
| "Navigate to AskData" (direct URL) | Use the sidebar link, not the raw `/dashboard/askdata` URL |

---

## Not checked

- Scenarios B, C, D (only Scenario A / CRM→DW was audited, per the doc's own recommendation for the first demo).
- Actual live execution (this was a static code audit, not a running-app click-through) — recommend one live dry run of the full flow, especially the AskData questions in §7, before presenting.
