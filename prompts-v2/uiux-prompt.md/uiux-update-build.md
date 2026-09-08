# Data One UI/UX Update Build

This is the Data One translation of the UI/UX ideas in `Schema Designer.zip`. It is intentionally stack-specific to this repository.

## Keep

- Next.js App Router and the existing `/dashboard/*` information architecture.
- FastAPI services and current domain models.
- `frontend/src/lib/api.ts` as the only HTTP boundary.
- Existing role checks, audit behavior, draft/version semantics, and tests.
- Existing semantic theme variables in `frontend/src/app/globals.css`.

## Do not import

- Lovable Cloud metadata, plans, project configuration, or error reporting.
- Supabase client/server middleware, RLS migrations, auth, or generated types.
- TanStack Start, TanStack Router, route generation, or server functions.
- Archive-specific schema/mapping tables that duplicate Data One models.
- Placeholder controls, fake KPIs, or disconnected prototype interactions.

## Reusable experience

Every dashboard module should use a shared workspace grammar:

1. A compact page header with eyebrow, title, task-oriented description, and one clearly ranked action group.
2. A bounded content shell with predictable spacing and responsive behavior.
3. Semantic glass/solid panels; accent gradients only for primary actions and active workspace states.
4. Segmented controls for small mutually-exclusive modes; navigation remains route-based when the URL represents a distinct task.
5. Technical identifiers in the existing monospace font; prose in sans-serif.
6. Shared loading, empty, error, warning, and success treatments with real retry/action paths.
7. Dense workspaces may use docked inspectors and toolbars, but must preserve keyboard focus, reduced motion, and narrow-screen usability.

## Module application

- Connectors: inventory header, primary create action, connector health/schema actions, configuration dialog, and honest empty/error states.
- Schema Intel / Comparison / Mapper: consistent selectors and toolbars, compact schema/table cards, version/status context, canvas and inspector hierarchy.
- Topology / Visualization / Impact: graph-first canvas, compact control rail, legible legend, selection inspector, and explicit no-data states.
- Data Quality / Semantic: score band, filter bar, rule/metric tables, details.
- Governance / Risks / Security / Audit: dense tables, shared severity and status language, filter bars, detail drawers, confirmations, and exports.
- Query Workspace: shared connection context, Ask/SQL segmented switch, preserved state across modes, handoff banner, and guarded write confirmation.
- Pipelines / Integrations / Autopilot: list-detail layouts, run/approval status, schedules, logs, and primary/secondary/destructive action hierarchy.

Implementation status and sequencing live in `tasks.md` at the repository root.
