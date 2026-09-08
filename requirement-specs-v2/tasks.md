# Data One UI/UX Reuse Build

Goal: apply the useful workspace patterns from `Schema Designer.zip` across the existing Data One dashboard without importing Lovable Cloud, Supabase, TanStack Start, generated route code, or archive-specific backend/data models.

## Status legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Implemented and verified
- `[!]` Blocked
- `[?]` Product decision required

## Guardrails

- Keep Next.js App Router, React, FastAPI, and `frontend/src/lib/api.ts`.
- Reuse real Data One endpoints and state; do not add mock metrics or controls.
- Use semantic tokens from `globals.css`; no page-local hardcoded colors.
- Preserve role checks, validation, audit behavior, and workspace handoffs.
- Prefer shared primitives over copied page headers, tabs, cards, or state views.
- Verify each migration with focused tests, then full lint, tests, and build.

## Build tasks

| # | Status | Priority | Task | Scope / acceptance |
|---|---|---|---|---|
| 01 | `[x]` | P0 | Ground archive against Data One | Separate reusable UI patterns from Lovable/Supabase/TanStack infrastructure and document the translation. |
| 02 | `[x]` | P0 | Shared workspace foundation | Add reusable page header, action area, segmented control, content shell, accent surface, and consistent state presentation. First consumers: Connectors and Query Workspace. |
| 03 | `[x]` | P0 | Connectors | Migrate header, primary action, loading/error/empty states, cards, schema dialog, and create flow to shared visual language without changing APIs. |
| 04 | `[x]` | P0 | Query Workspace | Migrate workspace header/mode switch/banner/error treatment while preserving mounted Ask/SQL state and write-confirm guardrails. |
| 05 | `[x]` | P1 | Schema Intel + Schema Comparison | Standardize page chrome, selectors, search/filter bars, data tables, and diff states. |
| 06 | `[x]` | P1 | Schema Mapper | Align existing mapping list/canvas/version bar/dock panels to shared tokens; preserve its more capable native versioning and API model. |
| 07 | `[x]` | P1 | Topology + Visualization + Impact | Standardize graph toolbars, inspectors, legends, empty/error states, and responsive workspace framing. |
| 08 | `[x]` | P1 | Data Quality + Semantic | Standardize KPI bands, scorecards, filters, rule/metric tables, and detail drawers. |
| 09 | `[x]` | P1 | Governance + Risks + Security + Audit | Standardize dense-table chrome, severity/status vocabulary, filters, drawers, confirmations, and exports. |
| 10 | `[ ]` | P2 | Pipelines + Integrations + Autopilot | Standardize list/detail workspaces, tabs, run/approval states, schedules, and action hierarchy. |
| 11 | `[ ]` | P2 | Dashboard + enterprise shell | Finish responsive shell polish, replace emoji navigation with an accessible consistent icon treatment, and unify page spacing/breadcrumb behavior. |
| 12 | `[ ]` | P0 | Cross-module verification | Keyboard/focus audit, reduced-motion check, light/dark contrast, responsive widths, full Vitest, ESLint, TypeScript, and production build. |

## Execution order

1. Finish task 02 and validate it through tasks 03–04.
2. Migrate data-modeling workspaces (05–07), then intelligence/governance surfaces (08–09).
3. Migrate operational surfaces (10), finish shell consistency (11), and run the full audit (12).

## Progress log

- 2026-07-22 — Audited the archive. Reusable: semantic dark/light surfaces, restrained gradient accents, compact workspace headers, segmented navigation, panel hierarchy, monospace technical data, and explicit async states. Rejected: `.lovable`, Supabase auth/RLS/migrations, TanStack routing/server functions, generated route tree, Lovable AI/error reporting, and archive database models.
- 2026-07-22 — Started shared foundation and first migrations for Connectors and Query Workspace. Existing Data One APIs, auth, write confirmation, and handoff behavior remain the source of truth.
- 2026-07-22 — Completed the shared workspace foundation and Query Workspace migration: Ask/SQL mode state remains mounted, handoffs and guarded writes are unchanged, connection controls are labeled, actions and statuses use semantic tokens, and the SQL resource sidebar is responsive with accessible tab semantics. Extended Connectors through reusable glass cards, accessible action menus, semantic health/actions, and improved create/schema dialogs; secondary edit/rotate/delete/activity overlays remain under task 03, so it stays `[~]`.
- 2026-07-22 — Completed Schema Intel + Schema Comparison page migration: shared headers, bounded tool/filter surfaces, labeled selectors/search fields, semantic primary actions, and shared loading/error/empty states. Existing catalog cards, comparison data, role checks, scan/profile behavior, and API flows are unchanged. Verified the combined pass with 280/280 frontend tests, TypeScript, focused ESLint, `git diff --check`, and a production Next.js build.
- 2026-07-22 — Completed Connectors. Added a reusable accessible `DialogSurface` and migrated edit, credential rotation, dependency-aware soft deletion, and connector activity onto it. Dialogs close via explicit action, Escape, or backdrop; carry proper labels; and use shared semantic states. Preserved all connector API payloads, credential testing, dependency checks, delete gating, and audit reads. Added 2 dialog tests; full frontend 282/282 and production build clean.
- 2026-07-22 — Started Schema Mapper migration. Applied the shared page header and workspace background, shared empty/loading states, semantic mapping rail selection/statuses/actions, semantic autosave/version bar, and consistent mapping toolbar actions. Preserved the existing mapper-specific header behavior, drag/drop canvas, versioning, review workflow, and three docked panels. Task 06 remains `[~]` pending the nested Canvas, Properties, Validation, Suggestions, Transform, Publish, Export, Comments, and History token pass. Mapper tests 63/63; full frontend 282/282 and production build clean.
- 2026-07-22 — Completed Schema Mapper. Migrated the nested Canvas, Properties, Validation, Suggestions, Transform, Publish, Export, Comments, History, review-stage, heatmap, toast, and report surfaces from page-local palette utilities to Data One semantic tokens, retaining distinct source/target, transformation, and business-rule meaning. Fixed the pre-existing `ExportModal` synchronous effect-state lint defect with a render-time prop-change reset; copy/download behavior is unchanged. Mapper-wide ESLint and 63/63 tests, full frontend 282/282, TypeScript, diff check, and production build clean.
- 2026-07-22 — Completed Topology, Visualization, and Impact Analysis. Added shared workspace headers and responsive graph/config/inspector layouts; standardized topology selectors, view controls, node search, graph legend, summaries, annotations, and detail panel. Replaced topology and Recharts hardcoded colors with semantic CSS variables, including series, axes, grids, tooltips, mapping edges, risks, and statuses. Impact selectors and dependency/risk cards now use shared surfaces. Graph layout/search/clustering/LOD/merge/view logic, live chart queries, exports/saved views, and impact traversal remain unchanged. Focused 34/34, full frontend 282/282, TypeScript/module ESLint/diff check, and production build clean.
- 2026-07-22 — Completed Data Quality and Semantic/Metrics. Data Quality gained the shared header/connection context, glass score summary and expandable table scorecards, and responsive horizontal score tables while retaining honest unavailable accuracy/freshness cells. Semantic gained a shared page header, responsive catalog/detail layout, semantic draft/published/certified states, shared metric loading/error surfaces, glass definition/editor cards, and consistent primary actions. Removed a stale unused `useMemo` import and added the module's first 2 frontend tests for framing/catalog/detail loading. Focused 7/7, full frontend 284/284, TypeScript/module ESLint/diff check, and production build clean.
- 2026-07-22 — Completed Governance, Risk & Compliance, Security, and Audit. Standardized shared headers, glass filters/tables, semantic severity and outcome states, responsive table/detail/editor layouts, Security section tabs, confirmation dialogs, audit correlation/details, pagination, and export placement. Security privileged confirmations now reuse `DialogSurface`; authorization, masking, row-filter, role, governance, risk, and append-only audit APIs are unchanged. Added Security's first 2 page tests. Focused 21/21, full frontend 286/286, TypeScript/module ESLint/diff check, and production build clean.
- 2026-07-22 — **Post-completion bug pass** (user testing found real regressions in #06/#07 and a pre-existing gap in Query Workspace): filed and fixed 6 issues in [`uiux_reuse_bugs.md`](uiux_reuse_bugs.md). Root cause of the reported Topology screenshot: the shared `.workspace-header` (task 02's foundation, consumed by all 14 migrated pages) has no `flex-wrap`, so any page whose actions row is wide enough crushes the title into a one-word-per-line stack instead of wrapping — this is exactly the class of defect task #12 (not yet started) exists to catch. Fixed at the shared-component level, which corrects it for every consumer, not just Topology. Also: moved Topology's node search out of a canvas-floating overlay that structurally competed with target-node placement; fixed 5 separate `Toast` components rendering on top of the sticky shell header; hardened Schema Mapper's own header against the same crush pattern; fixed a chart-type selector that disabled its own default/active selection; and fixed Query Workspace's AskData conversation being silently discarded on route navigation by persisting the session pointer and rehydrating from the existing chat-history endpoint. One item (a vague "no actions work" report on Data Visualization) stayed `[?]` — no additional concrete root cause beyond what the other fixes already cover. Verified: full frontend 286/286, `tsc`, ESLint (baseline unchanged), production build all clean.
