Schema Mapper — UI/UX Redesign + Backend

A polished visual schema-to-schema mapper with drag-and-drop edges, versioned drafts, AI-assisted matching, live DB introspection, and multi-format export.

1. UX / Layout

┌───────────────────────────────────────────────────────────────────────────┐
│  Schema Mapper                                    [Docs] [Migration] [🚀] │
│  Visual drag-and-drop with versioned, audited mappings                    │
├──────────────┬────────────────────────────────────────────────────────────┤
│ MAPPINGS     │  ┌ Version bar: v#3 · DRAFT · 12 edges · autosaved 4s ago ┐│
│ + New        │  │  [Validate] [AI Suggest] [Export ▾] [Publish]         ││
│ ─────────    │  └────────────────────────────────────────────────────────┘│
│ ▸ retail-e2e │                                                            │
│   #3 DRAFT   │   SOURCE            ↔  MAPPINGS CANVAS  ↔       TARGET     │
│ ▹ retail-e2e │  ┌────────────┐    (SVG edges w/ drag)   ┌────────────┐    │
│   #2 PUB     │  │ analytics_ │────────────╲             │ products   │    │
│ ▹ retail-e2e │  │ customers  │             ╲──────────▶ │            │    │
│   #1 PUB     │  │ 🔑 id INT  │                          │ 🔑 id      │    │
│              │  │  full_name │──╮                       │  name      │    │
│ FILTER       │  │  email     │  ╰──── transform ──────▶ │  category  │    │
│ [All ▾]      │  │  ...       │                          │  ...       │    │
│              │  └────────────┘                          └────────────┘    │
│              │                                                            │
│              │  ┌ Edge inspector (right drawer, opens on edge click) ────┐│
│              │  │ source.full_name → target.name                         ││
│              │  │ Transform: [ none | lower | upper | concat | expr ]    ││
│              │  │ Confidence: 92%  ·  Notes:  ______________             ││
│              │  └────────────────────────────────────────────────────────┘│
│              │                                                            │
│              │  AI SUGGESTIONS  (2 pending · 8 accepted · 1 rejected)     │
│              │  • ssn → customer_ssn   87%   [Accept] [Reject] [Preview]  │
│              │  • region → market      74%   [Accept] [Reject] [Preview]  │
└──────────────┴────────────────────────────────────────────────────────────┘

Design language: dark surface with an accent gradient (indigo→cyan) reserved for primary actions and active edges. Semantic tokens only; monospace for column names/types. Edges are quadratic bezier SVG paths that hover-highlight both endpoints. Column pills are drag handles; dropping on a target column creates an edge. Keyboard: ⌘K command palette (jump to column, run AI, publish), Del removes selected edge.

Key screens/routes:





/ — mapper workspace (list + canvas + inspector)



/schemas — schema library (create / import DDL / import CSV / connect DB)



/mappings/$id/history — version diff view



/mappings/$id/report — migration report



/auth — sign in

2. Data Model (Lovable Cloud / Postgres)





schemas (id, name, kind: source|target, origin: manual|ddl|csv|db, owner_id, created_at)



tables (id, schema_id, name, position)



columns (id, table_id, name, data_type, is_pk, is_nullable, ordinal)



mappings (id, name, source_schema_id, target_schema_id, owner_id, created_at)



mapping_versions (id, mapping_id, version_no, status: draft|pending_review|published, notes, created_by, created_at, published_at)



mapping_edges (id, version_id, source_column_id, target_column_id, transform_kind, transform_expr, confidence, ai_generated bool)



ai_suggestions (id, version_id, source_column_id, target_column_id, score, rationale, transform_hint, decision: pending|accepted|rejected, decided_by, decided_at)



audit_log (id, version_id, actor_id, action, payload jsonb, created_at)



db_connections (id, owner_id, label, host, port, database, username, secret_ref) — password stored as a project secret

RLS: owner-scoped for all tables. user_roles + has_role() for admin who can publish and manage connections. GRANTs added per template rules.

3. Backend (server functions + routes)

Server functions in src/lib/*.functions.ts (all .middleware([requireSupabaseAuth])):





listMappings, createMapping, renameMapping



getVersion(versionId) — returns tables, columns, edges, suggestions



createDraftVersion(mappingId) — clones latest as new draft



saveEdges({versionId, edges[]}) — autosave (30s + tab hide)



validateVersion(versionId) — type-compat, pk/unmapped required, duplicates → returns issues



publishVersion(versionId) — admin only; sets status, freezes edges



importDDL({schemaId, sql}) — parses CREATE TABLE via node-sql-parser



importCSV({schemaId, name, csvText}) — header + type inference from sample rows



introspectDatabase({connectionId}) — reads information_schema via pg (Worker-compatible via node-postgres over TCP; if not viable, fall back to a user-run SQL snippet import)



getAISuggestions(versionId) — fuzzy pass (Jaro-Winkler + token match) fills obvious matches; unmatched targets sent to Lovable AI (openai/gpt-5.5) with source column list + types, structured Output.object returning [{targetId, sourceId, score, transform, rationale}]



decideSuggestion({id, decision})



exportMapping({versionId, format}) — json | sql | dbt | md



getMigrationReport(versionId) — coverage %, unmapped required, type coercions

Server routes:





src/routes/api/public/webhook.ts — optional, for CI pipelines to fetch published mapping JSON with HMAC signature

AI details: fuzzy first (deterministic, free), then a single AI call for leftovers. Constraint-free structured schema; guarded with NoObjectGeneratedError fallback. LOVABLE_API_KEY server-side only.

4. Export Formats





JSON: canonical {version, source, target, edges:[{from,to,transform}]}



SQL: INSERT INTO target (...) SELECT <transformed cols> FROM source ... with CAST/COALESCE inserted for type mismatches



dbt: models/<mapping>.sql + <mapping>.yml (columns, tests: not_null on required, unique on PK)



Markdown: table of mappings, transforms, coverage, open issues

5. Milestones





Auth + schema library (manual create, DDL paste, CSV import) with tables/columns UI



Mapper canvas: SVG edges, drag-drop create, edge inspector, autosave draft



Versioning: draft/publish, history diff, audit log



Validate + AI suggestions (fuzzy + Lovable AI leftovers) with accept/reject



Exports (JSON, SQL, dbt, Markdown) + migration report



Live DB introspection (feasibility check on Worker pg; if blocked, ship "paste \d+ output" fallback and mark live-DB as follow-up)

6. Technical Notes





Stack: TanStack Start, Lovable Cloud, Tailwind v4 tokens, shadcn. Drag-drop hand-rolled with pointer events + SVG (no heavy lib).



Autosave debounced 30s + visibilitychange.



All privileged writes (publish, admin) verify role via has_role under RLS before any supabaseAdmin use.



No hardcoded colors; extend src/styles.css with --accent-edge, --accent-edge-glow, --gradient-primary, --shadow-elevated.



Each route gets its own head() with unique title/description/OG.

7. Out of Scope (this pass)





Real-time multi-user co-editing



Row-level data preview / actual migration execution



Non-Postgres target dialects (MySQL/BigQuery) — SQL export is Postgres-flavored

Confirm to proceed and I'll build milestones 1–5 end-to-end; milestone 6 flagged if the Worker pg path is blocked.