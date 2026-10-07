import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool, type PoolConfig, type QueryResultRow } from 'pg';
import { z } from 'zod';

const awsRdsCa = readFileSync(new URL('../config/certs/aws-rds-eu-north-1-bundle.pem', import.meta.url), 'utf8');

const identifier = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9_$#.-]+$/);

export const connectionProfileInput = z
  .object({
    alias: z
      .string()
      .trim()
      .min(3)
      .max(128)
      .regex(/^[A-Za-z0-9_.-]+$/),
    role: z.enum(['source', 'target']),
    engine: z.enum(['mysql', 'postgresql', 'oracle', 'sqlserver', 'databricks', 'generic']),
    connectionName: identifier,
    foreignCatalog: identifier.nullable().optional(),
    defaultSchema: identifier.nullable().optional(),
    publicationMode: z.enum(['federated-read', 'unity-catalog', 'jdbc-export']),
  })
  .strict();

export const projectInput = z
  .object({
    projectName: z.string().trim().min(3).max(120),
    sourceMode: z.enum(['volume_file', 'uc_table']),
    sourceIdentifier: z.string().trim().min(1).max(500),
    outputTable: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{0,119}$/),
    sourceConnectionAlias: z.string().trim().min(3).max(128).nullable().optional(),
    targetConnectionAlias: z.string().trim().min(3).max(128).nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.sourceMode === 'uc_table' &&
      !/^[A-Za-z0-9_$#.-]+\.[A-Za-z0-9_$#.-]+\.[A-Za-z0-9_$#.-]+$/.test(value.sourceIdentifier)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['sourceIdentifier'],
        message: 'A Unity Catalog source must use catalog.schema.table.',
      });
    }
    if (value.sourceMode === 'uc_table') {
      const sourceCatalog = process.env.DATAONE_SOURCE_FOREIGN_CATALOG?.trim();
      const sourceSchema = process.env.DATAONE_SOURCE_DEFAULT_SCHEMA?.trim();
      const [requestedCatalog] = value.sourceIdentifier.split('.');
      const hasConfiguredBoundary = Boolean(sourceCatalog && sourceSchema);
      const isConfiguredSource =
        hasConfiguredBoundary && value.sourceIdentifier.startsWith(`${sourceCatalog}.${sourceSchema}.`);
      const isOnboardedMysqlSource = /^dataone_mysql_[a-z0-9_]+_[a-f0-9]{10}$/.test(requestedCatalog ?? '');
      if (hasConfiguredBoundary && !isConfiguredSource && !isOnboardedMysqlSource) {
        context.addIssue({
          code: 'custom',
          path: ['sourceIdentifier'],
          message: 'The project source must belong to a configured or DataOne-onboarded AWS MySQL foreign catalog.',
        });
      }
    }
    if (value.sourceMode === 'volume_file') {
      const match = /^(csv|json|parquet)\/[A-Za-z0-9._/-]+\.(csv|json|parquet)$/i.exec(value.sourceIdentifier);
      if (!match || match[1]?.toLowerCase() !== match[2]?.toLowerCase() || value.sourceIdentifier.includes('..')) {
        context.addIssue({
          code: 'custom',
          path: ['sourceIdentifier'],
          message: 'A file source must stay inside its matching CSV, JSON, Parquet, or SQLite landing folder.',
        });
      }
    }
  });

export const runInput = z
  .object({
    projectId: z.string().uuid(),
    workflowRunId: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/),
    databricksRunId: z.number().int().positive(),
  })
  .strict();

export interface RequestIdentity {
  userId: string;
  email: string | null;
}

export interface ConnectionProfile extends z.infer<typeof connectionProfileInput> {
  createdAt: string;
  updatedAt: string;
}

export interface SavedProject {
  id: string;
  projectName: string;
  sourceMode: 'volume_file' | 'uc_table';
  sourceIdentifier: string;
  outputTable: string;
  sourceConnectionAlias: string | null;
  targetConnectionAlias: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ConnectionProfileRow extends QueryResultRow {
  connection_alias: unknown;
  connection_role: unknown;
  engine: unknown;
  connection_name: unknown;
  foreign_catalog: unknown;
  default_schema: unknown;
  publication_mode: unknown;
  created_at: unknown;
  updated_at: unknown;
}

interface SavedProjectRow extends QueryResultRow {
  id: unknown;
  project_name: unknown;
  source_mode: unknown;
  source_identifier: unknown;
  output_table: unknown;
  source_connection_alias: unknown;
  target_connection_alias: unknown;
  created_at: unknown;
  updated_at: unknown;
}

function rowText(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`AWS PostgreSQL returned an invalid ${field}.`);
  return value;
}

function nullableRowText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new Error('AWS PostgreSQL returned an invalid nullable string.');
  return value;
}

export class OperationalStore {
  constructor(
    private readonly pool: Pool,
    private readonly workspaceHost: string
  ) {}

  async initialize(): Promise<void> {
    await this.pool.query('SELECT 1');
    await this.pool.query('CREATE SCHEMA IF NOT EXISTS dataone_app');
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS dataone_app.connection_profiles (
        workspace_host TEXT NOT NULL,
        connection_alias TEXT NOT NULL,
        connection_role TEXT NOT NULL CHECK (connection_role IN ('source', 'target')),
        engine TEXT NOT NULL,
        connection_name TEXT NOT NULL,
        foreign_catalog TEXT,
        default_schema TEXT,
        publication_mode TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (workspace_host, connection_alias, connection_role)
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS dataone_app.projects (
        id UUID PRIMARY KEY,
        workspace_host TEXT NOT NULL,
        owner_user_id TEXT NOT NULL,
        owner_email TEXT,
        project_name TEXT NOT NULL,
        source_mode TEXT NOT NULL CHECK (source_mode IN ('volume_file', 'uc_table')),
        source_identifier TEXT NOT NULL,
        output_table TEXT NOT NULL,
        source_connection_alias TEXT,
        target_connection_alias TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (workspace_host, owner_user_id, project_name)
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS dataone_app.workflow_runs (
        workflow_run_id TEXT PRIMARY KEY,
        project_id UUID NOT NULL REFERENCES dataone_app.projects(id),
        databricks_run_id BIGINT NOT NULL,
        status TEXT NOT NULL DEFAULT 'SUBMITTED',
        submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  }

  async health(): Promise<{ storage: 'aws-postgresql'; workspaceHost: string }> {
    await this.pool.query('SELECT 1');
    return { storage: 'aws-postgresql', workspaceHost: this.workspaceHost };
  }

  async upsertConnectionProfile(input: z.infer<typeof connectionProfileInput>): Promise<void> {
    const profile = connectionProfileInput.parse(input);
    await this.pool.query(
      `
        INSERT INTO dataone_app.connection_profiles (
          workspace_host, connection_alias, connection_role, engine,
          connection_name, foreign_catalog, default_schema, publication_mode
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (workspace_host, connection_alias, connection_role)
        DO UPDATE SET
          engine = EXCLUDED.engine,
          connection_name = EXCLUDED.connection_name,
          foreign_catalog = EXCLUDED.foreign_catalog,
          default_schema = EXCLUDED.default_schema,
          publication_mode = EXCLUDED.publication_mode,
          updated_at = now()
      `,
      [
        this.workspaceHost,
        profile.alias,
        profile.role,
        profile.engine,
        profile.connectionName,
        profile.foreignCatalog ?? null,
        profile.defaultSchema ?? null,
        profile.publicationMode,
      ]
    );
  }

  async listConnectionProfiles(): Promise<ConnectionProfile[]> {
    const result = await this.pool.query<ConnectionProfileRow>(
      `
      SELECT connection_alias, connection_role, engine, connection_name,
             foreign_catalog, default_schema, publication_mode,
             created_at::text, updated_at::text
      FROM dataone_app.connection_profiles
      WHERE workspace_host = $1
      ORDER BY connection_role, connection_alias
    `,
      [this.workspaceHost]
    );

    return result.rows.map((row) => ({
      alias: rowText(row.connection_alias, 'connection alias'),
      role: connectionProfileInput.shape.role.parse(row.connection_role),
      engine: connectionProfileInput.shape.engine.parse(row.engine),
      connectionName: rowText(row.connection_name, 'connection name'),
      foreignCatalog: nullableRowText(row.foreign_catalog),
      defaultSchema: nullableRowText(row.default_schema),
      publicationMode: connectionProfileInput.shape.publicationMode.parse(row.publication_mode),
      createdAt: rowText(row.created_at, 'created timestamp'),
      updatedAt: rowText(row.updated_at, 'updated timestamp'),
    }));
  }

  async saveProject(input: z.infer<typeof projectInput>, identity: RequestIdentity): Promise<SavedProject> {
    const project = projectInput.parse(input);
    const id = randomUUID();
    const result = await this.pool.query<SavedProjectRow>(
      `
        INSERT INTO dataone_app.projects (
          id, workspace_host, owner_user_id, owner_email, project_name,
          source_mode, source_identifier, output_table, source_connection_alias, target_connection_alias
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (workspace_host, owner_user_id, project_name)
        DO UPDATE SET
          owner_email = EXCLUDED.owner_email,
          source_mode = EXCLUDED.source_mode,
          source_identifier = EXCLUDED.source_identifier,
          output_table = EXCLUDED.output_table,
          source_connection_alias = EXCLUDED.source_connection_alias,
          target_connection_alias = EXCLUDED.target_connection_alias,
          updated_at = now()
        RETURNING id::text, project_name, source_mode, source_identifier, output_table,
                  source_connection_alias, target_connection_alias,
                  created_at::text, updated_at::text
      `,
      [
        id,
        this.workspaceHost,
        identity.userId,
        identity.email,
        project.projectName,
        project.sourceMode,
        project.sourceIdentifier,
        project.outputTable,
        project.sourceConnectionAlias ?? null,
        project.targetConnectionAlias ?? null,
      ]
    );
    const row = result.rows[0];
    if (!row) throw new Error('AWS PostgreSQL did not return the saved DataOne project.');
    return {
      id: rowText(row.id, 'project ID'),
      projectName: rowText(row.project_name, 'project name'),
      sourceMode: projectInput.shape.sourceMode.parse(row.source_mode),
      sourceIdentifier: rowText(row.source_identifier, 'source identifier'),
      outputTable: rowText(row.output_table, 'output table'),
      sourceConnectionAlias: nullableRowText(row.source_connection_alias),
      targetConnectionAlias: nullableRowText(row.target_connection_alias),
      createdAt: rowText(row.created_at, 'project created timestamp'),
      updatedAt: rowText(row.updated_at, 'project updated timestamp'),
    };
  }

  async recordRun(input: z.infer<typeof runInput>, identity: RequestIdentity): Promise<void> {
    const run = runInput.parse(input);
    const result = await this.pool.query(
      `
        INSERT INTO dataone_app.workflow_runs (workflow_run_id, project_id, databricks_run_id)
        SELECT $1, id, $3
        FROM dataone_app.projects
        WHERE id = $2 AND workspace_host = $4 AND owner_user_id = $5
        ON CONFLICT (workflow_run_id)
        DO UPDATE SET databricks_run_id = EXCLUDED.databricks_run_id, status = 'SUBMITTED'
      `,
      [run.workflowRunId, run.projectId, run.databricksRunId, this.workspaceHost, identity.userId]
    );
    if (result.rowCount !== 1) throw new Error('The DataOne project does not belong to the signed-in user.');
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

function poolConfig(connectionString: string): PoolConfig {
  const databaseUrl = new URL(connectionString);
  for (const tlsParameter of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey']) {
    databaseUrl.searchParams.delete(tlsParameter);
  }

  return {
    connectionString: databaseUrl.toString(),
    // [AWS-RDS-TLS] Databricks Apps do not include the regional RDS CA by
    // default. Verify the server certificate with AWS's eu-north-1 trust
    // bundle instead of disabling TLS verification.
    ssl: {
      ca: awsRdsCa,
      rejectUnauthorized: true,
    },
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: 'veltirs-dataone',
  };
}

export async function createOperationalStoreFromEnv(): Promise<OperationalStore | null> {
  const connectionString = process.env.DATAONE_DATABASE_URL?.trim();
  if (!connectionString) {
    if (process.env.NODE_ENV === 'production' && process.env.DATAONE_REQUIRE_OPERATIONAL_STORE !== 'false') {
      throw new Error(
        'DATAONE_DATABASE_URL is required in production. Bind the AWS PostgreSQL URL through a Databricks secret resource.'
      );
    }
    return null;
  }

  const workspaceHost = process.env.DATABRICKS_HOST?.trim() || 'local-development';
  const store = new OperationalStore(new Pool(poolConfig(connectionString)), workspaceHost);
  await store.initialize();
  return store;
}
