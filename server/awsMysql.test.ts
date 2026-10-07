import { describe, expect, it } from 'vitest';

import {
  awsMysqlConnectionInput,
  awsMysqlCsvImportInput,
  externalErrorCode,
  governedAwsMysqlNames,
  isConfiguredConnectionAdmin,
  parseMissingValuesCsv,
  unityCatalogConnectionOptions,
} from './awsMysql.js';

const validInput = {
  engine: 'mysql' as const,
  host: 'dataone-mysql-source.cdmuoui00ep5.eu-north-1.rds.amazonaws.com',
  port: 3306,
  database: 'dataone_source',
  user: 'dataone_admin',
  password: 'not-a-real-password',
  ssl: true as const,
};

describe('AWS MySQL onboarding', () => {
  it('accepts an AWS RDS MySQL connection and requires TLS', () => {
    expect(awsMysqlConnectionInput.parse(validInput)).toEqual(validInput);
    expect(() => awsMysqlConnectionInput.parse({ ...validInput, ssl: false })).toThrow();
    expect(() => awsMysqlConnectionInput.parse({ ...validInput, host: '127.0.0.1' })).toThrow();
  });

  it('derives stable governed names without embedding credentials', () => {
    const first = governedAwsMysqlNames(validInput);
    const changedPassword = { ...validInput, password: 'different' };
    const second = governedAwsMysqlNames(changedPassword);

    expect(first).toEqual(second);
    expect(first.connectionName).toMatch(/^dataone_mysql_dataone_source_[a-f0-9]{10}$/);
    expect(JSON.stringify(first)).not.toContain(validInput.password);
  });

  it('maps the password only into the Unity Catalog connection options', () => {
    expect(unityCatalogConnectionOptions(validInput)).toEqual({
      host: validInput.host,
      port: '3306',
      user: validInput.user,
      password: validInput.password,
    });
  });

  it('permits only configured connection administrators', () => {
    const previous = process.env.DATAONE_CONNECTION_ADMIN_EMAILS;
    process.env.DATAONE_CONNECTION_ADMIN_EMAILS = 'admin@example.com, owner@example.com';
    try {
      expect(isConfiguredConnectionAdmin('ADMIN@example.com')).toBe(true);
      expect(isConfiguredConnectionAdmin('viewer@example.com')).toBe(false);
      expect(isConfiguredConnectionAdmin(null)).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.DATAONE_CONNECTION_ADMIN_EMAILS;
      else process.env.DATAONE_CONNECTION_ADMIN_EMAILS = previous;
    }
  });

  it('returns a useful code for ordinary JavaScript errors', () => {
    expect(externalErrorCode(new TypeError('request failed'))).toBe('TYPE_ERROR');
  });

  it('accepts the DataOne missing-values CSV contract', () => {
    const csv = [
      'customer_id,customer_name,email,phone,order_date,category,quantity,unit_price,order_status,country,notes',
      'CUST-0001,Ada Lovelace,ada@example.com,+1-555-0100,2026-01-02,Books,2,12.50,shipped,US,Test',
      'CUST-0002,,bad-email,,2026-13-40,Books,two,unknown,pending,,',
    ].join('\n');

    expect(parseMissingValuesCsv(csv).rows).toHaveLength(2);
    expect(
      awsMysqlCsvImportInput.parse({ ...validInput, table: 'dataone_missing_values_raw', csvText: csv }).table
    ).toBe('dataone_missing_values_raw');
  });

  it('rejects a CSV with a different schema', () => {
    expect(() => parseMissingValuesCsv('id,name\n1,Ada\n')).toThrow('CSV columns must exactly match');
  });
});
