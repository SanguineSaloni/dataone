import { createConnection, type FieldPacket, type RowDataPacket } from 'mysql2/promise';
import type { ParsedRecords } from './demoData.js';

const MYSQL_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost']);
const MAX_PREVIEW_ROWS = 5_000;

type JsonObject = Record<string, unknown>;

export interface LocalMysqlSourceConfig {
  engine: 'mysql';
  host: '127.0.0.1';
  port: number;
  database: string;
  table: string;
  user: string;
  password: string;
  ssl: false;
}

export interface LocalMysqlConnectionSummary {
  connected: true;
  database: string;
  table: string;
  rowCount: number;
  columns: string[];
}

export interface LocalMysqlReadResult extends LocalMysqlConnectionSummary {
  records: ParsedRecords;
  truncated: boolean;
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

function mysqlIdentifier(value: unknown, field: string): string {
  const normalized = requiredString(value, field, 64);
  if (!MYSQL_IDENTIFIER.test(normalized)) {
    throw new Error(
      `${field} must start with a letter or underscore and contain only letters, numbers, or underscores.`
    );
  }
  return normalized;
}

/**
 * Parses the explicit local-demo contract. Restricting the host to loopback
 * prevents the demo endpoint from becoming a general-purpose network proxy.
 */
export function parseLocalMysqlSource(value: unknown): LocalMysqlSourceConfig {
  if (!isObject(value)) throw new Error('sourceDatabase must be an object.');
  const allowedKeys = new Set(['engine', 'host', 'port', 'database', 'table', 'user', 'password', 'ssl']);
  const unexpectedKeys = Object.keys(value).filter((key) => !allowedKeys.has(key));
  if (unexpectedKeys.length > 0) {
    throw new Error(`sourceDatabase contains unsupported fields: ${unexpectedKeys.join(', ')}.`);
  }
  if (value.engine !== 'mysql') throw new Error('The live local demo currently supports only a MySQL source.');

  const requestedHost = requiredString(value.host, 'host', 253).toLowerCase();
  if (!LOOPBACK_HOSTS.has(requestedHost)) {
    throw new Error('The local demo permits only localhost or 127.0.0.1 as the MySQL host.');
  }

  const port = typeof value.port === 'number' ? value.port : Number(value.port);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('port must be an integer from 1 through 65535.');
  }
  if (value.ssl !== false) throw new Error('Disable SSL/TLS for this loopback-only local demo connection.');

  return {
    engine: 'mysql',
    host: '127.0.0.1',
    port,
    database: mysqlIdentifier(value.database, 'database'),
    table: mysqlIdentifier(value.table, 'table'),
    user: requiredString(value.user, 'user', 128),
    password: typeof value.password === 'string' && value.password.length <= 512 ? value.password : '',
    ssl: false,
  };
}

function quoteIdentifier(value: string): string {
  if (!MYSQL_IDENTIFIER.test(value)) throw new Error('Unsafe MySQL identifier.');
  return `\`${value}\``;
}

function connectionOptions(config: LocalMysqlSourceConfig) {
  return {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: undefined,
    connectTimeout: 4_000,
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    multipleStatements: false,
  } as const;
}

function countFromRows(rows: unknown): number {
  if (!Array.isArray(rows)) throw new Error('MySQL did not return a row-count result set.');
  const firstRow: unknown = rows[0];
  if (!isObject(firstRow)) throw new Error('MySQL did not return a row count.');
  const rawCount: unknown = firstRow.row_count;
  const parsed = typeof rawCount === 'number' ? rawCount : Number(rawCount);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error('MySQL returned an invalid row count.');
  return parsed;
}

function columnNames(fields: FieldPacket[]): string[] {
  return fields.map((field) => field.name);
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Uint8Array) return Buffer.from(value).toString('base64');
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  throw new Error('MySQL returned an unsupported cell value.');
}

function parsedRecords(rows: RowDataPacket[], fields: FieldPacket[]): ParsedRecords {
  const headers = columnNames(fields);
  return {
    headers,
    rows: rows.map((row) => Object.fromEntries(headers.map((header) => [header, cellToString(row[header])]))),
  };
}

export function localMysqlSourceLabel(config: LocalMysqlSourceConfig): string {
  return `MySQL · ${config.host}:${config.port}/${config.database} · ${config.table}`;
}

export async function testLocalMysqlConnection(config: LocalMysqlSourceConfig): Promise<LocalMysqlConnectionSummary> {
  const connection = await createConnection(connectionOptions(config));
  try {
    await connection.ping();
    const table = quoteIdentifier(config.table);
    const [countRows] = await connection.query<RowDataPacket[]>(`SELECT COUNT(*) AS row_count FROM ${table}`);
    const [, fields] = await connection.query<RowDataPacket[]>(`SELECT * FROM ${table} LIMIT 0`);
    return {
      connected: true,
      database: config.database,
      table: config.table,
      rowCount: countFromRows(countRows),
      columns: columnNames(fields),
    };
  } finally {
    await connection.end();
  }
}

export async function readLocalMysqlTable(config: LocalMysqlSourceConfig): Promise<LocalMysqlReadResult> {
  const connection = await createConnection(connectionOptions(config));
  try {
    const table = quoteIdentifier(config.table);
    const [countRows] = await connection.query<RowDataPacket[]>(`SELECT COUNT(*) AS row_count FROM ${table}`);
    const rowCount = countFromRows(countRows);
    const [rows, fields] = await connection.query<RowDataPacket[]>(`SELECT * FROM ${table} LIMIT ?`, [
      MAX_PREVIEW_ROWS,
    ]);
    return {
      connected: true,
      database: config.database,
      table: config.table,
      rowCount,
      columns: columnNames(fields),
      records: parsedRecords(rows, fields),
      truncated: rowCount > rows.length,
    };
  } finally {
    await connection.end();
  }
}
