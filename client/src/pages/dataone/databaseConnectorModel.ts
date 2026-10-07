export type DatabaseEngine = 'mysql' | 'postgresql' | 'oracle' | 'sqlite' | 'databricks';

export type DatabaseConnectorRole = 'source' | 'target';

export interface DatabaseConnectorConfig {
  engine: DatabaseEngine;
  connectionAlias: string;
  host: string;
  port: string;
  database: string;
  serviceName: string;
  user: string;
  password: string;
  ssl: boolean;
  schema: string;
  table: string;
  filePath: string;
  catalog: string;
}

export interface DatabaseConnectorValidation {
  valid: boolean;
  errors: string[];
}

export interface LocalMysqlSourceRequest {
  engine: 'mysql';
  host: string;
  port: number;
  database: string;
  table: string;
  user: string;
  password: string;
  ssl: boolean;
}

export interface LocalPostgresTargetRequest {
  engine: 'postgresql';
  host: string;
  port: number;
  database: string;
  schema: string;
  table: string;
  user: string;
  password: string;
  ssl: boolean;
}

export const DATABASE_ENGINE_OPTIONS: ReadonlyArray<{ value: DatabaseEngine; label: string }> = [
  { value: 'mysql', label: 'MySQL' },
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'oracle', label: 'Oracle' },
  { value: 'sqlite', label: 'SQLite' },
  { value: 'databricks', label: 'Databricks / Unity Catalog' },
];

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_$#.-]{0,127}$/;
const CONNECTION_ALIAS_PATTERN = /^[A-Za-z0-9_.-]{3,128}$/;

export function databaseEngineLabel(engine: DatabaseEngine): string {
  return DATABASE_ENGINE_OPTIONS.find((option) => option.value === engine)?.label ?? engine;
}

export function isDatabaseEngine(value: string): value is DatabaseEngine {
  return DATABASE_ENGINE_OPTIONS.some((option) => option.value === value);
}

export function defaultDatabaseConnector(role: DatabaseConnectorRole): DatabaseConnectorConfig {
  if (role === 'target') {
    return {
      engine: 'postgresql',
      connectionAlias: 'demo-postgres-analytics',
      host: '127.0.0.1',
      port: '5432',
      database: 'dataone_target',
      serviceName: '',
      user: 'dataone_app',
      password: '',
      ssl: false,
      schema: 'public',
      table: 'customer_revenue_quality_demo',
      filePath: '/Volumes/workspace/dataone_bronze/dataone_landing/target.sqlite',
      catalog: 'workspace',
    };
  }

  return {
    engine: 'mysql',
    connectionAlias: 'local-mysql-source',
    host: '127.0.0.1',
    port: '3306',
    database: 'dataone_source',
    serviceName: '',
    user: 'dataone_app',
    password: '',
    ssl: false,
    schema: '',
    table: 'customers',
    filePath: '/Volumes/workspace/dataone_bronze/dataone_landing/source.sqlite',
    catalog: 'workspace',
  };
}

export function connectorForEngine(engine: DatabaseEngine, role: DatabaseConnectorRole): DatabaseConnectorConfig {
  const base = defaultDatabaseConnector(role);

  switch (engine) {
    case 'mysql':
      return {
        ...base,
        engine,
        connectionAlias: role === 'source' ? 'local-mysql-source' : 'dataone-target-mysql',
        host: '127.0.0.1',
        port: '3306',
        database: role === 'source' ? 'dataone_source' : 'dataone_target',
        user: role === 'source' ? 'dataone_app' : 'dataone_writer',
        schema: '',
        table: role === 'source' ? 'customers' : 'customers_gold',
      };
    case 'postgresql':
      return {
        ...base,
        engine,
        connectionAlias: role === 'target' ? 'demo-postgres-analytics' : 'dataone-source-postgres',
        host: '127.0.0.1',
        port: '5432',
        database: role === 'source' ? 'mydb' : 'dataone_target',
        user: 'dataone_app',
        schema: 'public',
        table: role === 'source' ? 'customers' : 'customers_gold',
      };
    case 'oracle':
      return {
        ...base,
        engine,
        connectionAlias: role === 'source' ? 'dataone-source-oracle' : 'dataone-target-oracle',
        host: 'oracle.company.internal',
        port: '1521',
        database: '',
        serviceName: 'ORCLPDB1',
        user: 'dataone',
        schema: 'DATAONE',
        table: role === 'source' ? 'CUSTOMERS' : 'CUSTOMERS_GOLD',
      };
    case 'sqlite':
      return {
        ...base,
        engine,
        connectionAlias: '',
        host: '',
        port: '',
        database: '',
        serviceName: '',
        user: '',
        schema: '',
        table: role === 'source' ? 'customers' : 'customers_gold',
        filePath: `/Volumes/workspace/dataone_bronze/dataone_landing/${role}.sqlite`,
      };
    case 'databricks':
      return {
        ...base,
        engine,
        connectionAlias: '',
        host: '',
        port: '',
        database: '',
        serviceName: '',
        user: '',
        schema: role === 'source' ? 'default' : 'dataone_gold',
        table: role === 'source' ? 'bronze_customer_churn' : 'customers_gold',
        catalog: 'workspace',
      };
  }
}

function hasIdentifier(value: string): boolean {
  return IDENTIFIER_PATTERN.test(value.trim());
}

function validatePort(port: string): boolean {
  const parsed = Number(port);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65_535;
}

export function validateDatabaseConnector(config: DatabaseConnectorConfig): DatabaseConnectorValidation {
  const errors: string[] = [];

  if (config.engine === 'databricks') {
    if (!hasIdentifier(config.catalog)) errors.push('Enter a valid Databricks catalog.');
    if (!hasIdentifier(config.schema)) errors.push('Enter a valid Databricks schema.');
    if (!hasIdentifier(config.table)) errors.push('Enter a valid Databricks table.');
    return { valid: errors.length === 0, errors };
  }

  if (config.engine === 'sqlite') {
    if (!/\.(db|sqlite|sqlite3)$/i.test(config.filePath.trim())) {
      errors.push('Enter a SQLite file ending in .db, .sqlite, or .sqlite3.');
    }
    if (!hasIdentifier(config.table)) errors.push('Enter a valid SQLite table.');
    return { valid: errors.length === 0, errors };
  }

  if (!CONNECTION_ALIAS_PATTERN.test(config.connectionAlias.trim())) {
    errors.push('Enter a valid Unity Catalog connection alias.');
  }

  if (!config.host.trim()) errors.push('Enter the database host.');
  if (!validatePort(config.port)) errors.push('Enter a port between 1 and 65535.');
  if (config.engine === 'oracle') {
    if (!config.serviceName.trim()) errors.push('Enter the Oracle service name.');
  } else if (!config.database.trim()) {
    errors.push('Enter the database name.');
  }
  if (!config.user.trim()) errors.push('Enter the database username.');
  if (config.engine !== 'mysql' && !hasIdentifier(config.schema)) errors.push('Enter a valid database schema.');
  if (!hasIdentifier(config.table)) errors.push('Enter a valid database table.');

  return { valid: errors.length === 0, errors };
}

export function databaseConnectorLabel(config: DatabaseConnectorConfig): string {
  const engine = databaseEngineLabel(config.engine);

  if (config.engine === 'databricks') {
    return `${engine} · ${config.catalog}.${config.schema}.${config.table}`;
  }
  if (config.engine === 'sqlite') {
    return `${engine} · ${config.filePath} · ${config.table}`;
  }
  const database = config.engine === 'oracle' ? config.serviceName : config.database;
  const table = config.schema ? `${config.schema}.${config.table}` : config.table;
  return `${engine} · ${config.host}:${config.port}/${database} · ${table}`;
}

export function localMysqlSourceRequest(config: DatabaseConnectorConfig): LocalMysqlSourceRequest | null {
  if (config.engine !== 'mysql') return null;
  return {
    engine: 'mysql',
    host: config.host.trim(),
    port: Number(config.port),
    database: config.database.trim(),
    table: config.table.trim(),
    user: config.user.trim(),
    password: config.password,
    ssl: config.ssl,
  };
}

export function localPostgresTargetRequest(
  config: DatabaseConnectorConfig,
  table = config.table
): LocalPostgresTargetRequest | null {
  if (config.engine !== 'postgresql') return null;
  return {
    engine: 'postgresql',
    host: config.host.trim(),
    port: Number(config.port),
    database: config.database.trim(),
    schema: config.schema.trim(),
    table: table.trim(),
    user: config.user.trim(),
    password: config.password,
    ssl: config.ssl,
  };
}
