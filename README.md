# Veltirs DataOne — Secure Databricks App

Veltirs DataOne is a React/TypeScript Databricks App that runs a governed, one-click data workflow. A user selects a CSV, JSON, Parquet, or local SQLite file, or an allowed Unity Catalog table; Lakeflow then profiles, cleans, maps, and summarizes the data before the app presents the results step by step.

The implementation and Marketplace boundary are explained in detail in [ARCHITECTURE.md](./ARCHITECTURE.md).

Target workspace: `1354394467602787` (`https://dbc-1670f1c2-1198.cloud.databricks.com`). The Job, Pipeline, Unity Catalog schemas/volume, and Genie Agent are deployed there. The hosted App remains intentionally undeployed until the target workspace receives the AWS MySQL/PostgreSQL connections and secret values.

Current deployment facts:

- Local AppKit development authenticates with the OAuth profile `dataone-current`. A new managed app service principal will be created when the App is deployed in the target workspace.
- The Lakeflow Job and Pipeline use the workspace deployment user as their explicit `run_as` identity (`${workspace.current_user.userName}` in the bundle). The app principal can trigger the bound Job but does not become the Spark workload identity.
- A target-workspace CSV run completed successfully through source profiling, the Lakeflow Spark Declarative Pipeline, and project Gold publication.
- Every successful live run now publishes passed records to a managed Delta table derived from the UI project name. For example, `Customer Revenue Quality Demo` writes `workspace.dataone_gold.customer_revenue_quality_demo`; rerunning that project replaces its final table with the newest successful output.
- The production code now supports administrator-bound Unity Catalog connections and foreign-catalog sources. A deployment is not complete until the source/target connection names and AWS PostgreSQL secret are supplied as bundle variables.

## Local multi-source demo

Run the complete UI without Databricks credentials by starting the explicitly isolated demo backend:

```bash
npm run demo
```

Then open <http://127.0.0.1:4173/?demo=1>. Choose the bundled **CSV**, **JSON**, or real **Apache Parquet** sample and click **Run File Sample & Open Dashboard**. All three files contain the same 16 synthetic customer orders, so matching results verify parser parity while still exercising the real upload and parsing path. The records include invalid emails and dates, missing fields, inconsistent country/status labels, and payment failures so mapping, quality, visualization, prediction, audit, and AskData all have meaningful evidence.

The same setup page also offers an alias-only database simulation: **`demo-mysql-commerce` → `demo-postgres-analytics`**. It demonstrates governed ingestion and a separate controlled target-export stage without connecting to an external database or collecting a password, hostname, PAT, or other credential. Use [`MANAGER_DEMO_SCRIPT.md`](./MANAGER_DEMO_SCRIPT.md) for the complete presentation click path and talk track.

The bundled sources are:

- [`samples/customer_revenue_quality_demo.csv`](./samples/customer_revenue_quality_demo.csv)
- [`samples/customer_revenue_quality_demo.json`](./samples/customer_revenue_quality_demo.json)
- [`samples/customer_revenue_quality_demo.parquet`](./samples/customer_revenue_quality_demo.parquet)

Regenerate the JSON and Parquet fixtures deterministically from the CSV with `npm run demo:generate-samples`.

Demo mode is deliberately labelled throughout the UI. Its Files, Job, Pipeline, SQL, and Genie behavior is deterministic and simulated locally; it never claims to have executed Databricks resources. The normal `npm run dev` and `npm start` paths still use the real AppKit resource bindings described below and never fall back to demo data.

## Real Databricks backend

| User action or view                         | Backend integration         | Current resource                                                       |
| ------------------------------------------- | --------------------------- | ---------------------------------------------------------------------- |
| Upload CSV, JSON, Parquet, or SQLite        | AppKit Files API            | UC Volume `workspace.dataone_bronze.dataone_landing`                   |
| Discover/select a governed source           | SQL + Lakehouse Federation  | `system.information_schema` and an installed foreign catalog           |
| Persist app state                           | AWS PostgreSQL              | Connection aliases, projects, and Databricks run IDs only              |
| Click **Start DataOne**                     | AppKit Jobs API             | Lakeflow Job `dataone-orchestrator` (`943324386782567`)                |
| Profile the source                          | Serverless notebook task    | `src/jobs/profile_source.py`                                           |
| Quality checks and cleaning                 | Spark Declarative Pipelines | `dataone-quality-pipeline` (`62a9d28f-6f64-4373-ae08-c2c26faa2f53`)    |
| Publish the project data product            | Serverless notebook task    | `src/jobs/publish_project_gold.py` → project-named managed Delta table |
| Optional external target publication        | Governed Spark Job task     | `src/jobs/publish_external_database.py`                                |
| KPIs, mappings, charts, topology, and audit | AppKit Analytics API        | SQL Warehouse `fafc14eabc92df75`                                       |
| Governed metadata and outputs               | Unity Catalog               | `dataone_bronze`, `dataone_ops`, and `dataone_gold`                    |
| AskData/NL2SQL                              | Dedicated Genie Agent       | `DataOne AskData` (`01f1bd7234a4137eb153f8956cc6d01d`)                 |

## UI feature map

The dark DataOne workspace includes a secure source onboarding screen and nine live views: Dashboard, Agentic DBA Copilot, Schema Mapper, Autopilot Governance, AskData (NL2SQL), Data Quality, Data Visualization, Prediction / Risk Forecast, and Audit Trail & Cross-Source Intelligence. Navigation switches views without losing the selected run. Every data surface includes loading, empty, and error states; the prediction view exposes its deterministic formula and the AskData surface discloses the execution identity and asks users to inspect generated SQL.

Search for the `[DBX-*]` comments in the repository to find each Databricks integration point. The most important markers include `[DBX-APPKIT]`, `[DBX-FEDERATION-BINDINGS]`, `[DBX-FEDERATION-METADATA]`, `[DBX-AWS-POSTGRES]`, `[DBX-JOB]`, `[DBX-PIPELINE]`, `[DBX-PROJECT-GOLD-WRITE]`, `[DBX-TARGET-EXPORT]`, `[DBX-ANALYTICS]`, and `[DBX-GENIE]`.

The deployed identity split is documented beside the configuration with `[DBX-SERVICE-PRINCIPAL]`, `[DBX-JOB-RUN-AS]`, and `[DBX-PIPELINE-RUN-AS]`.

After App deployment, AppKit Files, Analytics, Jobs API calls, and AskData Genie requests run as the new Databricks-managed app service principal. Unity Catalog and app-resource grants restrict that identity to the bound resources required by the application. The triggered Job and Pipeline execute separately as the workspace deployment user configured by `${workspace.current_user.userName}`. The Genie Agent is restricted to five DataOne Gold summary tables and the project run ledger; it cannot query raw cleaned records.

## Authentication

The hosted application uses Databricks SSO for people, a workspace-created app service principal for AppKit resource access, and the workspace deployment user for Job/Pipeline `run_as`. A personal access token must never be sent to the browser, committed to this repository, or placed in `app.yaml`.

The checked `dataone-current` profile uses OAuth. This is the preferred local and deployment authentication method:

```bash
databricks auth login \
  --host https://dbc-1670f1c2-1198.cloud.databricks.com \
  --profile dataone-current
```

If a local developer is required to use a PAT, configure it through the CLI prompt so the token is not stored in source code:

```bash
databricks configure --token --profile dataone-pat
databricks bundle validate --strict -t current --profile dataone-pat
```

For local AppKit development, a standard SDK environment is also supported. Put secrets only in the ignored `.env` file and never in `.env.example`:

```env
DATABRICKS_HOST=https://your-workspace.cloud.databricks.com
DATABRICKS_TOKEN=<local-only-personal-access-token>
```

This PAT option is for a developer workstation. A deployed Databricks App continues to use its managed service principal for AppKit access, while Job/Pipeline execution retains the configured workspace deployment-user `run_as` identity.

## Local verification

Node 24 is recommended. Then run:

```bash
npm install
npm run format
npm run test
npm run typecheck
npm run lint
npm run lint:ast-grep
npm run build
```

The tests validate all three file formats, path traversal rejection, mismatched extensions, and three-part Unity Catalog source names.

## Deploy

The app, Job, Pipeline, permissions, and source are managed with a Declarative Automation Bundle. Supply the existing connection names and the secret that contains the AWS PostgreSQL URL; do not put secret values on the command line:

```bash
databricks bundle validate --strict -t current --profile dataone-current
databricks bundle plan -t current --profile dataone-current
databricks bundle deploy -t current --profile dataone-current --auto-approve
```

Required installation variables are `source_connection_name`, `target_connection_name`, `state_database_secret_scope`, and `state_database_secret_key`. To enable external publication, also set `external_target_enabled=true`. PostgreSQL uses the `target_export_*` secret references; MySQL uses the `mysql_target_export_*` references. The Job `run_as` identity needs read access to the target secret scope and network reachability to the selected database.

The Job/Pipeline workspace deployment user also needs `CAN_READ` on the deployed bundle files directory. In this workspace that scoped ACL is already applied to:

```text
/Workspace/Users/karanduddekunta2715@gmail.com/.bundle/dataone-secure/current/files
```

## Public Databricks Marketplace path

The current Free Edition workspace can develop and demonstrate the app, but it cannot publish a public Marketplace listing. A public provider needs a Premium-or-higher Databricks account with Unity Catalog, approval in the Databricks Partner Program, the Marketplace admin role, and Databricks review of the third-party App package.

1. Move the bundle to the provider's Premium-or-higher workspace and replace the `default` target values with customer-portable variables.
2. Deploy and complete security, data-access, upgrade, and uninstall tests in a clean workspace.
3. Apply to the [Databricks Partner Program](https://partners.databricks.com/s/partner-application) and satisfy the [provider requirements and policies](https://docs.databricks.com/aws/en/marketplace/become-provider).
4. Work with Databricks to submit the third-party App package for security review. Do not model this as an anonymous public website: each customer installs a governed copy in their own workspace and accesses it through Databricks authentication.
5. After approval, create the public listing, attach the reviewed App asset, set terms/support documentation, test the consumer installation, and request publication.

Third-party Marketplace Apps are documented in the [Databricks Marketplace consumer guide](https://docs.databricks.com/aws/en/marketplace/get-started-consumer#get-access-to-third-party-apps). Free Edition restrictions are listed in the [Free Edition limitations](https://docs.databricks.com/aws/en/getting-started/free-edition-limitations).

## Important scope notes

- The schema recommendations are deterministic heuristics. They are not presented as model-generated AI suggestions.
- The local risk forecast is a transparent weighted heuristic, not a trained model, probability, or live Model Serving result.
- The local database path remains a simulation. Production uses administrator-managed Unity Catalog connections/foreign catalogs for read access. Lakehouse Federation is read-only, so PostgreSQL write-back is a separate, optional governed Job task.
- The topology view is derived from this application's run inventory and processing stages. Native Unity Catalog system lineage is not yet wired into the UI.
- AskData uses the dedicated `DataOne AskData` Genie Agent with governed table descriptions, sample questions, example SQL, joins, and benchmark queries. The UI displays generated SQL and returned data so users can verify answers.
- The current app ACL is owner/admin only. Do not grant workspace-wide `CAN_USE` until per-user run ownership, upload isolation, and rate limits are implemented.
