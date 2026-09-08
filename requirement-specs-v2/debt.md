No code or files changed. Proposed technical-debt plan:

## Phase 1 — Baseline and inventory

1. Capture clean baselines for backend tests, frontend tests, lint, TypeScript, production builds, Docker health, and dependency audits.
2. Catalogue open `[!]` and `[?]` items from all requirement indexes.
3. Identify dead routes, unused components, duplicated services, stale feature flags, and legacy compatibility paths.
4. Establish measurable targets: test coverage, build time, bundle size, API latency, lint count, and dependency vulnerabilities.

Deliverable: prioritized debt register with owner, risk, effort, affected modules, and acceptance criteria.

## Phase 2 — Database lifecycle

1. Introduce a real migration framework instead of relying on `Base.metadata.create_all`.
2. Baseline the existing production schema before generating new migrations.
3. Replace manual `ALTER TABLE` procedures documented across the epics.
4. Resolve multi-worker schema-creation races.
5. Add migration upgrade, rollback, and empty-database tests.

Priority: P0 because the current approach cannot safely evolve populated installations.

## Phase 3 — Security and tenant isolation

1. Define the tenant/workspace ownership model.
2. Add tenant scoping to mappings, connectors, pipelines, governance, audit, semantic metrics, saved queries, and agent sessions.
3. Complete human review of previously blocked tenant-isolation tasks.
4. Review Query Workspace write/DDL execution and connector-secret handling.
5. Remove insecure production defaults and enforce boot-time configuration validation.
6. Add cross-tenant denial and privilege-escalation tests.

Priority: P0, but implementation requires explicit architecture and security sign-off.

## Phase 4 — Secrets and connector configuration

1. Complete connector secret vaulting and credential rotation architecture.
2. Eliminate JSON configuration editors where typed connector forms are practical.
3. Ensure secrets never enter list, audit, error, or frontend payloads.
4. Add key rotation/re-encryption support for encrypted stored secrets.
5. Test every connector driver for redaction and failure handling.

## Phase 5 — Backend architecture

1. Audit routers for business logic and move remaining logic into services.
2. Standardize pagination, filtering, sorting, error responses, and audit metadata.
3. Consolidate retry, timeout, circuit-breaker, and transaction patterns.
4. Remove duplicated schema-introspection and query-execution paths.
5. Replace in-process caches or buffers where multi-worker correctness matters.
6. Add explicit service interfaces around external databases, Ollama, Celery, and secret managers.

## Phase 6 — Background jobs and pipelines

1. Audit Celery tasks for idempotency, transaction boundaries, retry safety, and duplicate dispatch.
2. Standardize pipeline stage logging and audit records.
3. Introduce job deduplication and concurrency controls where absent.
4. Test worker crashes, retries, partial writes, and beat scheduling.
5. Document operational recovery procedures.

## Phase 7 — Frontend consolidation

1. Finish tasks 10–12 in the current UI/UX backlog.
2. Consolidate remaining modal, form, table, toolbar, notification, and state components.
3. Remove legacy AskData and Query Studio implementations after validating redirects and handoffs.
4. Eliminate remaining undefined or obsolete design utilities.
5. Replace duplicated domain types with generated or centrally defined API contracts.
6. Standardize URL-backed filters, selection state, retry behavior, and responsive layouts.

## Phase 8 — Accessibility

1. Perform keyboard-only navigation across every dashboard route.
2. Audit focus order, focus restoration, dialogs, drawers, menus, data grids, and graph controls.
3. Validate screen-reader labels and live regions.
4. Test contrast in light and dark modes.
5. Test reduced motion and browser zoom up to 200%.
6. Add automated accessibility checks to frontend CI.

## Phase 9 — Testing strategy

1. Measure backend and frontend coverage by module.
2. Add missing frontend tests for modules that currently have only backend coverage.
3. Introduce contract tests between `api.ts` response types and FastAPI schemas.
4. Add Docker-based integration tests for Postgres, Celery, and supported connectors.
5. Add golden-path browser tests for Connectors → Schema Intel → Mapper → Pipeline → Query Workspace.
6. Separate fast pull-request tests from slower integration and end-to-end suites.

## Phase 10 — Build and dependency hygiene

1. Fix Next.js workspace-root ambiguity caused by multiple lockfiles.
2. Remove production-build dependence on downloading Google fonts.
3. Review and update backend and frontend dependencies in controlled batches.
4. Remove unused packages, compatibility code, and stale configuration.
5. Add reproducible dependency caching and lockfile validation.
6. Generate SBOM and vulnerability reports in CI.

## Phase 11 — Performance

1. Establish latency and payload baselines for dashboard, catalog, topology, risk, governance, and audit APIs.
2. Audit N+1 queries and unbounded list endpoints.
3. Review frontend bundle splitting and heavy graph/editor dependencies.
4. Profile large catalogs, mappings, audit histories, and topology graphs.
5. Add database indexes based on measured queries.
6. Add performance regression thresholds to CI.

## Phase 12 — Observability and operations

1. Standardize structured logs with request, user, tenant, task, and correlation identifiers.
2. Add metrics for API latency, Celery queues, connector health, query execution, and AI calls.
3. Add readiness versus liveness checks.
4. Document backup, restore, migration, secret rotation, and incident procedures.
5. Define retention policies for audit, query history, chat sessions, and operational logs.

## Recommended execution order

1. Baseline and inventory.
2. Database migrations.
3. Tenant isolation and security design.
4. Secrets management.
5. Backend transaction/job reliability.
6. Testing and contract coverage.
7. Frontend consolidation and accessibility.
8. Build/dependency hygiene.
9. Performance and observability.
10. Dead-code removal after behavior is protected by tests.

The first implementation epic should be database migration lifecycle work; it removes the largest structural risk and enables safer changes in every later phase.