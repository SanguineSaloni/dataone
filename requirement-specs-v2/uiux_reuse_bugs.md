# UI/UX Reuse Build — Post-completion bug report

Filed after user testing of `tasks.md` tasks #03–#09 (all marked `[x]`). Task #12 ("Cross-module verification — responsive widths...") was never started, and every bug below is exactly the class of defect that task is meant to catch — this report is effectively a manual first pass at #12, scoped to the 4 areas the user hit.

## Status legend

- `[ ]` Not started · `[~]` In progress · `[x]` Fixed & verified · `[?]` Needs more info to fully resolve

## Findings

| # | Status | Area | Summary |
|---|---|---|---|
| B01 | `[x]` | Topology (shared, all 14 `WorkspaceHeader` pages) | `.workspace-header` has no `flex-wrap`; a wide actions row crushes the title/description column into a 1-word-per-line stack |
| B02 | `[x]` | Topology | Floating node-search box (`position: absolute; top-4 right-4`) renders on top of graph nodes near the top-right of the canvas |
| B03 | `[x]` | Schema Mapper, Visualize, Security, Pipelines, Schema | 5 separate `Toast` components use `fixed top-4 right-4 z-50`, which sits inside the sticky shell header's 64px band and renders on top of it |
| B04 | `[x]` | Schema Mapper | `WorkspaceHeader`'s title-badges row and actions row have no `flex-wrap`, same crush risk as B01 once enough badges/buttons are present |
| B05 | `[x]` | Query Workspace | AskData conversation (`turns`, `sessionId`) is component-local state with no persistence; navigating to another route and back unmounts `AskDataView` and silently discards the conversation, even though the backend already has a durable chat-session store |
| B06 | `[x]` | Data Visualization | The currently-selected chart type button is disabled if it doesn't match the current field config — including on first load, where the default selection ("Bar") is disabled before the user has picked any fields |
| B07 | `[?]` | Data Visualization | User reports "unable to perform any action from the UI." Code review of `useVisualize`, `FieldConfigPanel`, `ChartTypeSelector`, `ChartCanvas`, `SaveViewDialog`, `ExportMenu` found no click-blocking overlay, no `pointer-events` issue, and no handler wired to a no-op — every button/select has a real, locally-testable handler. B01's header crush also applies to this page's (shorter) actions row and could look like "nothing responds" if the connection selector or the Views/Export buttons get visually crushed together. Filed as `[?]` rather than guessed at — needs a screenshot or a repro (which specific control was clicked) to find anything beyond what B01/B06 already explain. See "Open" below.

## Detail

### B01 — shared `.workspace-header` crush (`frontend/src/app/globals.css:197`)

```css
.workspace-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1.5rem; }
```

No `flex-wrap`. The title block has `min-w-0` (can shrink); the actions block has `shrink-0` (refuses to shrink). When actions' content is wider than the remaining row (Topology's toolbar — source/target pickers, 3 view-mode buttons, refresh, fit, reset, plus one button per schema group — routinely is, even on a wide desktop screenshot), flexbox's only remaining move is to crush the title block toward zero width, wrapping "Topology & Lineage" one word per line and visually interleaving with the actions row. This component (`frontend/src/app/dashboard/components/WorkspaceHeader.tsx`) is shared by 14 pages (Topology, Visualize, Connectors, Schema Mapper, Security, Data Quality, Schema, Audit, Risks, Semantic, Governance, Impact, Query Workspace, Schema Comparison) — any page whose actions row is wide enough hits the same crush.

**Fix:** add `flex-wrap: wrap` to `.workspace-header` and let the actions block size to the wrapped line instead of refusing to shrink, so it drops to its own full-width row (and then wraps its own buttons internally, which every consumer's actions `<div>` already does) instead of crushing the title.

### B02 — Topology search overlay over canvas nodes (`visualize/topology/page.tsx:570-596`)

```tsx
<div className="absolute right-4 top-4 z-20 w-72">
  <label className="glass flex items-center gap-2 ...">
    ...placeholder="Find table or column…"
```

Target-system tables render on the right side of the graph by the layout engine's left(source)→right(target) convention; the search box floats at the same top-right corner. They compete for the same screen region by construction, not by accident — the screenshot's `dim_date` node sitting under the search box is the expected case, not an edge case.

**Fix:** move the search control into the page's `WorkspaceHeader` actions row (alongside Source/Targets/view toggles) instead of floating it over the canvas. The matches dropdown becomes a small popover anchored to that control. This removes the collision entirely rather than reducing its odds.

### B03 — Toast notifications rendering over the sticky shell header

```tsx
className="fixed top-4 right-4 z-50 max-w-sm rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur"
```

Present verbatim (differing only in tone-color tokens) in:
- `frontend/src/app/dashboard/schema-mapper/components/Toast.tsx`
- `frontend/src/app/dashboard/visualize/components/Toast.tsx`
- `frontend/src/app/dashboard/security/components/Toast.tsx`
- `frontend/src/app/dashboard/pipelines/components/Toast.tsx`
- `frontend/src/app/dashboard/schema/components/Toast.tsx`

The shell header (`dashboard/layout.tsx`) is `sticky top-0 z-10` and `var(--header-height)` (64px) tall. `top-4` (16px) is inside that band; `z-50` outranks the header's `z-10`. Any toast in these 5 modules renders on top of the header's search/badges/notification bell/profile — this is the "notifications also coming up on overlapping text" report.

**Fix:** anchor all 5 below the header: `top-[calc(var(--header-height)+1rem)]` instead of `top-4`. (Noted, not acted on: these 5 components are identical copies of the same JSX with only color tokens differing — a good future candidate for a single shared `Toast` primitive in `dashboard/components/`, consistent with `tasks.md`'s own "prefer shared primitives over copied ... state views" guardrail. Out of scope for this bug-fix pass.)

### B04 — Schema Mapper's own `WorkspaceHeader` (`schema-mapper/components/WorkspaceHeader.tsx`)

The outer container already has `flex flex-wrap` (line 105), but its two inner rows don't:
- The title/badges row (line 107: mapping name + rename icon + status pill + `ReviewStageBadge` [stage pill + next-stage button + optional Reject button] + blocking/warning pills) is a plain `flex items-center gap-2`.
- The actions row (line 186: Validate, Export, 2 report buttons, conditional Revise, conditional Publish) is also a plain `flex items-center gap-2`.

With the docked Properties/Comments/History panels open, the center workspace column narrows considerably; either row can run out of room with no wrap fallback, same failure class as B01.

**Fix:** add `flex-wrap` to both rows.

### B05 — Query Workspace conversation lost on navigate-away-and-back

`AskDataView.tsx` owns `turns`, `sessionId`, and `input` as local `useState`, seeded fresh on every mount (`turns` defaults to the one-line greeting, `sessionId` to `undefined`). `QueryWorkspaceInner` does keep `AskDataView` mounted while toggling *within* Ask/SQL mode (by design, `hidden` class not unmount) — but navigating to a **different route** and back unmounts the whole `/dashboard/query-workspace` page tree, destroying that state. The backend already persists the full exchange (`ChatMessage` rows keyed by `session_id`, readable via the existing `GET /api/v1/askdata/sessions/{id}/messages`) — the frontend just never reads it back or remembers which session it was on.

**Fix:** persist `sessionId` to `sessionStorage` (tab-scoped, cleared on tab close — the right lifetime for "resume where I left off in this browser tab," not a cross-device account-level history feature) and, on mount, if a persisted id exists, fetch that session's messages and rehydrate `turns` from real backend data rather than caching the rich UI state client-side (which would drift from the source of truth). Also add a small "New chat" action — restoring history with no way back to a blank conversation is a dead end.

### B06 — Default chart type disabled on first load (`visualize/components/ChartTypeSelector.tsx:24-37`)

```ts
function isCompatible(type: ChartType, dimensionCount: number, measureCount: number): boolean {
  switch (type) {
    ...
    default: return dimensionCount >= 1 && measureCount >= 1;
  }
}
...
disabled={!compatible}
```

`chartType` defaults to `"bar"` (`useVisualize.ts:29`) and starts with zero dimensions/measures, so `isCompatible("bar", 0, 0)` is `false` — the button for the **currently active** chart type renders disabled (`opacity-30`, unclickable, unfocusable) before the user has configured anything. Not a hard blocker (Table is always compatible and clickable), but it's a real, confusing "the selected option is greyed out" defect and a plausible contributor to "nothing seems to respond."

**Fix:** never disable the currently-selected option in a single-select control — `disabled={!compatible && value !== ct.type}`.

## Open

- **B07** — needs a screenshot or a named control ("I clicked X and nothing happened") to go further than B01/B06 already cover.
- The Toast duplication noted under B03 is a good task-#10/#11-adjacent cleanup, not filed as its own task here.

## Progress log

- 2026-07-22 — Filed after user report (screenshot of Topology & Lineage plus 3 other module reports) following `tasks.md` #03–#09 completion. Fixing B01–B06 in this pass; B07 left `[?]` pending a repro.
- 2026-07-22 — **B01–B06 fixed and verified.** `.workspace-header` now wraps (`flex-wrap: wrap` + a `.workspace-header-actions` class replacing the old `shrink-0`, so a long actions row drops to its own full-width line instead of crushing the title — fixes every one of the 14 consumer pages, not just Topology). Topology's node search moved from a canvas-floating overlay into the header toolbar (no more competing with target-node placement). All 5 `Toast` components now clear the sticky shell header (`top-[calc(var(--header-height)+1rem)]`). Schema Mapper's own header title/actions rows gained `flex-wrap`. `ChartTypeSelector` no longer disables the currently-active chart type. AskData conversations now persist their `session_id` to `sessionStorage` and rehydrate `turns` from the existing `GET /askdata/sessions/{id}/messages` endpoint on remount, with a new "New chat" reset action. Verified: full frontend suite 286/286 (0 new failures), `tsc --noEmit` clean, ESLint clean on every touched file (repo-wide baseline unchanged at 4 pre-existing errors in unrelated `tenants/` files), `next build` clean (all 25 routes). B07 remains `[?]` — no concrete additional root cause found beyond B01/B06, which both apply to the Visualize page; needs a screenshot or named control to go further.
