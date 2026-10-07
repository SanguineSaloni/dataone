import { describe, expect, it } from 'vitest';
import {
  connectorForEngine,
  DATABASE_ENGINE_OPTIONS,
  databaseConnectorLabel,
  defaultDatabaseConnector,
  localMysqlSourceRequest,
  localPostgresTargetRequest,
  validateDatabaseConnector,
} from './databaseConnectorModel.js';

describe('database connector model', () => {
  it('creates valid MySQL source and PostgreSQL target defaults', () => {
    expect(validateDatabaseConnector(defaultDatabaseConnector('source'))).toEqual({ valid: true, errors: [] });
    expect(validateDatabaseConnector(defaultDatabaseConnector('target'))).toEqual({ valid: true, errors: [] });
    expect(localPostgresTargetRequest(defaultDatabaseConnector('target'), 'manager_demo')).toMatchObject({
      engine: 'postgresql',
      host: '127.0.0.1',
      port: 5432,
      database: 'dataone_target',
      schema: 'public',
      table: 'manager_demo',
      user: 'dataone_app',
      ssl: false,
    });
  });

  it('requires the Oracle service name and a valid network port', () => {
    const oracle = connectorForEngine('oracle', 'source');
    const validation = validateDatabaseConnector({ ...oracle, port: '70000', serviceName: '' });

    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain('Enter a port between 1 and 65535.');
    expect(validation.errors).toContain('Enter the Oracle service name.');
  });

  it('validates SQLite and Databricks without network credentials', () => {
    expect(validateDatabaseConnector(connectorForEngine('sqlite', 'source')).valid).toBe(true);
    expect(validateDatabaseConnector(connectorForEngine('databricks', 'target')).valid).toBe(true);
  });

  it('does not expose Generic JDBC as a database option', () => {
    expect(DATABASE_ENGINE_OPTIONS.map((option) => option.value)).not.toContain('jdbc');
  });

  it('builds a redacted display label that never includes the password', () => {
    const source = { ...defaultDatabaseConnector('source'), password: 'do-not-render' };
    const label = databaseConnectorLabel(source);

    expect(label).toContain('MySQL');
    expect(label).toContain('127.0.0.1:3306/dataone_source');
    expect(label).toContain('customers');
    expect(label).not.toContain(source.password);
  });

  it('creates the bounded local MySQL request without UI-only connection fields', () => {
    const source = { ...defaultDatabaseConnector('source'), password: 'local-only' };

    expect(localMysqlSourceRequest(source)).toEqual({
      engine: 'mysql',
      host: '127.0.0.1',
      port: 3306,
      database: 'dataone_source',
      table: 'customers',
      user: 'dataone_app',
      password: 'local-only',
      ssl: false,
    });
  });
});
