import { describe, expect, it } from 'vitest';
import { localPostgresTargetLabel, parseLocalPostgresTarget } from './localPostgres.js';

describe('local PostgreSQL demo target contract', () => {
  it('accepts and normalizes a loopback PostgreSQL target', () => {
    const config = parseLocalPostgresTarget({
      engine: 'postgresql',
      host: 'localhost',
      port: '5432',
      database: 'dataone_target',
      schema: 'public',
      table: 'titanic_quality_demo',
      user: 'dataone_app',
      password: '',
      ssl: false,
    });

    expect(config.host).toBe('127.0.0.1');
    expect(localPostgresTargetLabel(config)).toBe(
      'PostgreSQL · 127.0.0.1:5432/dataone_target · public.titanic_quality_demo'
    );
  });

  it('rejects non-loopback hosts and unsafe identifiers', () => {
    expect(() =>
      parseLocalPostgresTarget({
        engine: 'postgresql',
        host: 'database.company.internal',
        port: 5432,
        database: 'dataone_target',
        schema: 'public',
        table: 'customers_gold',
        user: 'dataone_app',
        password: '',
        ssl: false,
      })
    ).toThrow('only localhost or 127.0.0.1');

    expect(() =>
      parseLocalPostgresTarget({
        engine: 'postgresql',
        host: '127.0.0.1',
        port: 5432,
        database: 'dataone_target',
        schema: 'public',
        table: 'customers; DROP TABLE customers',
        user: 'dataone_app',
        password: '',
        ssl: false,
      })
    ).toThrow('table must start');
  });

  it('rejects fields that must not cross the local target API boundary', () => {
    expect(() =>
      parseLocalPostgresTarget({
        engine: 'postgresql',
        host: '127.0.0.1',
        port: 5432,
        database: 'dataone_target',
        schema: 'public',
        table: 'customers_gold',
        user: 'dataone_app',
        password: '',
        ssl: false,
        connectionAlias: 'not-accepted',
      })
    ).toThrow('unsupported fields');
  });
});
