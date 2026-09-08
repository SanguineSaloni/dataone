# Auto-Trigger Mapping Suggestions on Mapping Creation — Design

**Date:** 2026-08-01
**Status:** Approved (brainstorm), pending implementation plan

## Problem

AI mapping suggestions (`AISuggestion` rows, generated via `AIService.match_schemas`
against locally-hosted Ollama) are currently computed only on explicit user
action: `POST /mappings/{id}/suggestions` → `MappingService.request_suggestions`
→ `suggest_mappings_task`. Because Ollama is local and materially slower than a
hosted API, the user who just created a mapping and opens the mapper canvas
pays that full inference latency synchronously, staring at an empty canvas.

## Goal

When a user creates a Mapping (source and target connectors both already
known — see `MappingService.create_mapping`, `mapping_service.py:39`),
automatically start AI suggestion generation in the background, so that by
the time the user opens the mapper UI, suggestions are already computed or
in flight.

## Scope

This design covers **schema/mapper suggestions only** — the
`mapping_suggestions_refresh` action (`AISuggestion` generation for a draft
`Mapping`). It does not cover autopilot's other action types, AskData
suggestions, migration SQL generation, or NL2SQL. It also does not attempt to
run suggestions speculatively against every possible target for a bare new
connector — a mapping's source and target must already both be known before
anything runs (see "Approaches Considered" for why).

## Approaches Considered

1. **Inline trigger in `create_mapping`** — call `request_suggestions()`
   directly at the end of `create_mapping`. Simplest diff, but bypasses the
   Autopilot policy system entirely: no admin on/off switch, no rate limit,
   no audit trail beyond what `request_suggestions` already does, and it
   would require inventing a new bespoke settings flag to make it
   configurable. Rejected — this codebase already has a governance layer for
   exactly this kind of automated action; duplicating it is unnecessary.

2. **New Autopilot trigger evaluator (chosen)** — add a fourth evaluator to
   `AutopilotEngine`, alongside `_evaluate_connector_health`,
   `_evaluate_schema_drift`, and `_evaluate_pipeline_failures`, that detects
   newly created draft mappings with no suggestions yet and reuses the
   existing `mapping_suggestions_refresh` action type (already
   `auto_capable=True` in `autopilot_registry.py`). This inherits, for free:
   per-action-type autonomy (`disabled|suggest|approve|auto`), rate limiting
   (`max_auto_per_hour`), dedupe/supersede, and the existing recommendations
   review UI. Chosen because it is consistent with every other automated AI
   trigger already in this codebase (health-check failure, schema drift,
   pipeline failure escalation all work this way).

3. **New generic event bus** (`mapping_created` pub/sub) — rejected as
   speculative infrastructure; nothing else in the codebase needs a generic
   event bus, and Approach 2 achieves the same outcome without it.

4. **Dedicated action type** (e.g. `mapping_suggestions_initial`, separate
   from drift-triggered `mapping_suggestions_refresh`) — considered so an
   admin could tune "on create" vs "on drift" autonomy independently.
   Rejected in favor of sharing the existing action type: simpler, no new
   registry entry, and the two triggers are conceptually the same action
   (generate/refresh suggestions for a draft mapping) with different causes.

## Design

### Trigger flow

1. `MappingService.create_mapping()` (`mapping_service.py:39`), after
   committing the new draft `Mapping`, adds a guarded, non-blocking dispatch:

   ```python
   try:
       from app.tasks.autopilot_tasks import evaluate_recommendations_task
       evaluate_recommendations_task.delay()
   except Exception as exc:
       logger.warning(
           "autopilot evaluate dispatch after mapping creation failed: %s", exc,
       )
   ```

   This mirrors the existing pattern in `connector_tasks.py:83-93`
   (`run_health_check_for_connection`, dispatched after a failed health
   check) — deferred import to avoid circular imports, try/except so a
   dispatch failure never affects the caller, log-and-continue.

2. `evaluate_recommendations_task` runs `AutopilotEngine.evaluate_all()`,
   which now also calls a new evaluator:

   `_evaluate_new_draft_mappings(db) -> List[Dict[str, Any]]`

   Query shape:
   ```python
   db.query(Mapping).filter(
       Mapping.status == "draft",
       Mapping.deleted_at.is_(None),
       Mapping.pending_suggestion_task_id.is_(None),
   )
   ```
   `pending_suggestion_task_id IS NULL` means suggestions have never been
   requested for this mapping — manually or automatically — which is exactly
   the "brand new, unwarmed" signal, with no need for a separate timestamp or
   lookback window.

   For each qualifying mapping, produce a draft recommendation:
   ```python
   {
       "action_type": "mapping_suggestions_refresh",
       "subject": f"mapping:{m.id}",
       "payload": {"mapping_id": m.id},
       "confidence": 85.0,
       "rationale": {
           "summary": (
               f"Mapping '{m.name}' was just created with no AI suggestions "
               "yet — generate an initial pass so the mapper opens "
               "pre-populated."
           ),
           "evidence": [f"mapping_id={m.id}", f"created_at={m.created_at}"],
           "trigger": {"kind": "mapping_created", "mapping_id": m.id},
       },
   }
   ```
   Same `action_type` and `subject` format as the existing schema-drift
   evaluator, so `AutopilotService.upsert_recommendation`'s existing
   dedupe-by-(action_type, subject) logic collapses this with any concurrent
   drift-triggered recommendation for the same mapping — no duplicate
   recommendations.

3. No changes needed to `_supersede_cleared` — its existing
   `mapping_suggestions_refresh` branch (mapping deleted, or no longer
   `draft`) already covers recommendations from this new trigger, since it's
   the same action type.

4. No changes needed to `autopilot_registry.py` — `mapping_suggestions_refresh`
   is already registered with `auto_capable=True`, `reversible=True`,
   `risk="low"`, and its executor (`_exec_mapping_suggestions_refresh`)
   already calls `MappingService.request_suggestions`.

5. Whether the recommendation executes immediately, waits for approval, or
   does nothing depends entirely on the existing `AutopilotPolicy` row for
   `mapping_suggestions_refresh` (`autonomy: disabled|suggest|approve|auto`).
   No new Settings/env var is introduced.

### Data model

No schema changes. Reuses `Mapping.pending_suggestion_task_id` (existing
column), `AutopilotRecommendation`, `AutopilotPolicy`, `AISuggestion` as they
exist today.

### Error handling

- Dispatch failure (e.g. Celery broker unavailable) is caught and logged via
  `logger.warning`; mapping creation always succeeds regardless of
  Autopilot's availability.
- Evaluator failures follow the existing fail-safe pattern in `evaluate_all`
  — a single draft that fails registry validation
  (`UnknownActionError`/`ProhibitedActionError`/`PayloadValidationError`) is
  skipped and logged; it does not abort the sweep.
- If `suggest_mappings_task` itself fails once dispatched (e.g. source or
  target connector unreachable), it fails exactly as it does today for a
  manually-requested run — surfaced via the recommendation's execution
  failure state, not a hidden/uncaught Celery failure.

### Testing

- Unit: `create_mapping` dispatches `evaluate_recommendations_task.delay()`
  exactly once; creation still returns successfully if the dispatch mock
  raises.
- Unit: `_evaluate_new_draft_mappings` returns a draft for a mapping with
  `pending_suggestion_task_id IS NULL`, and returns nothing once that field
  is set (covers both "already auto-triggered" and "already manually
  requested" cases, since both set the same field).
- Integration: with `AutopilotPolicy(action_type="mapping_suggestions_refresh",
  autonomy="auto")`, creating a mapping via `POST /mappings/` and running
  `evaluate_all` results in `AISuggestion` rows appearing with no explicit
  call to `POST /{id}/suggestions`.
- Regression: a mapping affected by both a recent schema-drift event and the
  new "just created" trigger in the same sweep produces exactly one open
  `mapping_suggestions_refresh` recommendation, not two.

## Operator Note

This is a behavior change gated by an *existing* policy lever, not a new
one. If the `mapping_suggestions_refresh` policy is absent (fail-safe
default: `suggest`) or explicitly set to `suggest`/`approve`, newly created
mappings will now also generate a recommendation in the review queue — but
suggestions will not actually run until a human approves it, so the latency
win described in the Goal does not land automatically. The intended
zero-latency behavior requires an operator to explicitly set
`mapping_suggestions_refresh` autonomy to `auto`. Flag this to whoever owns
Autopilot policy configuration before/at rollout, since it changes the
behavior of an existing shared policy lever, not just adds a new isolated
feature.

## Out of Scope / Non-Goals

- Speculative suggestion generation against every possible target for a
  bare new connector (no mapping exists yet) — rejected in brainstorming;
  see the "Warm the specific pending mapping" scoping decision.
- A dedicated action type separate from drift-triggered refresh — rejected;
  see Approach 4 above.
- Any frontend changes. The existing recommendations review queue and
  suggestions list UI are sufficient consumers; no new UI is required by
  this design.
