# Tenant Isolation Epic — Post-Implementation Validation

Filed after code review of commit `0093374` ("ten ant addition") — the first vertical slice of tenant isolation (connections-only, per-user `owner_email` ownership).

## Status legend

- `[ ]` Not started · `[~]` In progress · `[x]` Fixed & verified · `[?]` Needs more info to fully resolve

## Findings

| # | Status | Area | Summary |
|---|---|---|---|
| T01 | `[~]` | Router bypass (query, askdata, mapper, schema_catalog, schema_comparison, autopilot, query_studio) | 7 routers query `DBConnection` directly via `db.query(DBConnection).filter(...)` instead of going through `ConnectionService.get_connection()` with `owner_email` scope — any authenticated user can reference any `connection_id` from these routers regardless of ownership. This is the **explicit residual risk** documented in MEMORY.md ("Wave C of the full spec, future follow-up"). Query Studio's bypass is **fixed** (T01a — most security-sensitive, lets users execute arbitrary SQL). The remaining 6 (query, askdata, mapper, schema_catalog, schema_comparison, autopilot) are documented as Wave C future follow-up. |
| T01a | `[x]` | Query Studio bypass fixed | `query_studio.py`'s `_get_connection` now delegates to `ConnectionService.get_connection()` with `owner_email` scope. All 3 callers (execute, export, create_saved_query) pass the owner scope. Verified: 16/16 query_studio tests pass. |
| T02 | `[x]` | Test fixture gap | `conftest.py`'s `sqlite_conn` fixture created a `DBConnection` row with `owner_email=None`. Works for admin tests (admin bypass = `None`), but any non-admin test accessing this fixture would get a 404 since `owner_email=None` won't match the caller's email. **Fixed:** both `tests/connectors/conftest.py` and `tests/query_studio/conftest.py` fixtures now set `owner_email` to the appropriate user's email. Verified: 81/81 connector tests + 16/16 query_studio tests pass. |
| T03 | `[x]` | Health check task bypass | `connector_tasks.py`'s `run_health_check_for_connection` queries `DBConnection` directly without owner scope. Acceptable for system-level background tasks. |
| T04 | `[x]` | Schema intel / AI tasks bypass | `schema_intel_tasks.py` and `ai_tasks.py` query `DBConnection` directly without owner scope. Same reasoning as T03 — system tasks. |
| T05 | `[x]` | `list_deleted` admin-only but unscoped | `GET /deleted` calls `ConnectionService.list_deleted(db)` without owner scope. Admin-only endpoint (`require_role("admin")`), so admin bypass applies. |
| T06 | `[x]` | `update_health` no owner filter | `ConnectionService.update_health()` queries by ID directly without owner scope. Callers either already fetched with scope (test endpoint) or are system tasks (health check). |
| T07 | `[x]` | `get_dependents` no owner filter | `ConnectionService.get_dependents()` queries mappings/pipelines by connection_id without owner scope. Called after the connection was already fetched with scope in the delete flow. |

## Detail

### T01 — 7 routers bypass `ConnectionService.get_connection()` and query `DBConnection` directly

These routers accept a `connection_id` from the user and query the database directly without any owner-scoping:

| Router | File | Line(s) | Status |
|---|---|---|---|
| Query (legacy NL2SQL) | `backend/app/api/routers/query.py` | 55, 115 | `[ ]` Wave C |
| AskData Bot | `backend/app/api/routers/askdata.py` | 56, 173, 203 | `[ ]` Wave C |
| Schema Mapper | `backend/app/api/routers/mapper.py` | 38-39, 79-80 | `[ ]` Wave C |
| Schema Catalog | `backend/app/api/routers/schema_catalog.py` | 98 | `[ ]` Wave C |
| Schema Comparison | `backend/app/api/routers/schema_comparison.py` | 26-27 | `[ ]` Wave C |
| Autopilot | `backend/app/api/routers/autopilot.py` | 53-54 | `[ ]` Wave C |
| Query Studio | `backend/app/api/routers/query_studio.py` | 32 | `[x]` **Fixed** |

**Impact:** A user who knows/guesses another user's connection ID can use it from these routers — the connection is resolved without checking `owner_email`. This is the exact residual risk documented in MEMORY.md's 2026-07-29 entry.

**Fix for Query Studio (T01a):** Replaced direct `db.query(DBConnection)` call with `ConnectionService.get_connection(db, id, owner_email=owner_email)`. Query Studio is the most critical because it supports write/DDL execution. The `_get_connection` helper now accepts an optional `owner_email` parameter; all 3 callers (execute, export, create_saved_query) compute `owner_email = None if user.role == "admin" else user.email` and pass it through.

**Remaining (T01, Wave C):** The other 6 routers are documented as Wave C of the full tenant isolation spec — scope includes adding tenant predicates across every route. Each would need `ConnectionService.get_connection()` or an equivalent scope check.

### T02 — `sqlite_conn` fixture missing `owner_email` — **FIXED**

Both `tests/connectors/conftest.py` and `tests/query_studio/conftest.py` had `sqlite_conn` fixtures that created connections with `owner_email=None`. All existing tests that used these fixtures did so through `client_admin` (admin role), where `_owner_scope` returns `None` (admin bypass), so they passed. But any future non-admin test using this fixture would 404.

**Fix applied:**
- `tests/connectors/conftest.py`: fixture now accepts `admin` and sets `owner_email=admin.email`
- `tests/query_studio/conftest.py`: fixture now accepts `analyst` and sets `owner_email=analyst.email` (since most query_studio tests use `client_analyst`)

### T03–T07 — System-level operations

These are all system-level or admin-only operations where owner scoping is either:
- Not applicable (system background tasks need to see all connections)
- Already guarded by admin role
- Called after the connection was already fetched with scope

Documented for completeness but no code change needed.

## Files changed

| File | Change |
|---|---|
| `backend/app/api/routers/query_studio.py` | `_get_connection` now delegates to `ConnectionService.get_connection()` with `owner_email` scope. Added `ConnectionService` import. |
| `backend/tests/connectors/conftest.py` | `sqlite_conn` fixture now accepts `admin` and sets `owner_email=admin.email` |
| `backend/tests/query_studio/conftest.py` | `sqlite_conn` fixture now accepts `analyst` and sets `owner_email=analyst.email` |
| `backend/tests/query_studio/test_execution.py` | Updated `test_viewer_role_forbidden` comment to clarify 403 comes from role check, not ownership |
| `requirement-specs-v2/tenant_isolation_bugs.md` | This file — validation report |

## Verification

- `tests/connectors/` — 81/81 passed
- `tests/query_studio/` — 16/16 passed
- `tests/secrets/` — 44/44 passed

## Progress log

- 2026-07-29 — Filed after code review of commit `0093374`. T01 documented as the known residual risk from MEMORY.md with T01a (Query Studio) fixed. T02 fixed (both connector and query_studio fixtures now set `owner_email`). T03–T07 documented as acceptable for system-level operations. All affected test suites pass.