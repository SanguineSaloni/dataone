import { Client, type ClientConfig } from 'pg';
import type { TransformedRecords } from './demoData.js';

const POSTGRES_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost']);
const INSERT_BATCH_SIZE = 250;

type JsonObject = Record<string, unknown>;
type PostgresColumnType = 'BIGINT' | 'DOUBLE PRECISION' | 'DATE' | 'BOOLEAN' | 'TEXT';

export interface LocalPostgresTargetConfig {
  engine: 'postgresql';
  host: '127.0.0.1';
  port: number;
  database: string;
  schema: string;
  table: string;
  user: string;
  password: string;
  ssl: false;
}

export interface LocalPostgresConnectionSummary {
  connected: true;
  database: string;
  schema: string;
  table: string;
  tableExists: boolean;
  rowCount: number;
  columns: string[];
}

export interface LocalPostgresPublishResult extends LocalPostgresConnectionSummary {
  replacedExistingTable: boolean;
  columnTypes: Record<string, PostgresColumnType>;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') throw new Error(`${field} must be a string.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new Error(`${field} must contain 1–${maxLength} characters.`);
  }
  return normalized;
}

function postgresIdentifier(value: unknown, field: string): string {
  const normalized = requiredString(value, field, 63);
  if (!POSTGRES_IDENTIFIER.test(normalized)) {
    throw new Error(
      `${field} must start with a letter or underscore and contain only letters, numbers, or underscores.`
    );
  }
  return normalized;
}

/**
 * Parses the local-demo target contract. Loopback-only networking prevents the
 * demo API from becoming a credentialed proxy to arbitrary PostgreSQL servers.
 */
export function parseLocalPostgresTarget(value: unknown): LocalPostgresTargetConfig {
  if (!isObject(value)) throw new Error('targetDatabase must be an object.');
  const allowedKeys = new Set(['engine', 'host', 'port', 'database', 'schema', 'table', 'user', 'password', 'ssl']);
  const unexpectedKeys = Object.keys(value).filter((key) => !allowedKeys.has(key));
  if (unexpectedKeys.length > 0) {
    throw new Error(`targetDatabase contains unsupported fields: ${unexpectedKeys.join(', ')}.`);
  }
  if (value.engine !== 'postgresql') {
    throw new Error('The live local demo currently supports only a PostgreSQL target.');
  }

  const requestedHost = requiredString(value.host, 'host', 253).toLowerCase();
  if (!LOOPBACK_HOSTS.has(requestedHost)) {
    throw new Error('The local demo permits only localhost or 127.0.0.1 as the PostgreSQL host.');
  }

  const port = typeof value.port === 'number' ? value.port : Number(value.port);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('port must be an integer from 1 through 65535.');
  }
  if (value.ssl !== false) throw new Error('Disable SSL/TLS for this loopback-only local demo connection.');

  return {
    engine: 'postgresql',
    host: '127.0.0.1',
    port,
    database: postgresIdentifier(value.database, 'database'),
    schema: postgresIdentifier(value.schema, 'schema'),
    table: postgresIdentifier(value.table, 'table'),
    user: requiredString(value.user, 'user', 128),
    password: typeof value.password === 'string' && value.password.length <= 512 ? value.password : '',
    ssl: false,
  };
}

function quoteIdentifier(value: string): string {
  if (!POSTGRES_IDENTIFIER.test(value)) throw new Error('Unsafe PostgreSQL identifier.');
  return `"${value}"`;
}

function qualifiedTable(config: LocalPostgresTargetConfig): string {
  return `${quoteIdentifier(config.schema)}.${quoteIdentifier(config.table)}`;
}

function connectionOptions(config: LocalPostgresTargetConfig): ClientConfig {
  return {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password || undefined,
    ssl: false,
    connectionTimeoutMillis: 4_000,
    query_timeout: 30_000,
    statement_timeout: 30_000,
    application_name: 'veltirs-dataone-local-demo',
  };
}

function countFromValue(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error('PostgreSQL returned an invalid row count.');
  return parsed;
}

function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day;
}

function inferColumnType(values: Array<string | null>): PostgresColumnType {
  const present = values.filter((value): value is string => value !== null && value !== '');
  if (present.length === 0) return 'TEXT';
  if (present.every((value) => /^[+-]?\d+$/.test(value))) return 'BIGINT';
  if (present.every((value) => Number.isFinite(Number(value)))) return 'DOUBLE PRECISION';
  if (present.every(isValidIsoDate)) return 'DATE';
  if (present.every((value) => /^(true|false)$/i.test(value))) return 'BOOLEAN';
  return 'TEXT';
}

async function tableMetadata(
  client: Client,
  config: LocalPostgresTargetConfig
): Promise<{ tableExists: boolean; rowCount: number; columns: string[] }> {
  const existence = await client.query<{ relation_name: string | null }>('SELECT to_regclass($1) AS relation_name', [
    `${config.schema}.${config.table}`,
  ]);
  const tableExists = existence.rows[0]?.relation_name !== null;
  if (!tableExists) return { tableExists: false, rowCount: 0, columns: [] };

  const count = await client.query<{ row_count: string }>(
    `SELECT COUNT(*) AS row_count FROM ${qualifiedTable(config)}`
  );
  const columnResult = await client.query<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position`,
    [config.schema, config.table]
  );
  return {
    tableExists: true,
    rowCount: countFromValue(count.rows[0]?.row_count),
    columns: columnResult.rows.map((row) => row.column_name),
  };
}

export function localPostgresTargetLabel(config: LocalPostgresTargetConfig): string {
  return `PostgreSQL · ${config.host}:${config.port}/${config.database} · ${config.schema}.${config.table}`;
}

export async function testLocalPostgresConnection(
  config: LocalPostgresTargetConfig
): Promise<LocalPostgresConnectionSummary> {
  const client = new Client(connectionOptions(config));
  await client.connect();
  try {
    const metadata = await tableMetadata(client, config);
    return {
      connected: true,
      database: config.database,
      schema: config.schema,
      table: config.table,
      ...metadata,
    };
  } finally {
    await client.end();
  }
}

export async function publishLocalPostgresTable(
  config: LocalPostgresTargetConfig,
  records: TransformedRecords
): Promise<LocalPostgresPublishResult> {
  if (records.headers.length === 0 || records.rows.length === 0) {
    throw new Error('PostgreSQL publication requires at least one column and one transformed row.');
  }
  records.headers.forEach((header) => postgresIdentifier(header, 'transformed column'));
  if (new Set(records.headers).size !== records.headers.length) {
    throw new Error('PostgreSQL publication requires unique transformed column names.');
  }

  const columnTypes = Object.fromEntries(
    records.headers.map((header) => [header, inferColumnType(records.rows.map((row) => row[header] ?? null))])
  ) as Record<string, PostgresColumnType>;
  const client = new Client(connectionOptions(config));
  await client.connect();
  let transactionStarted = false;
  try {
    const before = await tableMetadata(client, config);
    await client.query('BEGIN');
    transactionStarted = true;
    await client.query(`DROP TABLE IF EXISTS ${qualifiedTable(config)}`);
    const definitions = records.headers.map((header) => `${quoteIdentifier(header)} ${columnTypes[header]}`).join(', ');
    await client.query(`CREATE TABLE ${qualifiedTable(config)} (${definitions})`);

    for (let offset = 0; offset < records.rows.length; offset += INSERT_BATCH_SIZE) {
      const batch = records.rows.slice(offset, offset + INSERT_BATCH_SIZE);
      const parameters: Array<string | null> = [];
      const rowPlaceholders = batch.map((row) => {
        const placeholders = records.headers.map((header) => {
          parameters.push(row[header] ?? null);
          return `$${parameters.length}`;
        });
        return `(${placeholders.join(', ')})`;
      });
      const columns = records.headers.map(quoteIdentifier).join(', ');
      await client.query(
        `INSERT INTO ${qualifiedTable(config)} (${columns}) VALUES ${rowPlaceholders.join(', ')}`,
        parameters
      );
    }

    const after = await tableMetadata(client, config);
    if (after.rowCount !== records.rows.length) {
      throw new Error(`PostgreSQL stored ${after.rowCount} rows; expected ${records.rows.length}.`);
    }
    await client.query('COMMIT');
    transactionStarted = false;
    return {
      connected: true,
      database: config.database,
      schema: config.schema,
      table: config.table,
      tableExists: true,
      rowCount: after.rowCount,
      columns: after.columns,
      replacedExistingTable: before.tableExists,
      columnTypes,
    };
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}
