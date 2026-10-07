import { describe, expect, it } from 'vitest';
import { localMysqlSourceLabel, parseLocalMysqlSource } from './localMysql.js';

describe('local MySQL demo connection contract', () => {
  it('accepts and normalizes a loopback MySQL source', () => {
    const config = parseLocalMysqlSource({
      engine: 'mysql',
      host: 'localhost',
      port: '3306',
      database: 'dataone_source',
      table: 'customers',
      user: 'dataone_app',
      password: 'local-only',
      ssl: false,
    });

    expect(config.host).toBe('127.0.0.1');
    expect(localMysqlSourceLabel(config)).toBe('MySQL · 127.0.0.1:3306/dataone_source · customers');
  });

  it('rejects non-loopback hosts to prevent the demo endpoint from proxying arbitrary networks', () => {
    expect(() =>
      parseLocalMysqlSource({
        engine: 'mysql',
        host: 'database.company.internal',
        port: 3306,
        database: 'dataone_source',
        table: 'customers',
        user: 'dataone_app',
        password: '',
        ssl: false,
      })
    ).toThrow('only localhost or 127.0.0.1');
  });

  it('rejects unsafe identifiers and unexpected properties', () => {
    expect(() =>
      parseLocalMysqlSource({
        engine: 'mysql',
        host: '127.0.0.1',
        port: 3306,
        database: 'dataone_source; DROP DATABASE dataone_source',
        table: 'customers',
        user: 'dataone_app',
        password: '',
        ssl: false,
      })
    ).toThrow('database must start');

    expect(() =>
      parseLocalMysqlSource({
        engine: 'mysql',
        host: '127.0.0.1',
        port: 3306,
        database: 'dataone_source',
        table: 'customers',
        user: 'dataone_app',
        password: '',
        ssl: false,
        connectionAlias: 'must-not-cross-the-api',
      })
    ).toThrow('unsupported fields');
  });
});
