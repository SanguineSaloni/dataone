# DataOne Integrations Tab — Use Cases and Technical Understanding

## Purpose

The Integrations tab is DataOne's governed control surface for connecting external applications through ACI.dev. It is not intended to replace ACI's app marketplace or OAuth portal. ACI owns application configuration and external credentials; DataOne owns authorization, approval policy, execution governance, operational status, and audit history.

The tab currently answers three questions:

1. Is ACI configured and reachable from DataOne?
2. Which external accounts are linked and enabled?
3. Which DataOne events and governed actions may interact with those accounts?

## Actors

| Actor | Responsibility |
|---|---|
| DataOne administrator | Configures ACI, reviews linked accounts, enables notification events, and approves external actions. |
| DataOne analyst | May request an external action through an approved product workflow but cannot change integration policy. |
| DataOne viewer | Read-only or no access, depending on the final tenant/RBAC policy. |
| ACI.dev | Stores external OAuth/API credentials, publishes app/function definitions, and executes calls against external systems. |
| External application | Slack, GitHub, Gmail, ticketing systems, or another ACI-supported app receiving the final action. |

## Current DataOne implementation

### Frontend

`frontend/src/app/dashboard/integrations/page.tsx` displays:

- ACI configured/unconfigured state.
- A link to the configured ACI portal for connecting an app.
- Linked accounts with app name, owner ID, and enabled state.
- DataOne's governed external-action registry with risk and approval posture.
- Per-event notify-out settings.

### DataOne API

`backend/app/api/routers/integrations.py` exposes:

| Endpoint | Purpose | Access |
|---|---|---|
| `GET /api/v1/integrations/status` | Configuration status, portal URL, and governed action types. | Authenticated user |
| `GET /api/v1/integrations/linked-accounts` | Lists ACI linked accounts and degrades gracefully when ACI is unavailable. | Authenticated user |
| `GET /api/v1/integrations/notification-settings` | Lists notify-out event settings. | Admin |
| `PUT /api/v1/integrations/notification-settings/{event_key}` | Enables or disables an event and writes an audit event. | Admin |

### ACI client boundary

All backend ACI calls pass through `backend/app/services/aci_client_service.py`. The wrapper currently supports:

- `search_tools(query, limit)` → `client.functions.search(...)`
- `execute_tool(tool_name, params, owner)` → `client.functions.execute(...)`
- `list_linked_accounts()` → `client.linked_accounts.list()`

This wrapper is the required chokepoint because it provides configuration validation, retry with exponential backoff, circuit breaking, structured logging, and a single place for tenant-aware owner resolution.

## Primary use cases

### UC-1 — Connect an external app

1. An administrator opens Integrations.
2. DataOne opens the configured ACI portal in a new browser tab.
3. The administrator configures the app and completes OAuth/API-key linking in ACI.
4. ACI stores the external credential and creates a linked account.
5. DataOne refreshes linked accounts and shows the app's status.

DataOne must never receive or persist the external app's raw OAuth tokens or API keys.

### UC-2 — Inspect available ACI apps and functions

An administrator searches ACI apps, opens an app, and reviews:

- app name, description, categories, and supported authentication schemes;
- available functions;
- each function's description, input JSON schema, and response contract;
- whether the app is configured and whether the active DataOne owner has an enabled linked account.

This is not implemented in the current tab. It can be added using backend read-only proxies described under "Direct ACI calls."

### UC-3 — Notify an internal Slack channel

1. An administrator configures `ACI_SLACK_INTERNAL_CHANNEL` and links Slack in ACI.
2. The administrator opts into an event such as a pipeline failure.
3. The business operation commits and enqueues a Celery notification task.
4. The task executes `SLACK__CHAT_POST_MESSAGE` through DataOne's governed registry.
5. The destination comes only from server configuration; a user or model cannot override it.
6. Success or failure is recorded in DataOne's Audit Trail.

This is the only currently auto-capable external action because its destination is fixed and administrator-controlled.

### UC-4 — Create a ticket, send a message, or send email

1. A user requests an action through a DataOne workflow.
2. DataOne validates the action against its allow-list and creates an approval record.
3. An authorized human reviews the destination and content.
4. Only after approval does DataOne call the corresponding ACI function.
5. DataOne records destination, actor, action type, outcome, and error metadata.

Arbitrary destinations and persistent external side effects remain approval-only regardless of an LLM's confidence.

### UC-5 — Operate safely during an ACI outage

- The Integrations tab shows a clear unavailable or circuit-open state.
- Core DataOne operations continue.
- Notification delivery failure never rolls back the original pipeline or approval operation.
- ACI retries remain bounded; the circuit breaker prevents retry storms.
- Outcomes remain visible in DataOne's audit records.

## Query: can DataOne call ACI details directly?

### Short answer

**Yes, from the DataOne backend. No, not directly from browser code.**

The official ACI SDK supports direct retrieval of:

- app search: `client.apps.search(...)`;
- app details: `client.apps.get(app_name=...)`;
- function search: `client.functions.search(...)`;
- function definition/schema: `client.functions.get_definition(function_name=...)`;
- linked-account list/get/status;
- function execution: `client.functions.execute(...)`.

ACI also exposes REST endpoints authenticated with `X-API-KEY`, so the same information can be accessed through raw backend HTTP when SDK support is unavailable. The configured `ACI_API_KEY` must never be embedded in the frontend static build or returned to the browser.

### Recommended DataOne API additions

| Proposed endpoint | ACI operation | Policy |
|---|---|---|
| `GET /api/v1/integrations/apps?query=` | `apps.search` | Authenticated; sanitized and paginated. |
| `GET /api/v1/integrations/apps/{app_name}` | `apps.get` | Authenticated read-only metadata. |
| `GET /api/v1/integrations/functions?query=&app=` | `functions.search` | Authenticated; bounded result size. |
| `GET /api/v1/integrations/functions/{function_name}` | `functions.get_definition` | Authenticated read-only schema. |
| `GET /api/v1/integrations/linked-accounts/{id}` | `linked_accounts.get` | Admin; tenant/owner scoped. |

These calls should be implemented as new methods on `AciClientService`, preserving its retry and circuit-breaker behavior. Read-only ACI metadata may be cached briefly using a cache key that includes the ACI project/agent and DataOne tenant.

### What must not be exposed as a generic direct endpoint

Do not add a browser-controlled endpoint such as:

```text
POST /integrations/execute-anything
{ "tool_name": "...", "arguments": { ... } }
```

That would bypass DataOne's allow-list, role checks, approval state machine, destination restrictions, payload validation, and audit semantics. Function execution must continue through a registered DataOne action or another explicit reviewed workflow.

## Multi-tenant requirement

The current default `ACI_LINKED_ACCOUNT_OWNER_ID=dataone` represents one shared owner and is suitable only for a single internal environment. It is not safe for subscriber multi-tenancy.

Before subscriber SSO is enabled:

- derive an opaque ACI owner ID from the authenticated DataOne tenant and user/membership;
- never accept the owner ID from a request body or query parameter;
- filter every linked-account list/get call by the derived owner;
- prevent publisher accounts from appearing in subscriber tenants;
- include tenant context in cache keys, tasks, audit events, and execution records;
- define account unlink/disable behavior when membership or subscription access is revoked.

ACI documents a linked account as unique within a project by app plus linked-account owner ID. DataOne should therefore use stable internal IDs, not mutable email addresses.

## Configuration

| Variable | Meaning |
|---|---|
| `ACI_BASE_URL` | ACI REST/SDK base URL; `http://aci:8000` for the optional self-hosted Compose profile. |
| `ACI_API_KEY` | Server-only ACI agent/project credential. Unset disables the integration. |
| `ACI_PORTAL_URL` | Browser destination used to configure apps and complete OAuth linking. |
| `ACI_LINKED_ACCOUNT_OWNER_ID` | Temporary single-owner default; must become tenant/user-derived before subscriber launch. |
| `ACI_SLACK_INTERNAL_CHANNEL` | Fixed destination for the one auto-capable notify action. |
| `ACI_TIMEOUT` / `ACI_MAX_RETRIES` | External call bounds. |

`ACI_MAX_RETRIES` is enforced by the current wrapper. `ACI_TIMEOUT` is configured but is not currently passed into SDK client construction, so timeout enforcement must be verified or added before describing it as an active runtime guarantee. The pinned `aci-sdk` is a beta release; adapter tests must protect DataOne from SDK method/signature changes.

## Security and governance rules

- Never expose ACI API keys or linked-account credentials to the browser or logs.
- Validate app and function names against strict formats and ACI-returned definitions.
- Bound search limits and cache duration.
- Keep reads and side-effecting execution endpoints separate.
- Require admin access for account lifecycle and notification-policy changes.
- Require approval for user/model-controlled destinations.
- Audit executed actions in DataOne even when ACI has its own logs.
- Fail closed on missing tenant/owner mapping.
- Keep ACI optional: an outage cannot make the rest of DataOne unavailable.

## Current gaps and recommended order

1. Complete application-wide tenant isolation and owner derivation.
2. Add read-only app/function detail methods to `AciClientService` with tests.
3. Add authenticated, bounded DataOne proxy endpoints.
4. Extend the Integrations tab with app search, app details, function schemas, and linked-state badges.
5. Add per-tenant linked-account lifecycle only after tenant authorization is enforced.
6. Keep all executions routed through the governed action registry.

## High-level demo script

`backend/run_integrations_demo.py` provides a presenter-friendly walkthrough
of integration health, discovery, linked accounts, governed actions,
notifications, approval/execution/audit, and the security boundary.

Presentation-only mode performs no network calls:

```bash
cd backend
python run_integrations_demo.py
```

Optional live mode signs in to the running DataOne API and reads status,
linked accounts, governed actions, and notification settings. It never changes
a setting or executes an external function:

```bash
cd backend
DATAONE_DEMO_PASSWORD='<local admin password>' python run_integrations_demo.py --live
```

Use `DATAONE_API_URL` and `DATAONE_DEMO_EMAIL` to override the defaults. The
password is accepted only through the environment so it does not appear in the
process argument list.

## Official references

- [ACI Python SDK](https://github.com/aipotheosis-labs/aci-python-sdk)
- [ACI linked-account model](https://www.aci.dev/docs/core-concepts/linked-account)
- [ACI linked-account API](https://www.aci.dev/docs/api-reference/linked-accounts/list-linked-accounts)
- [ACI functions and naming](https://www.aci.dev/docs/core-concepts/function)
- [ACI tool-use patterns](https://www.aci.dev/docs/sdk/tool-use-patterns)
