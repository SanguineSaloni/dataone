# Task 07 — Application-Wide Tenant Isolation Foundation

## Status and authorization

`[~]` Implementation and review launched by explicit user authorization on 2026-07-15.

This authorization removes the product-decision block for tenant isolation. It does not waive the required adversarial security review, and it does not authorize enabling publisher SSO, subscriber SSO, or Marketplace production credentials before their own release gates pass.

## Grounded current-state inventory

The backend currently has no `Tenant`, `TenantMembership`, or request tenant-context model. `User.email` is globally unique, JWT identity uses email, and nearly every resource table is globally addressable by integer ID. Only `pipelines.tenant_id` exists, as a nullable string with a comment deferring enforcement. Frontend tenant-management components call `/api/v1/tenants` endpoints that do not exist in the backend and are not linked from dashboard navigation.

### Tenant-owned aggregate roots

These tables require a non-null internal tenant ID and tenant-aware uniqueness:

| Domain | Aggregate roots / direct tenant records |
|---|---|
| Identity | tenant memberships, external identities, tenant invitations |
| Connections | `connections`; secrets/catalog/snapshots/drift inherit through connection |
| Mapping | `mappings`; versions, field mappings, suggestions inherit through mapping |
| Pipelines | `pipelines`; schedules, retry policies, runs, steps inherit through pipeline |
| Query/AI | `query_history`, `saved_queries`, chat sessions/messages, `schema_design_plans` |
| Governance | autopilot runs/policies/recommendations/action logs, notification settings |
| Semantic | semantic entities and metric definitions; dimensions/measures/lineage inherit |
| Visualization | `viz_views` |
| Security | tenant role assignments, masking policies, row-access policies |
| Audit | `audit_log` requires direct `tenant_id` for fail-closed filtering and hash-chain partitioning |
| Marketplace | subscriptions and operation inbox/outbox records |

Static permission definitions and the connector-type catalog remain global. Users are global identities, but have no tenant access without an active membership. Publisher memberships remain a separate authorization namespace.

## Foundational decisions

1. **Tenant identifier:** opaque UUID string. This matches the already-shipped string `pipelines.tenant_id` and avoids a destructive type conversion.
2. **Tenant source:** the authenticated backend session selects a membership; request headers or query parameters never establish authorization context.
3. **Explicit context:** `TenantContext(tenant_id, user_id, membership_id, role, identity_lane)` is injected into every tenant endpoint and passed into services/tasks. Services do not reach into ambient globals.
4. **Fail closed:** missing tenant context rejects customer-resource access. There is no “all tenants” fallback for admins. Cross-tenant publisher support requires the separate elevation design from Task #6.
5. **Aggregate invariants:** child ownership derives from its parent FK, while aggregate roots and audit/task/event records store `tenant_id` directly. Services verify that every referenced aggregate belongs to the same tenant.
6. **Uniqueness:** names that are currently globally unique become tenant-composite unique, including active connection names, semantic entity names/versions, policy targets, and autopilot policy/dedupe keys.
7. **Legacy data:** all existing rows are assigned to one explicit `legacy-veltris` tenant during migration; no null tenant is interpreted as legacy at runtime.
8. **Migration tooling:** introduce versioned database migrations before adding tenant constraints. `Base.metadata.create_all` cannot alter populated tables and is insufficient for this rollout.

## Implementation waves

### Wave A — Migration and identity foundation

- Add a versioned migration runner appropriate for SQLAlchemy/PostgreSQL and SQLite test coverage.
- Create `tenants`, `tenant_memberships`, and `external_identities`.
- Extend users so password-backed legacy identities can coexist with immutable external identities without using email for authorization.
- Seed the `legacy-veltris` tenant and membership for every active existing user.
- Add `TenantContext`, `get_current_tenant`, `require_tenant_role`, and explicit publisher-context separation.
- Extend `/auth/me` to return available memberships and active tenant without trusting a browser-provided tenant ID.

**Exit review:** migrations upgrade/downgrade on empty and populated fixtures; missing/inactive membership rejects access; identity-lane confusion tests pass.

### Wave B — Core resource ownership

- Add and backfill `tenant_id` on connections, mappings, pipelines, query history, saved queries, chat/session roots, schema-design plans, semantic roots, visualization roots, governance roots, notification settings, and audit events.
- Backfill child aggregates through their owning parent and reject cross-tenant FK combinations in services and database constraints where possible.
- Replace global unique constraints/indexes with tenant-composite equivalents.
- Make tenant columns non-null only after reconciliation reports zero orphan/null/conflicting rows.

**Exit review:** migration reconciliation report is clean; direct-ID enumeration from another tenant returns 404 or policy-approved 403 consistently; duplicate names work across tenants but not within one tenant.

### Wave C — API and service enforcement

- Require tenant context on every customer-resource router.
- Add tenant predicates in service queries, including get/update/delete by ID—not only list endpoints.
- Validate all multi-resource commands (mapping source/target, pipeline connections/mapping, schema plans, visualization policies) are same-tenant.
- Namespace RBAC assignments by tenant while retaining the static permission catalog globally.
- Remove or gate legacy routes that cannot prove tenant ownership.

**Exit review:** route matrix has happy-path and cross-tenant negative tests for every verb; service-level tests prove tenant predicates remain when routers are bypassed.

### Wave D — Asynchronous and derived surfaces

- Include tenant ID in Celery task signatures and re-resolve ownership inside workers.
- Scope periodic scans by tenant and prevent a worker from accepting resource IDs from another tenant.
- Partition dashboard cache, RBAC cache, circuit-breaker/rate-limit accounting, notification dedupe, and Autopilot dedupe by tenant.
- Scope audit ingestion, hash chains, exports, retention jobs, query handoffs, and generated downloads.
- Scope ACI notifications and secret-manager record naming/lookup by tenant without exposing secrets.

**Exit review:** task forgery, cache-poisoning, audit-export, notification, and secret-resolution cross-tenant tests pass.

### Wave E — Frontend tenant session

- Add the authenticated tenant/membership contract to `frontend/src/lib/auth.ts`.
- Add a tenant switcher only for memberships returned by the backend; switching calls a backend session endpoint and refreshes all cached data.
- Build the existing tenant-management UI against real admin-gated APIs or remove it from the build until wired; no placeholder tenant surface ships.
- Clear tenant-derived client state and outstanding requests on tenant switch/logout.

**Exit review:** switching cannot select an unassigned tenant; stale responses from the previous tenant cannot populate the new tenant UI.

### Wave F — Adversarial review and cutover

- Run full backend/frontend suites plus the tenant security matrix below.
- Perform a second independent code-review pass focused on missing predicates and confused-deputy paths.
- Run populated-database migration rehearsal, rollback rehearsal, backup/restore, and reconciliation.
- Deploy behind `TENANT_ENFORCEMENT_MODE=audit`, then `enforce`; production must fail boot if enforcement is disabled after cutover.
- Do not enable SSO/Marketplace until the review report has no unresolved critical/high isolation findings.

## Required security matrix

For two tenants A/B with overlapping resource names and users with different roles, test:

- list, get, create, update, delete, restore, publish, approve, execute, export, and download;
- guessed sequential IDs and IDs embedded in JSON payloads;
- connection secret read/rotation and failed-vault behavior;
- mapping/pipeline/schema/semantic references spanning A and B;
- query execution and saved/history/chat session access;
- Celery task arguments, retries, periodic jobs, and result retrieval;
- dashboard/RBAC caches and rate-limit/circuit-breaker keys;
- audit list/detail/export/hash-chain visibility;
- Autopilot approvals, Agentic DBA plans, and external notification destinations;
- inactive/suspended tenant, removed membership, role downgrade, tenant switch, logout, and concurrent requests during switch;
- publisher identity attempting subscriber access without approved elevation and subscriber identity attempting publisher routes.

## Review artifacts

- `tenant_model_and_migration_review.md`: schema, indexes, backfill counts, orphan/conflict report, rollback evidence.
- `tenant_route_coverage.md`: every router and operation mapped to its tenant enforcement point and test.
- `tenant_async_cache_review.md`: tasks, caches, audit, integrations, secrets, and derived surfaces.
- `tenant_security_review.md`: threat cases, findings by severity, fixes, residual risks, and human approval.

## Definition of done

- Every tenant-owned aggregate has exactly one non-null tenant owner.
- Every request, service operation, worker task, cache entry, audit event, and export is tenant-scoped.
- No authorization decision uses email/domain as tenant identity.
- Cross-tenant negative tests cover every API domain and asynchronous path.
- Populated-database upgrade and rollback rehearsals are recorded.
- Full regression suites pass.
- Independent security review has no unresolved critical/high findings.
- Task #7 remains `[~]` until all conditions above are met; user authorization starts the work but does not auto-approve its result.
