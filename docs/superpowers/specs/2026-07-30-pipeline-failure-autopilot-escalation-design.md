# Pipeline Failure → Autopilot Escalation — Design

> **Scope (confirmed):** This is sub-project 1 of a 4-part roadmap to extend the existing Autopilot evaluate → recommend → guardrailed-execute loop to Pipelines, Data Quality, Governance, and Risk & Compliance. Only Pipelines is designed here; DQ/Governance/Risk are noted as roadmap items below and will each get their own brainstorm/spec cycle.

> **Correction made during design:** Pipeline auto-retry-on-transient-failure already exists (`app/workers/pipeline_tasks.py::run_pipeline_task` — reads `RetryPolicy`, classifies errors retryable/terminal, retries via Celery `self.retry` with backoff+jitter). The gap this spec closes is narrower: retries exhausting (or a terminal, never-retried failure) currently only fires a passive `pipeline:run_failure` notification — it never becomes a governed, human-visible Autopilot recommendation with proposed remediation.

## 1. Goal

When a pipeline's most recent run ends in a genuinely terminal failure, open governed Autopilot recommendations that propose concrete remediation (re-test the source connection, notify an admin, optionally pause the schedule) instead of a fire-and-forget notification the user has to happen to see.

## 2. Non-Goals

- No changes to `run_pipeline_task`'s existing retry/backoff/classification logic — it is correct and untouched.
- No new persisted "retries_exhausted" column — the trigger is derived from existing state (see §4).
- No changes to the Data Quality, Governance, or Risk & Compliance subsystems (roadmap only — see §8).
- No changes to the Autopilot approval UI/endpoints, rate-limit config, or circuit breaker — all inherited as-is.

## 3. Architecture

One new evaluator function, `_evaluate_pipeline_failures`, added to `AutopilotEngine.evaluate_all()` (`backend/app/services/autopilot_engine.py:220`), run on the existing Celery-beat cadence (`AUTOPILOT_EVALUATE_INTERVAL_MINUTES`, currently 2 min) alongside `_evaluate_connector_health` and `_evaluate_schema_drift`. One new action type, `pipeline_schedule_disable`, added to `ACTION_REGISTRY` (`backend/app/services/autopilot_registry.py`). Two existing action types reused unmodified: `connector_health_check`, `notify_slack_internal`.

No new engine, no new approval surface — this is an additive evaluator + one additive registry entry inside the platform's single existing Autopilot loop.

## 4. Trigger condition

**Signal:** a pipeline's most recent `PipelineRun` has `status == "failed"`.

`"retries_exhausted"` is a value Celery's task returns, not a persisted column — it isn't queryable from the DB. `"retrying"` is a distinct, separate status used only during backoff windows. So a run resting at `"failed"` is, by construction, terminal: either retries were exhausted, or the error was classified `terminal` and never retried at all (e.g. `authentication failed`). Both cases genuinely warrant escalation, so this single condition covers the intended trigger without a schema change.

**Evaluator query shape** mirrors the existing schema-drift evaluator's "latest row per group" pattern (`autopilot_engine.py:113`, `func.max(id)` grouped by connection): here, latest `PipelineRun.id` grouped by `pipeline_id`, joined back to get that row's `status`/`error_message`/`retry_count`.

## 5. Recommendations drafted per failing pipeline

For each pipeline whose latest run is `"failed"`, draft up to three recommendations. All are deduped/refreshed-in-place by the existing `AutopilotService.upsert_recommendation` — no new dedupe logic needed.

| Action type | Subject | Auto-capable? | Payload | Notes |
|---|---|---|---|---|
| `connector_health_check` (existing) | `connection:{source_connection_id}` | Yes (existing) | `{connection_id}` | **Same subject convention** as the existing connector-health evaluator — refreshes the same recommendation row rather than creating a competing one for the same connection. |
| `notify_slack_internal` (existing) | `pipeline:{id}:notify` | Yes (existing) | `{title: "Pipeline '<name>' has failed", body: <last error_message, truncated>, link: <pipeline detail URL>}` | Routes through the existing Autopilot audit/rate-limit path (not the separate `dispatch_notify_out` fire-and-forget helper), so a flapping pipeline can't spam Slack beyond the existing per-type hourly cap. |
| `pipeline_schedule_disable` (new) | `pipeline:{id}` | No (approval-only) | `{pipeline_id}` | Only drafted if the pipeline has a `Schedule` row — a manually-triggered pipeline has nothing to disable. |

Confidence scores follow the existing evaluators' scale: 85 for the connection re-test (mechanical, near-certain relevance), 90 for the notify (always relevant, harmless), 60 for the schedule-disable proposal (a judgment call the human should weigh, hence approval-only).

## 6. New registry entry

```python
ActionSpec(
    action_type="pipeline_schedule_disable",
    description="Pause a repeatedly-failing pipeline's schedule until a human investigates",
    risk="medium",
    reversible=True,
    reversibility_note="Re-enabling the schedule is a single toggle; kept approval-only "
                        "because pausing future runs affects real business behavior even "
                        "though the action itself is trivially reversible.",
    auto_capable=False,
    required_payload_keys=frozenset({"pipeline_id"}),
    execute=_exec_pipeline_schedule_disable,
)
```

`_exec_pipeline_schedule_disable` calls `PipelineCRUD.toggle_schedule(db, pipeline_id, enabled=False, actor=actor)` (`pipeline_service.py:922`) — the existing, only mutation path for schedules; no new one is invented. It raises a clean `ValueError` if the pipeline has no schedule, matching every other executor's "fail clean, don't crash" convention (e.g. `_exec_connector_health_check`'s not-found handling).

Since `auto_capable=False`, the import-time invariant (`auto_capable` requires `reversible` AND `risk == low`) doesn't apply to this entry — it's exempt by construction, same as `migration_execute` and `schema_design_create`.

## 7. Supersede

Extends the existing `_supersede_cleared` (`autopilot_engine.py:182`) with one new rule: if a pipeline's *latest* run is now `"succeeded"`, supersede any open `notify_slack_internal`/`pipeline_schedule_disable` recommendation for that pipeline (reason: `"pipeline succeeded on a later run"`). The `connector_health_check` supersede rule (connection healthy again) already covers that action type for free, since it's keyed by connection, not by pipeline.

## 8. Guardrails inherited for free

- **Rate limits & circuit breaker:** `AUTOPILOT_TYPE_AUTO_LIMIT_PER_HOUR`, `AUTOPILOT_GLOBAL_AUTO_LIMIT_PER_HOUR`, and the existing breaker (`AUTOPILOT_BREAKER_THRESHOLD` / `_WINDOW_MINUTES`) already bound `maybe_auto_execute` generically per action type — a flapping pipeline cannot spam Slack or hammer a dead connection beyond what any other auto-capable action is already limited to. No new config.
- **Audit trail:** every dispatch (auto or human-approved) already flows through `execute_recommendation` / `emit_audit_event` — no new audit code needed.
- **Fail-safe sweep:** the new evaluator's drafts flow through the existing per-draft try/except in `evaluate_all`'s aggregation loop (`autopilot_engine.py:232`, `bugs/02`) — one bad draft (e.g. a stale pipeline_id) can't take down the whole sweep.

## 9. Testing

- **Evaluator:** latest-run-per-pipeline SQL correctness; dedupe on repeated consecutive failures (refresh, not duplicate); supersede fires when a later run succeeds; `pipeline_schedule_disable` draft is skipped when the pipeline has no schedule.
- **Registry:** new spec passes the existing import-time invariant asserts automatically (no new test needed there, but a regression test confirming the entry exists and is `auto_capable=False` is worthwhile).
- **Executor:** `_exec_pipeline_schedule_disable` actually calls `toggle_schedule(enabled=False)`; raises a clean `ValueError` with no schedule.
- **End-to-end:** trigger a failing run → confirm 2-3 recommendations appear in the Autopilot queue → confirm the two auto-capable ones execute within rate limits → approve the schedule-disable one → confirm the schedule is actually disabled → confirm the audit trail reflects the full sequence.

## 10. Roadmap (not designed here)

Each gets its own brainstorm/spec cycle, in this order (each makes the next cheaper, per the current-state gap analysis in `requirements-specs/enterprise_v2/00_current_state_and_gaps.md`):

1. ~~Pipelines~~ — this spec.
2. **Data Quality** — new evaluator watching for scorecard degradation / stale profiles; reuses the existing `dq_rule_proposer.py` (currently only invoked from Agentic DBA) to propose DQ rules on a schedule.
3. **Governance** — new evaluator flagging newly-discovered PII with no assigned steward, or stale classifications; proposes steward assignment / classification refresh. Retention *enforcement* stays explicitly out of scope, blocked on tenant isolation per the gap doc.
4. **Risk & Compliance** — expected to end up mostly a thin aggregator: a new critical/high risk with no open recommendation opens one pointing at whichever of #1-3's action types already fits (e.g. an unmapped-PII risk → the Governance classification-fix action; an infra risk → `connector_health_check`), rather than inventing much of its own.
