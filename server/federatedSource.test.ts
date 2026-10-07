import { describe, expect, it } from 'vitest';
import {
  federatedCatalogOptions,
  federatedConnectionOptions,
  federatedSourceInput,
  governedFederatedSourceNames,
  matchesExistingFederatedConnection,
  unityCatalogConnectionType,
} from './federatedSource.js';

const common = {
  host: 'source.c8example.eu-north-1.rds.amazonaws.com',
  user: 'dataone_reader',
  password: 'not-a-real-password',
} as const;

describe('federated AWS sources', () => {
  it('validates MySQL and maps it to a Unity Catalog connection', () => {
    const source = federatedSourceInput.parse({
      engine: 'mysql',
      ...common,
      port: 3306,
      database: 'dataone_source',
      ssl: true,
    });

    expect(unityCatalogConnectionType(source)).toBe('MYSQL');
    expect(federatedCatalogOptions(source)).toBeUndefined();
    expect(federatedConnectionOptions(source)).toMatchObject({ host: common.host, port: '3306' });
  });

  it('pins a PostgreSQL foreign catalog to the selected database', () => {
    const source = federatedSourceInput.parse({
      engine: 'postgresql',
      ...common,
      port: 5432,
      database: 'analytics',
      ssl: true,
    });

    expect(unityCatalogConnectionType(source)).toBe('POSTGRESQL');
    expect(federatedCatalogOptions(source)).toEqual({ database: 'analytics' });
  });

  it('pins an Oracle foreign catalog to the selected service', () => {
    const source = federatedSourceInput.parse({
      engine: 'oracle',
      ...common,
      port: 1521,
      serviceName: 'ORCLPDB1',
      encryptionProtocol: 'NATIVE_NETWORK_ENCRYPTION',
    });

    expect(unityCatalogConnectionType(source)).toBe('ORACLE');
    expect(federatedCatalogOptions(source)).toEqual({ service_name: 'ORCLPDB1' });
    expect(federatedConnectionOptions(source).encryption_protocol).toBe('NATIVE_NETWORK_ENCRYPTION');
  });

  it('derives stable names without embedding credentials', () => {
    const source = federatedSourceInput.parse({
      engine: 'postgresql',
      ...common,
      port: 5432,
      database: 'analytics',
      ssl: true,
    });
    const names = governedFederatedSourceNames(source);
    const changedPassword = federatedSourceInput.parse({ ...source, password: 'changed' });

    expect(governedFederatedSourceNames(changedPassword)).toEqual(names);
    expect(names.connectionName).toMatch(/^dataone_postgresql_analytics_[a-f0-9]{10}$/);
    expect(JSON.stringify(names)).not.toContain(source.password);
  });

  it('matches an existing connection using only fields returned by Unity Catalog', () => {
    const source = federatedSourceInput.parse({
      engine: 'postgresql',
      ...common,
      port: 5432,
      database: 'analytics',
      ssl: true,
    });

    expect(
      matchesExistingFederatedConnection(source, {
        connectionType: 'POSTGRESQL',
        options: { host: common.host, port: '5432' },
      })
    ).toBe(true);
    expect(
      matchesExistingFederatedConnection(source, {
        connectionType: 'POSTGRESQL',
        options: { host: 'different.rds.amazonaws.com', port: '5432' },
      })
    ).toBe(false);
  });

  it('rejects non-RDS hosts and disabled TLS', () => {
    expect(() =>
      federatedSourceInput.parse({
        engine: 'mysql',
        ...common,
        host: '127.0.0.1',
        port: 3306,
        database: 'dataone_source',
        ssl: true,
      })
    ).toThrow();
    expect(() =>
      federatedSourceInput.parse({
        engine: 'postgresql',
        ...common,
        port: 5432,
        database: 'analytics',
        ssl: false,
      })
    ).toThrow();
  });
});
