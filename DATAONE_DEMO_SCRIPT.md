# DataOne High-Level Demo Script

## Demo objective

Show how DataOne brings database discovery, AI-assisted engineering, data transformation, governance, and operations into one controlled workspace.

**Recommended duration:** 15–20 minutes  
**Audience:** Business, data, engineering, and governance stakeholders  
**Core story:** Connect data, understand it, transform it, use it, and govern every action.

## Before the demo

- Open DataOne at `http://localhost:3011` and sign in with the demo administrator account.
- Confirm the seeded connectors and demo data are available.
- Keep the Dashboard open as the starting screen.
- Avoid changing security or integration policy unless that change is part of the planned demo.

## Opening — 1 minute

**Say**

> DataOne is an AI-first data engineering and Agentic DBA platform. It gives teams one place to connect data systems, understand schemas, build mappings and pipelines, ask questions in natural language, and apply security and operational controls.

> In this walkthrough, we will follow the lifecycle of data from connection and discovery through transformation, consumption, and governance.

## 1. Operational overview — 1 minute

**Show:** Dashboard

**Do:** Point out the KPI tiles, connection health, recent activity, time-range filter, and quick actions.

**Say**

> The Dashboard is the operational starting point. It summarizes connected sources, schema activity, mapping and pipeline status, security signals, and recent platform events. Teams can move from a high-level health view directly into the area that needs attention.

**Value:** A shared, current view of the data estate and its operational health.

## 2. Connect data systems — 1–2 minutes

**Show:** Connectors

**Do:** Open an existing connection, show its type and health, and explain the connection-test and schema-discovery actions. Mention the supported PostgreSQL, MySQL, Oracle, SQLite, and JDBC connection types.

**Say**

> DataOne connects heterogeneous databases through a common control plane. Administrators can register a source, validate connectivity, monitor health, and discover its schema without exposing credentials to everyday users.

**Value:** One managed entry point for diverse data sources.

## 3. Discover and understand the data estate — 2 minutes

**Show:** Schema Intel, then Schema Topology

**Do:** Select a catalogued connection, expand a table and its columns, then open the topology view to show relationships and risk indicators.

**Say**

> Schema Intelligence turns physical database structures into a searchable catalog. DataOne identifies tables, columns, types, relationships, and sensitive-data classifications.

> The topology view makes those relationships visual. Teams can quickly see how source and target structures connect, where AI has identified likely matches, and where schema or PII risks need attention.

**Value:** Faster discovery, impact analysis, and shared understanding across technical and governance teams.

## 4. Build trusted business definitions — 1 minute

**Show:** Semantic / Metrics

**Do:** Open a metric and point out its definition, dimensions, filters, ownership, and lineage.

**Say**

> The semantic layer gives business concepts a governed definition. Instead of every analyst calculating a metric differently, DataOne captures the measure, its dimensions and filters, and the lineage back to physical data.

**Value:** Consistent metrics and a common language between business and engineering.

## 5. Map source data to target models — 2 minutes

**Show:** Schema Mapper

**Do:** Open a mapping, show source and target fields, demonstrate the visual mapping canvas, and point out AI suggestions and generated SQL. If editing, use a draft rather than a published mapping.

**Say**

> DataOne accelerates schema mapping with both visual and natural-language workflows. Engineers can connect fields directly, ask DataOne to interpret a mapping instruction, review AI-suggested matches, and generate the SQL required to implement the approved design.

> Draft and published states keep experimentation separate from governed, reusable mappings.

**Value:** Less manual mapping work with human review retained at the decision points.

## 6. Orchestrate repeatable pipelines — 2 minutes

**Show:** Pipelines

**Do:** Open a pipeline and show its source, target, mapping, schedule, enabled state, and recent run history. Explain drift validation and retry behavior at a high level.

**Say**

> Once a mapping is ready, DataOne turns it into an operational pipeline. Pipelines can be run on demand or on a schedule, with status, retries, run history, and schema-drift checks visible in the same workspace.

> If a source schema changes in a way that makes a run unsafe, DataOne can surface or block that impact before data is moved incorrectly.

**Value:** Governed, observable transformation rather than disconnected scripts and jobs.

## 7. Ask questions and create data outcomes with AI — 2–3 minutes

**Show:** Query Workspace

**Do:** Ask a safe, high-level question such as `Which tables contain customer or email data?` Show the generated answer or SQL and the retained conversation. If prepared, also show a schema-design plan awaiting review.

**Say**

> Query Workspace provides a conversational interface over the data estate. A user can ask a question in plain language, while DataOne grounds the response in known schemas and generates the appropriate query or plan.

> The same workspace can assist with database engineering tasks such as schema design. Changes are presented as plans for review; AI does not silently alter production structures.

**Value:** Broader access to data and engineering knowledge without removing safety controls.

## 8. Turn results into visuals — 1 minute

**Show:** Visualize

**Do:** Open a saved or prepared result and switch between table, bar, line, area, pie, scatter, or KPI views.

**Say**

> Query results can move directly into visual analysis. DataOne supports common chart and KPI formats so users can explore an answer without leaving the governed workflow.

**Value:** A shorter path from question to understandable insight.

## 9. Apply Agentic DBA automation safely — 2 minutes

**Show:** AI Autopilot

**Do:** Show the Run Console, Approvals, Policy, and Action Log tabs. Open a recommendation and explain its proposed action, risk, and approval posture; do not approve it unless pre-authorized.

**Say**

> AI Autopilot continuously evaluates the environment and proposes database actions. Administrators decide which action types are advisory, approval-based, or eligible for bounded automation.

> Every recommendation has a visible lifecycle—from evaluation and human decision to execution outcome—so automation remains explainable and controlled.

**Value:** Proactive database operations with policy, approval, and accountability built in.

## 10. Govern access and sensitive data — 2 minutes

**Show:** Security

**Do:** Move across Roles, Permissions, Users, Masking, Row Filters, and Audit. Show the link back to PII classifications in Schema Intel.

**Say**

> DataOne combines platform authorization with data-level controls. Administrators can manage roles and permissions, assign access, define masking policies, and restrict rows for specific audiences.

> These controls connect back to discovered PII and sensitivity classifications, helping teams move from identifying risk to enforcing policy.

**Value:** Security and governance embedded in daily data operations.

## 11. Connect governed external actions — 1 minute

**Show:** Integrations

**Do:** Show ACI status, linked accounts, governed action types, and notification settings. Do not execute an external action during the general demo.

**Say**

> Integrations allow DataOne workflows to interact with external systems such as Slack, email, and ticketing tools. ACI manages the external account connection, while DataOne controls which actions are allowed, when approval is required, and what is audited.

> External integration is optional; an outage does not stop core DataOne operations.

**Value:** Useful automation beyond the platform without creating an uncontrolled tool-execution path.

## 12. Close the loop with auditability — 1 minute

**Show:** Audit Trail

**Do:** Filter or sort recent events and open one event to show timestamp, module, actor, action, outcome, and details.

**Say**

> The Audit Trail closes the loop. Connection changes, schema activity, mappings, pipeline runs, AI actions, security changes, and integration outcomes are recorded with the responsible actor and result.

> This gives operators a troubleshooting record and gives governance teams evidence of how the platform is being used.

**Value:** End-to-end operational accountability.

## Closing — 30 seconds

**Say**

> DataOne unifies the full data-engineering lifecycle: connect, discover, define, map, move, query, automate, secure, and audit. AI accelerates the work, while policy, approvals, and traceability keep people in control.

> The result is a platform that helps teams move faster without separating innovation from governance.

## Optional short version — 5 minutes

For an executive overview, use only these stops:

1. Dashboard — operational visibility.
2. Schema Topology — understanding the data estate and risk.
3. Schema Mapper and Pipelines — building and running transformations.
4. Query Workspace and AI Autopilot — AI-assisted insight and operations.
5. Security and Audit Trail — control and accountability.

## Presenter guardrails

- Use seeded or pre-validated demo data; do not create credentials live.
- Keep AI outputs framed as grounded suggestions or plans that follow platform policy.
- Do not approve a database or external action unless its effect is understood and expected.
- Do not claim tenant isolation is production-ready until the application-wide tenant work and sign-off are complete.
- Treat external integrations as optional and governed; never expose API keys or credentials.
- If an AI or external service is unavailable, use the moment to show graceful failure, retained core operations, and audit visibility.
