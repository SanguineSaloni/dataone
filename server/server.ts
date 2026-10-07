import { createApp, analytics, files, genie, getExecutionContext, jobs, server } from '@databricks/appkit';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { handleWhoAmI, resolveRequestIdentity } from './databricksIdentity.js';
import { createForwardedUserWorkspaceClient, DatabricksUserAuthorizationError } from './databricksUserClient.js';
import {
  awsMysqlCsvImportInput,
  externalErrorCode,
  importMissingValuesCsv,
  isConfiguredConnectionAdmin,
  isNotFoundError,
} from './awsMysql.js';
import {
  federatedCatalogOptions,
  federatedConnectionOptions,
  federatedSourceInput,
  federatedSourceNamespace,
  federatedSourceProvider,
  governedFederatedSourceNames,
  matchesExistingFederatedConnection,
  unityCatalogConnectionType,
} from './federatedSource.js';
import { jobParameters, MAX_UPLOAD_SIZE, uploadPolicy } from './dataoneValidation.js';
import { connectionProfileInput, createOperationalStoreFromEnv, projectInput, runInput } from './operationalStore.js';

const askDataRequest = z
  .object({
    content: z.string().trim().min(1).max(4_000),
    conversationId: z.string().trim().min(1).optional(),
  })
  .strict();

const ucIdentifier = z.string().regex(/^[A-Za-z_][A-Za-z0-9_$-]*$/);

type ConfiguredFederatedEngine = 'mysql' | 'postgresql';

function configuredFederatedSource(engine: ConfiguredFederatedEngine): {
  catalog: string;
  connectionName: string;
  schema: string;
} {
  const isMysql = engine === 'mysql';
  return {
    catalog: ucIdentifier.parse(
      isMysql ? process.env.DATAONE_SOURCE_FOREIGN_CATALOG : process.env.DATAONE_TARGET_FOREIGN_CATALOG
    ),
    connectionName: ucIdentifier.parse(
      isMysql ? process.env.DATABRICKS_SOURCE_CONNECTION : process.env.DATABRICKS_TARGET_CONNECTION
    ),
    schema: ucIdentifier.parse(
      isMysql ? process.env.DATAONE_SOURCE_DEFAULT_SCHEMA : process.env.DATAONE_TARGET_DEFAULT_SCHEMA
    ),
  };
}

function quoteUcIdentifier(identifier: string): string {
  return `\`${identifier.replace(/`/g, '``')}\``;
}

interface FederatedTableSummary {
  catalog: string;
  schema: string;
  name: string;
  type: 'TABLE' | 'VIEW';
  columnCount: number;
}

async function listFederatedSourceTables(
  workspace: ReturnType<typeof createForwardedUserWorkspaceClient>,
  catalogName: string,
  engine: 'mysql' | 'postgresql' | 'oracle',
  namespace: string
): Promise<FederatedTableSummary[]> {
  const tables: FederatedTableSummary[] = [];
  const ignoredSchemas = new Set(['information_schema', 'pg_catalog', 'sys', 'system']);

  for await (const schema of workspace.schemas.list({ catalog_name: catalogName, max_results: 0 })) {
    if (!schema.name || ignoredSchemas.has(schema.name.toLowerCase())) continue;
    if (engine === 'mysql' && schema.name.toLowerCase() !== namespace.toLowerCase()) continue;

    for await (const table of workspace.tables.list({
      catalog_name: catalogName,
      schema_name: schema.name,
      max_results: 0,
      omit_columns: false,
      omit_properties: true,
      omit_username: true,
    })) {
      if (!table.name) continue;
      tables.push({
        catalog: catalogName,
        schema: schema.name,
        name: table.name,
        type: table.table_type === 'VIEW' ? 'VIEW' : 'TABLE',
        columnCount: table.columns?.length ?? 0,
      });
      if (tables.length >= 500) return tables;
    }
  }

  return tables.sort((left, right) => `${left.schema}.${left.name}`.localeCompare(`${right.schema}.${right.name}`));
}

async function listConfiguredFederatedSourceTables(
  workspace: ReturnType<typeof getExecutionContext>['client'],
  catalogName: string,
  namespace: string
): Promise<FederatedTableSummary[]> {
  const warehouseId = process.env.DATABRICKS_WAREHOUSE_ID?.trim();
  if (!warehouseId) throw new Error('The DataOne SQL warehouse resource binding is unavailable.');
  const namespaceLiteral = namespace.replace(/'/g, "''");
  const metadata = await workspace.statementExecution.executeStatement({
    warehouse_id: warehouseId,
    statement: `
      SELECT t.table_schema, t.table_name, t.table_type, COUNT(c.column_name) AS column_count
      FROM ${quoteUcIdentifier(catalogName)}.information_schema.tables AS t
      LEFT JOIN ${quoteUcIdentifier(catalogName)}.information_schema.columns AS c
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE t.table_schema = '${namespaceLiteral}'
      GROUP BY t.table_schema, t.table_name, t.table_type
      ORDER BY t.table_name
      LIMIT 500
    `,
    wait_timeout: '50s',
    on_wait_timeout: 'CANCEL',
  });
  if (metadata.status?.state !== 'SUCCEEDED') {
    const detail = metadata.status?.error?.message ?? metadata.status?.state ?? 'UNKNOWN';
    throw new Error(`Federated table discovery did not succeed: ${detail}`);
  }

  return (metadata.result?.data_array ?? []).flatMap((row) => {
    const [schema, name, tableType, columnCount] = row;
    if (typeof schema !== 'string' || typeof name !== 'string') return [];
    return [
      {
        catalog: catalogName,
        schema,
        name,
        type: tableType === 'VIEW' ? ('VIEW' as const) : ('TABLE' as const),
        columnCount: Number(columnCount ?? 0),
      },
    ];
  });
}

async function refreshForeignCatalogMetadata(
  workspace: ReturnType<typeof createForwardedUserWorkspaceClient>,
  catalogName: string
): Promise<void> {
  const warehouseId = process.env.DATABRICKS_WAREHOUSE_ID?.trim();
  if (!warehouseId) throw new Error('The DataOne SQL warehouse resource binding is unavailable.');

  const refresh = await workspace.statementExecution.executeStatement({
    warehouse_id: warehouseId,
    statement: `REFRESH FOREIGN CATALOG ${quoteUcIdentifier(catalogName)}`,
    wait_timeout: '50s',
    on_wait_timeout: 'CANCEL',
  });
  if (refresh.status?.state !== 'SUCCEEDED') {
    const detail = refresh.status?.error?.message ?? refresh.status?.state ?? 'UNKNOWN';
    throw new Error(`REFRESH FOREIGN CATALOG did not succeed: ${detail}`);
  }
}

async function refreshConfiguredFederatedForeignSchema(
  engine: ConfiguredFederatedEngine
): Promise<{ catalog: string; connectionName: string; schema: string }> {
  const source = configuredFederatedSource(engine);
  const context = getExecutionContext();
  const warehouseId = context.warehouseId ? await context.warehouseId : undefined;
  if (!warehouseId) throw new Error('The DataOne SQL warehouse resource binding is unavailable.');

  const refresh = await context.client.statementExecution.executeStatement({
    warehouse_id: warehouseId,
    statement: `REFRESH FOREIGN SCHEMA ${quoteUcIdentifier(source.catalog)}.${quoteUcIdentifier(source.schema)}`,
    wait_timeout: '50s',
    on_wait_timeout: 'CANCEL',
  });
  if (refresh.status?.state !== 'SUCCEEDED') {
    const detail = refresh.status?.error?.message ?? refresh.status?.state ?? 'UNKNOWN';
    throw new Error(`REFRESH FOREIGN SCHEMA did not succeed: ${detail}`);
  }
  return source;
}

async function configuredFederatedSourceResult(engine: ConfiguredFederatedEngine) {
  const source = await refreshConfiguredFederatedForeignSchema(engine);
  const context = getExecutionContext();
  const tables = await listConfiguredFederatedSourceTables(context.client, source.catalog, source.schema);
  return {
    connected: true as const,
    engine,
    provider: engine === 'mysql' ? 'AWS RDS MySQL' : 'AWS RDS PostgreSQL',
    namespace: source.schema,
    connectionName: source.connectionName,
    catalogName: source.catalog,
    tables,
    refreshedAt: new Date().toISOString(),
  };
}

const operationalStore = await createOperationalStoreFromEnv();

if (operationalStore) {
  const sourceConnectionName = process.env.DATABRICKS_SOURCE_CONNECTION?.trim();
  const targetConnectionName = process.env.DATABRICKS_TARGET_CONNECTION?.trim();
  if (sourceConnectionName) {
    await operationalStore.upsertConnectionProfile(
      connectionProfileInput.parse({
        alias: 'federated-source',
        role: 'source',
        engine: process.env.DATAONE_SOURCE_ENGINE?.trim() || 'generic',
        connectionName: sourceConnectionName,
        foreignCatalog: process.env.DATAONE_SOURCE_FOREIGN_CATALOG?.trim() || null,
        defaultSchema: process.env.DATAONE_SOURCE_DEFAULT_SCHEMA?.trim() || null,
        publicationMode: 'federated-read',
      })
    );
  }
  if (targetConnectionName) {
    await operationalStore.upsertConnectionProfile(
      connectionProfileInput.parse({
        alias: 'external-target',
        role: 'target',
        engine: process.env.DATAONE_TARGET_ENGINE?.trim() || 'postgresql',
        connectionName: targetConnectionName,
        foreignCatalog: null,
        defaultSchema: process.env.DATAONE_TARGET_DEFAULT_SCHEMA?.trim() || 'public',
        publicationMode: 'jdbc-export',
      })
    );
  }
}

// [DBX-APPKIT] AppKit owns Databricks authentication, retry/timeout behavior,
// and the generated HTTP routes used by the React client below.
await createApp({
  plugins: [
    // [DBX-ANALYTICS] Executes config/queries/*.sql on the bound SQL Warehouse.
    // The results workspace starts several run-scoped queries together. A
    // serverless SQL warehouse can need more than the default plugin timeout
    // to warm up, so keep the request alive long enough to return the real
    // query result instead of leaving the React query boundary loading.
    analytics({ timeout: 120_000 }),
    // [DBX-VOLUME] Exposes the resource-bound Unity Catalog Volume as the
    // server-known alias "files". Browser requests never contain a volume ID.
    files({
      maxUploadSize: MAX_UPLOAD_SIZE,
      volumes: {
        files: {
          auth: 'service-principal',
          maxUploadSize: MAX_UPLOAD_SIZE,
          policy: uploadPolicy,
        },
      },
    }),
    // [DBX-JOB] Exposes only the bound orchestrator Job. Strict Zod validation
    // prevents the browser from choosing another Job or injecting parameters.
    jobs({
      jobs: {
        default: {
          params: z.object({ job_parameters: jobParameters }).strict(),
        },
      },
    }),
    // [DBX-GENIE] Resolves the bound Genie Agent from app.yaml and streams the
    // Conversation API through the backend's app service-principal identity.
    genie({
      spaces: {
        default: process.env.DATABRICKS_GENIE_SPACE_ID,
      },
    }),
    server(),
  ],
  onPluginsReady(appkit) {
    appkit.server.extend((app) => {
      app.get('/api/ops/health', async (_request, response) => {
        if (!operationalStore) {
          response.status(503).json({
            error: 'AWS PostgreSQL operational storage is not configured in this local environment.',
          });
          return;
        }
        try {
          response.json(await operationalStore.health());
        } catch (error) {
          console.error('AWS PostgreSQL health check failed:', error);
          response.status(503).json({ error: 'AWS PostgreSQL operational storage is unavailable.' });
        }
      });

      app.get('/api/ops/connections', async (_request, response) => {
        if (!operationalStore) {
          response.status(503).json({ error: 'AWS PostgreSQL operational storage is not configured.' });
          return;
        }
        try {
          response.json({ connections: await operationalStore.listConnectionProfiles() });
        } catch (error) {
          console.error('Unable to list DataOne connection profiles:', error);
          response.status(500).json({ error: 'Unable to list DataOne connection profiles.' });
        }
      });

      app.post('/api/source/mysql/refresh', async (request, response) => {
        const identity = resolveRequestIdentity(request);
        if (!identity) {
          response.status(401).json({ error: 'Databricks user identity is required.' });
          return;
        }

        try {
          // [DBX-LAKEHOUSE-FEDERATION] Refreshes only the configured AWS MySQL
          // foreign schema. Credentials remain in the Unity Catalog connection.
          response.json(await configuredFederatedSourceResult('mysql'));
        } catch (error) {
          console.error(`Unable to refresh AWS MySQL datasets for ${identity.userId}:`, error);
          response.status(502).json({ error: 'Unable to refresh the AWS MySQL dataset list through Unity Catalog.' });
        }
      });

      app.post('/api/source/postgresql/refresh', async (request, response) => {
        const identity = resolveRequestIdentity(request);
        if (!identity) {
          response.status(401).json({ error: 'Databricks user identity is required.' });
          return;
        }

        try {
          // [DBX-CONFIGURED-POSTGRES-FEDERATION] Uses the installed PostgreSQL
          // connection and foreign catalog exactly like the configured MySQL
          // source. No database password is sent back to the browser.
          response.json(await configuredFederatedSourceResult('postgresql'));
        } catch (error) {
          const code = externalErrorCode(error);
          console.error(`Unable to refresh AWS PostgreSQL datasets for ${identity.userId}; code=${code}`, error);
          response.status(502).json({
            error: 'Unable to refresh the AWS PostgreSQL dataset list through Unity Catalog.',
            code,
          });
        }
      });

      app.post('/api/source/onboard', async (request, response) => {
        const identity = resolveRequestIdentity(request);
        if (!identity) {
          response.status(401).json({ error: 'Databricks user identity is required.' });
          return;
        }
        if (!identity.email || !isConfiguredConnectionAdmin(identity.email)) {
          response.status(403).json({
            error: 'Only a configured DataOne connection administrator can add an AWS database source.',
          });
          return;
        }

        const parsed = federatedSourceInput.safeParse(request.body);
        if (!parsed.success) {
          response.status(400).json({
            error: 'The AWS database connection details are invalid.',
            issues: parsed.error.issues.map((issue) => issue.message),
          });
          return;
        }

        const source = parsed.data;
        const names = governedFederatedSourceNames(source);
        const connectionType = unityCatalogConnectionType(source);
        const namespace = federatedSourceNamespace(source);
        try {
          const configuredEngine: ConfiguredFederatedEngine | null =
            source.engine === 'mysql' || source.engine === 'postgresql' ? source.engine : null;
          const configuredSource = configuredEngine ? configuredFederatedSource(configuredEngine) : null;

          // [DBX-CONFIGURED-FEDERATION] When the submitted MySQL or PostgreSQL
          // details point to a source already installed with this DataOne app,
          // reuse the bound Unity Catalog connection. Re-running administrator
          // onboarding is unnecessary and can fail when the forwarded user token
          // lacks catalog-administration privileges. The password remains stored
          // in Unity Catalog and is never read back by the application.
          if (
            configuredEngine !== null &&
            configuredSource !== null &&
            configuredSource.connectionName === names.connectionName &&
            configuredSource.catalog === names.catalogName &&
            (source.engine === 'postgresql' || configuredSource.schema === namespace)
          ) {
            response.status(200).json(await configuredFederatedSourceResult(configuredEngine));
            return;
          }

          // [DBX-USER-AUTHORIZATION] Creating a connection and a foreign
          // catalog is an administrator action. Use the signed-in admin's
          // forwarded OAuth token with the narrow catalog.connections and
          // catalog.catalogs scopes instead of elevating the app service
          // principal beyond its installation-bound USE_CONNECTION grant.
          const workspace = createForwardedUserWorkspaceClient(request);
          const options = federatedConnectionOptions(source);

          let connectionExists = false;
          try {
            const connection = await workspace.connections.get({ name: names.connectionName });
            if (
              !matchesExistingFederatedConnection(source, {
                connectionType: connection.connection_type,
                options: connection.options,
              })
            ) {
              response.status(409).json({
                error: 'The generated Unity Catalog connection name is already used by a different source.',
              });
              return;
            }
            connectionExists = true;
          } catch (error) {
            if (!isNotFoundError(error)) throw error;
          }

          // [DBX-UC-CONNECTION] Unity Catalog encrypts the connection password.
          // Reuse a healthy existing connection instead of overwriting its
          // credentials every time the user refreshes the dataset list.
          if (!connectionExists) {
            await workspace.connections.create({
              name: names.connectionName,
              connection_type: connectionType,
              options,
              read_only: true,
              comment: `DataOne ${federatedSourceProvider(source)} source for ${namespace}`,
            });
          }

          let catalogExists = false;
          try {
            const catalog = await workspace.catalogs.get({ name: names.catalogName });
            if (catalog.connection_name !== names.connectionName) {
              response.status(409).json({
                error: 'The generated foreign catalog name is already used by a different connection.',
              });
              return;
            }
            catalogExists = true;
          } catch (error) {
            if (!isNotFoundError(error)) throw error;
          }

          // [DBX-LAKEHOUSE-FEDERATION] The external namespace is represented
          // by a foreign catalog. Spark reads only a governed three-part Unity
          // Catalog table name; raw database credentials never enter the Job.
          if (!catalogExists) {
            await workspace.catalogs.create({
              name: names.catalogName,
              connection_name: names.connectionName,
              options: federatedCatalogOptions(source),
              comment: `DataOne federated ${federatedSourceProvider(source)} catalog for ${namespace}`,
            });
          }

          // [DBX-FEDERATION-REFRESH] Tables created directly in RDS can be
          // absent from cached Catalog Explorer metadata. Refresh the foreign
          // catalog before returning the selectable dataset list to the UI.
          await refreshForeignCatalogMetadata(workspace, names.catalogName);

          let tables: FederatedTableSummary[];
          try {
            tables = await listFederatedSourceTables(workspace, names.catalogName, source.engine, namespace);
          } catch (error) {
            if (!connectionExists) throw error;

            // The external credential may have been rotated after the Unity
            // Catalog connection was created. Update it only after the saved
            // connection fails, then retry the governed metadata read once.
            await workspace.connections.update({ name: names.connectionName, options });
            tables = await listFederatedSourceTables(workspace, names.catalogName, source.engine, namespace);
          }

          response.status(connectionExists && catalogExists ? 200 : 201).json({
            connected: true,
            engine: source.engine,
            provider: federatedSourceProvider(source),
            namespace,
            connectionName: names.connectionName,
            catalogName: names.catalogName,
            tables,
          });
        } catch (error) {
          if (error instanceof DatabricksUserAuthorizationError) {
            response.status(401).json({ error: error.message, code: 'USER_AUTHORIZATION_REQUIRED' });
            return;
          }
          const code = externalErrorCode(error);
          console.error(
            `AWS database onboarding failed for ${identity.userId}; engine=${source.engine}; code=${code}`,
            error
          );
          response.status(502).json({
            error:
              'Unable to connect or register the AWS database source. Check the endpoint, security group, credentials, encryption, and Unity Catalog administrator privileges.',
            code,
          });
        }
      });

      app.post('/api/source/mysql/import-quality-csv', async (request, response) => {
        const identity = resolveRequestIdentity(request);
        if (!identity) {
          response.status(401).json({ error: 'Databricks user identity is required.' });
          return;
        }
        if (!identity.email || !isConfiguredConnectionAdmin(identity.email)) {
          response.status(403).json({
            error: 'Only a configured DataOne connection administrator can import an AWS MySQL dataset.',
          });
          return;
        }

        const parsed = awsMysqlCsvImportInput.safeParse(request.body);
        if (!parsed.success) {
          response.status(400).json({
            error: 'The AWS MySQL CSV import request is invalid.',
            issues: parsed.error.issues.map((issue) => issue.message),
          });
          return;
        }

        try {
          const result = await importMissingValuesCsv(parsed.data);
          const source = await refreshConfiguredFederatedForeignSchema('mysql');
          response.status(201).json({
            ...result,
            sourceTable: `${source.catalog}.${source.schema}.${result.table}`,
          });
        } catch (error) {
          const code = externalErrorCode(error);
          console.error(`AWS MySQL CSV import failed for ${identity.userId}; code=${code}`);
          response.status(502).json({
            error: 'Unable to import the CSV into AWS MySQL. Check the table permission, credentials, and TLS access.',
            code,
          });
        }
      });

      app.post('/api/ops/projects', async (request, response) => {
        if (!operationalStore) {
          response.status(503).json({ error: 'AWS PostgreSQL operational storage is not configured.' });
          return;
        }
        const identity = resolveRequestIdentity(request);
        if (!identity) {
          response.status(401).json({ error: 'Databricks user identity is required.' });
          return;
        }
        const parsed = projectInput.safeParse(request.body);
        if (!parsed.success) {
          response
            .status(400)
            .json({ error: 'The DataOne project definition is invalid.', issues: parsed.error.issues });
          return;
        }
        try {
          response.status(201).json(await operationalStore.saveProject(parsed.data, identity));
        } catch (error) {
          console.error('Unable to persist the DataOne project:', error);
          response.status(500).json({ error: 'Unable to persist the DataOne project in AWS PostgreSQL.' });
        }
      });

      app.post('/api/ops/runs', async (request, response) => {
        if (!operationalStore) {
          response.status(503).json({ error: 'AWS PostgreSQL operational storage is not configured.' });
          return;
        }
        const identity = resolveRequestIdentity(request);
        if (!identity) {
          response.status(401).json({ error: 'Databricks user identity is required.' });
          return;
        }
        const parsed = runInput.safeParse(request.body);
        if (!parsed.success) {
          response.status(400).json({ error: 'The DataOne run reference is invalid.', issues: parsed.error.issues });
          return;
        }
        try {
          await operationalStore.recordRun(parsed.data, identity);
          response.status(201).json({ status: 'SUBMITTED' });
        } catch (error) {
          console.error(`Unable to persist run metadata for ${identity.userId}:`, error);
          response.status(500).json({ error: 'Unable to persist the Databricks run reference in AWS PostgreSQL.' });
        }
      });

      // [DBX-GENIE-REST] Thin SSE facade over AppKit Genie. It preserves the
      // generated SQL/result events consumed by useGenieChat in the UI.
      app.post('/api/askdata/:alias/messages', async (request, response) => {
        if (request.params.alias !== 'default') {
          response.status(404).json({ error: `Unknown AskData alias: ${request.params.alias}` });
          return;
        }

        const parsedRequest = askDataRequest.safeParse(request.body);
        if (!parsedRequest.success) {
          response.status(400).json({ error: 'AskData requires a non-empty question of at most 4,000 characters.' });
          return;
        }

        const abortController = new AbortController();
        response.on('close', () => {
          if (!response.writableEnded) abortController.abort();
        });

        response.status(200);
        response.set({
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'Content-Type': 'text/event-stream; charset=utf-8',
          'X-Accel-Buffering': 'no',
        });
        response.flushHeaders();

        try {
          const events = appkit.genie.sendMessage(
            'default',
            parsedRequest.data.content,
            parsedRequest.data.conversationId,
            { signal: abortController.signal }
          );

          for await (const event of events) {
            response.write(`id: ${randomUUID()}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown Databricks Genie error';
          console.error('AskData service-principal request failed:', error);
          response.write(
            `id: ${randomUUID()}\nevent: error\ndata: ${JSON.stringify({ type: 'error', error: message })}\n\n`
          );
        } finally {
          response.end();
        }
      });

      app.get('/api/whoami', handleWhoAmI);
    });
  },
});
