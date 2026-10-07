import { afterEach, describe, expect, it, vi } from 'vitest';

import { projectGoldTableLeaf, projectGoldTableName } from '../shared/projectGold.js';
import { jobParameters } from './dataoneValidation.js';

const base = {
  project_name: 'Customer 360',
  run_id: 'run-12345678',
  source_mode: 'volume_file' as const,
  source_path: 'csv/customer-orders.csv',
  source_format: 'csv' as const,
  json_mode: 'lines' as const,
  source_table: 'unused',
  output_table: 'customer_360',
  target_engine: 'postgresql' as const,
};

describe('DataOne job parameter validation', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ['csv', 'csv/customer-orders.csv'],
    ['json', 'json/customer-orders.json'],
    ['parquet', 'parquet/customer-orders.parquet'],
  ] as const)('accepts a governed %s upload', (sourceFormat, sourcePath) => {
    expect(jobParameters.safeParse({ ...base, source_format: sourceFormat, source_path: sourcePath }).success).toBe(
      true
    );
  });

  it.each(['db', 'sqlite', 'sqlite3'])('accepts a governed SQLite .%s upload and selected table', (extension) => {
    expect(
      jobParameters.safeParse({
        ...base,
        source_format: 'sqlite',
        source_path: `sqlite/customer-orders.${extension}`,
        source_table: 'customer_orders',
      }).success
    ).toBe(true);
  });

  it('rejects a SQLite upload without a safe selected table', () => {
    expect(
      jobParameters.safeParse({
        ...base,
        source_format: 'sqlite',
        source_path: 'sqlite/customer-orders.db',
        source_table: 'customer orders',
      }).success
    ).toBe(false);
  });

  it('accepts a three-part Unity Catalog table', () => {
    expect(
      jobParameters.safeParse({
        ...base,
        source_mode: 'uc_table',
        source_path: '',
        source_table: 'workspace.default.bronze_customer_churn',
      }).success
    ).toBe(true);
  });

  it('restricts production table runs to configured or onboarded AWS foreign schemas', () => {
    vi.stubEnv('DATAONE_SOURCE_FOREIGN_CATALOG', 'dataone_mysql_source');
    vi.stubEnv('DATAONE_SOURCE_DEFAULT_SCHEMA', 'dataone_source');

    expect(
      jobParameters.safeParse({
        ...base,
        source_mode: 'uc_table',
        source_path: '',
        source_table: 'dataone_mysql_source.dataone_source.manual_orders',
      }).success
    ).toBe(true);
    expect(
      jobParameters.safeParse({
        ...base,
        source_mode: 'uc_table',
        source_path: '',
        source_table: 'dataone_postgresql_analytics_a1b2c3d4e5.public.orders',
      }).success
    ).toBe(true);
    expect(
      jobParameters.safeParse({
        ...base,
        source_mode: 'uc_table',
        source_path: '',
        source_table: 'dataone_oracle_orclpdb1_a1b2c3d4e5.dataone.orders',
      }).success
    ).toBe(true);
    expect(
      jobParameters.safeParse({
        ...base,
        source_mode: 'uc_table',
        source_path: '',
        source_table: 'dataone_mysql_sales_a1b2c3d4e5.sales.orders',
      }).success
    ).toBe(true);
    expect(
      jobParameters.safeParse({
        ...base,
        source_mode: 'uc_table',
        source_path: '',
        source_table: 'workspace.default.bronze_customer_churn',
      }).success
    ).toBe(false);
  });

  it.each([
    ['csv/customer-orders.parquet', 'csv'],
    ['json/../customer-orders.json', 'json'],
    ['customer-orders.csv', 'csv'],
  ] as const)('rejects an unsafe or mismatched upload path: %s', (sourcePath, sourceFormat) => {
    expect(jobParameters.safeParse({ ...base, source_format: sourceFormat, source_path: sourcePath }).success).toBe(
      false
    );
  });

  it('rejects an unqualified Unity Catalog table name', () => {
    expect(
      jobParameters.safeParse({
        ...base,
        source_mode: 'uc_table',
        source_path: '',
        source_table: 'bronze_customer_churn',
      }).success
    ).toBe(false);
  });

  it.each([
    ['Customer Revenue Quality Demo', 'customer_revenue_quality_demo'],
    ['2026 Sales & Quality', 'project_2026_sales_quality'],
    ['Crème Brûlée', 'creme_brulee'],
  ])('derives a safe project Gold table from %s', (projectName, tableName) => {
    expect(projectGoldTableLeaf(projectName)).toBe(tableName);
    expect(projectGoldTableName(projectName)).toBe(`workspace.dataone_gold.${tableName}`);
  });

  it('rejects an output table that does not match the project name', () => {
    expect(jobParameters.safeParse({ ...base, output_table: 'some_other_project' }).success).toBe(false);
  });

  it('accepts PostgreSQL and MySQL targets and rejects any unconfigured target engine', () => {
    expect(jobParameters.safeParse({ ...base, target_engine: 'postgresql' }).success).toBe(true);
    expect(jobParameters.safeParse({ ...base, target_engine: 'mysql' }).success).toBe(true);
    expect(jobParameters.safeParse({ ...base, target_engine: 'oracle' }).success).toBe(false);
  });
});
