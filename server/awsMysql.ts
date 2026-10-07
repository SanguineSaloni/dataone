import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createConnection, type Connection, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { parseCsv, type ParsedCsv } from './demoData.js';

const AWS_RDS_HOST = /^(?=.{1,253}$)[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.rds\.amazonaws\.com$/i;
const MYSQL_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const awsRdsCa = readFileSync(new URL('../config/certs/aws-rds-eu-north-1-bundle.pem', import.meta.url), 'utf8');
const MISSING_VALUES_HEADERS = [
  'customer_id',
  'customer_name',
  'email',
  'phone',
  'order_date',
  'category',
  'quantity',
  'unit_price',
  'order_status',
  'country',
  'notes',
] as const;

export const awsMysqlConnectionInput = z
  .object({
    engine: z.literal('mysql'),
    host: z.string().trim().max(253).regex(AWS_RDS_HOST, 'Enter a valid AWS RDS MySQL endpoint.'),
    port: z.coerce.number().int().min(1).max(65_535),
    database: z.string().trim().regex(MYSQL_IDENTIFIER, 'Database must be a valid MySQL identifier.'),
    user: z.string().trim().min(1).max(128),
    password: z.string().min(1).max(512),
    ssl: z.literal(true),
  })
  .strict();

export type AwsMysqlConnectionInput = z.infer<typeof awsMysqlConnectionInput>;

export const awsMysqlCsvImportInput = awsMysqlConnectionInput
  .extend({
    table: z.string().trim().regex(MYSQL_IDENTIFIER, 'Table must be a valid MySQL identifier.'),
    csvText: z.string().min(1).max(2_000_000),
  })
  .strict();

export type AwsMysqlCsvImportInput = z.infer<typeof awsMysqlCsvImportInput>;

export interface AwsMysqlCsvImportResult {
  table: string;
  sourceRowCount: number;
  storedRowCount: number;
}

export interface AwsMysqlTable {
  name: string;
  type: 'BASE TABLE' | 'VIEW';
  columnCount: number;
}

interface TableInventoryRow extends RowDataPacket {
  table_name: string;
  table_type: 'BASE TABLE' | 'VIEW';
  column_count: number | string;
}

export function isConfiguredConnectionAdmin(email: string | null): boolean {
  if (!email) return false;
  const configured = (process.env.DATAONE_CONNECTION_ADMIN_EMAILS ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return configured.includes(email.toLowerCase());
}

function slug(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized.slice(0, 40) || 'database';
}

export function governedAwsMysqlNames(input: Pick<AwsMysqlConnectionInput, 'host' | 'port' | 'database' | 'user'>): {
  connectionName: string;
  catalogName: string;
} {
  const fingerprint = createHash('sha256')
    .update(`${input.host.toLowerCase()}|${input.port}|${input.database.toLowerCase()}|${input.user}`)
    .digest('hex')
    .slice(0, 10);
  const database = slug(input.database);
  return {
    connectionName: `dataone_mysql_${database}_${fingerprint}`,
    catalogName: `dataone_mysql_${database}_${fingerprint}`,
  };
}

export function unityCatalogConnectionOptions(input: AwsMysqlConnectionInput): Record<string, string> {
  return {
    host: input.host,
    port: String(input.port),
    user: input.user,
    password: input.password,
  };
}

async function createAwsMysqlConnection(input: AwsMysqlConnectionInput): Promise<Connection> {
  return createConnection({
    host: input.host,
    port: input.port,
    database: input.database,
    user: input.user,
    password: input.password,
    // [AWS-RDS-TLS] Verify the RDS server against AWS's regional CA chain.
    ssl: { ca: awsRdsCa, minVersion: 'TLSv1.2', rejectUnauthorized: true },
    connectTimeout: 8_000,
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    multipleStatements: false,
  });
}

function quoteMysqlIdentifier(identifier: string): string {
  if (!MYSQL_IDENTIFIER.test(identifier)) throw new Error('Unsafe MySQL identifier.');
  return `\`${identifier}\``;
}

export function parseMissingValuesCsv(csvText: string): ParsedCsv {
  const parsed = parseCsv(csvText);
  const expected = MISSING_VALUES_HEADERS.join(',');
  const actual = parsed.headers.join(',');
  if (actual !== expected) {
    throw new Error(`CSV columns must exactly match: ${expected}.`);
  }
  if (parsed.rows.length > 10_000) throw new Error('CSV import is limited to 10,000 rows.');
  return parsed;
}

function rawValue(value: string): string | null {
  return value.trim() === '' ? null : value;
}

export async function importMissingValuesCsv(input: AwsMysqlCsvImportInput): Promise<AwsMysqlCsvImportResult> {
  const parsed = parseMissingValuesCsv(input.csvText);
  const connection = await createAwsMysqlConnection(input);
  const table = quoteMysqlIdentifier(input.table);
  const columns = MISSING_VALUES_HEADERS.map(quoteMysqlIdentifier).join(', ');

  try {
    // [AWS-MYSQL-BATCH-IMPORT] This intentionally avoids LOAD DATA LOCAL
    // INFILE. Values are bound parameters, and invalid source values remain
    // text so the Databricks quality pipeline can detect them later.
    await connection.query(`
      CREATE TABLE IF NOT EXISTS ${table} (
        raw_id BIGINT AUTO_INCREMENT PRIMARY KEY,
        customer_id VARCHAR(50) NOT NULL,
        customer_name VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(100),
        order_date VARCHAR(100),
        category VARCHAR(100),
        quantity VARCHAR(100),
        unit_price VARCHAR(100),
        order_status VARCHAR(100),
        country VARCHAR(100),
        notes TEXT,
        imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_customer_id (customer_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await connection.beginTransaction();
    for (let offset = 0; offset < parsed.rows.length; offset += 100) {
      const batch = parsed.rows.slice(offset, offset + 100);
      const placeholders = batch.map(() => `(${MISSING_VALUES_HEADERS.map(() => '?').join(', ')})`).join(', ');
      const values = batch.flatMap((row) => MISSING_VALUES_HEADERS.map((header) => rawValue(row[header] ?? '')));
      const updates = MISSING_VALUES_HEADERS.filter((header) => header !== 'customer_id')
        .map((header) => `${quoteMysqlIdentifier(header)} = VALUES(${quoteMysqlIdentifier(header)})`)
        .join(', ');
      await connection.query<ResultSetHeader>(
        `INSERT INTO ${table} (${columns}) VALUES ${placeholders} ON DUPLICATE KEY UPDATE ${updates}`,
        values
      );
    }
    await connection.commit();

    const [countRows] = await connection.query<RowDataPacket[]>(`SELECT COUNT(*) AS row_count FROM ${table}`);
    return {
      table: input.table,
      sourceRowCount: parsed.rows.length,
      storedRowCount: Number(countRows[0]?.row_count ?? 0),
    };
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    await connection.end();
  }
}

export async function discoverAwsMysqlTables(input: AwsMysqlConnectionInput): Promise<AwsMysqlTable[]> {
  const connection = await createAwsMysqlConnection(input);

  try {
    await connection.ping();
    const [rows] = await connection.execute<TableInventoryRow[]>(
      `SELECT t.TABLE_NAME AS table_name,
              t.TABLE_TYPE AS table_type,
              COUNT(c.COLUMN_NAME) AS column_count
         FROM information_schema.TABLES AS t
         LEFT JOIN information_schema.COLUMNS AS c
           ON c.TABLE_SCHEMA = t.TABLE_SCHEMA
          AND c.TABLE_NAME = t.TABLE_NAME
        WHERE t.TABLE_SCHEMA = ?
          AND t.TABLE_TYPE IN ('BASE TABLE', 'VIEW')
        GROUP BY t.TABLE_NAME, t.TABLE_TYPE
        ORDER BY t.TABLE_NAME
        LIMIT 500`,
      [input.database]
    );

    return rows.map((row) => ({
      name: row.table_name,
      type: row.table_type,
      columnCount: Number(row.column_count),
    }));
  } finally {
    await connection.end();
  }
}

export function externalErrorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null) return 'UNKNOWN';
  const candidate = error as { code?: unknown; name?: unknown; statusCode?: unknown };
  if (typeof candidate.code === 'string' && /^[A-Z0-9_]+$/.test(candidate.code)) return candidate.code;
  if (typeof candidate.statusCode === 'number') return `HTTP_${candidate.statusCode}`;
  if (typeof candidate.name === 'string') {
    const normalized = candidate.name
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase();
    if (normalized) return normalized;
  }
  return 'UNKNOWN';
}

export function isNotFoundError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { statusCode?: unknown; status?: unknown; code?: unknown };
  return candidate.statusCode === 404 || candidate.status === 404 || candidate.code === 'NOT_FOUND';
}
