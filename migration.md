Build "DataOne" — a data migration app on Databricks (MySQL → Postgres, extensible to other DBs).

STACK
- Backend: [your choice, e.g. FastAPI/Node]
- DB: app metadata store (Postgres/SQLite) — stores pointers only, never credentials
- Frontend: [your choice]
- Compute: Databricks workspace with Unity Catalog + Jobs API

CORE PRINCIPLE
App DB stores references, not secrets. Unity Catalog stores source DB credentials
(via CONNECTION objects). Databricks Secrets stores target DB write credentials.
App DB only stores: uc_connection_name, secret_scope, secret_key, mapping specs, job/run history.

DATA MODEL (app DB)
connections(id, name, uc_connection_name, role[source|target], db_type, catalog_name, created_at)
mappings(id, source_conn_id, target_conn_id, source_table, target_table, mapping_json, key_columns, write_mode, status, version)
runs(id, mapping_id, databricks_run_id, state[queued|running|succeeded|failed], rows_read, rows_written, error, started_at, finished_at)

FLOW
1. Add connection (source or target)
   - Backend calls UC API: create CONNECTION (host/port/user/password) + foreign catalog for source.
   - For target: same CONNECTION call for discovery, but ALSO push password to a
     Databricks secret scope via Secrets API (`/api/2.0/secrets/put`), store only
     scope+key name in app DB. Never persist raw password.

2. Schema mapper
   - GET catalogs/schemas/tables/columns from UC REST API for both source and target
     connections (foreign catalogs are read-only, fine for browsing).
   - Send source + target column metadata (names, types) to LLM → suggested mapping
     (source_col, target_col, cast_type, confidence).
   - Render as editable table. User must confirm/edit before saving — never auto-apply.
   - Save confirmed mapping to `mappings.mapping_json`:
     { columns: [{source, target, cast}], key_columns: [...], write_mode }

3. Dry run
   - Run mapping transform against `LIMIT 100` from source, show preview + cast errors,
     before allowing full migration.

4. Trigger migration
   - One-off: POST /api/2.2/jobs/runs/submit → run reusable notebook
     `migration_runner`, param: mapping_id.
   - Recurring: POST /api/2.2/jobs/create once, then run-now or attach a schedule.
   - Generate short-lived run_token, store against run row, pass to notebook as param.

5. Notebook logic (single reusable notebook, not generated per table)
   - Read mapping_id param → call DataOne API (authed with run_token) to fetch mapping_json
     (or accept full JSON as param for small specs).
   - df = spark.table(source_catalog.schema.table)  # via UC foreign catalog, federation read
   - df = df.selectExpr([f"CAST({src} AS {cast}) AS {tgt}" for each column])
   - password = dbutils.secrets.get(scope, key)
   - df.write.format("postgresql")/jdbc.option(host/port/db/table/user/password).mode(write_mode).save()
     # NOTE: target write must be direct JDBC, not through UC — foreign catalogs are read-only,
     # UC will not vend write credentials for them.
   - POST status callback to DataOne API at start (state=running), and at end
     (state=succeeded/failed, rows_written, error) using run_token.

6. Status/monitoring
   - App exposes POST /migrations/{mapping_id}/status (authed by run_token) for the
     notebook to call, updating `runs` table. Frontend polls `runs` for live progress.
   - Fallback: backend can also poll GET /api/2.2/jobs/runs/get if callback fails.

7. Post-success
   - Offer "save as recurring pipeline" → promote mapping_id to a scheduled Job.

NON-FUNCTIONAL
- Idempotent writes: if key_columns present, target write should upsert/MERGE not blind append,
  so retries don't duplicate rows.
- Type mapping: don't assume 1:1 MySQL↔Postgres types (TINYINT(1)→boolean, ENUM→text,
  AUTO_INCREMENT→serial/identity, unsigned ints, DATETIME→timestamptz). Mapper UI must let
  user override the LLM's suggested cast per column.
- Secrets: raw passwords touch app backend memory only transiently when forwarding to
  Databricks Secrets API — never written to app DB, logs, or job parameters.
- Large tables: expose numPartitions/partitionColumn/fetchsize as advanced JDBC options
  in the mapping spec for tables above a row-count threshold.

Build backend endpoints, app DB schema/migrations, the Databricks notebook, and the
frontend schema-mapper + run-status views per the above.