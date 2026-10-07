import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectionProfileInput, projectInput, runInput } from './operationalStore.js';

describe('AWS PostgreSQL operational store contracts', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('accepts non-secret Lakehouse Federation connection metadata', () => {
    expect(
      connectionProfileInput.parse({
        alias: 'federated-source',
        role: 'source',
        engine: 'mysql',
        connectionName: 'dataone_mysql',
        foreignCatalog: 'mysql_sales',
        defaultSchema: 'commerce',
        publicationMode: 'federated-read',
      })
    ).toMatchObject({ connectionName: 'dataone_mysql', foreignCatalog: 'mysql_sales' });
  });

  it('rejects credentials and unknown fields from persisted connection metadata', () => {
    expect(() =>
      connectionProfileInput.parse({
        alias: 'federated-source',
        role: 'source',
        engine: 'mysql',
        connectionName: 'dataone_mysql',
        publicationMode: 'federated-read',
        password: 'must-not-be-stored',
      })
    ).toThrow();
  });

  it('accepts a governed source identifier and requires a safe Gold table name', () => {
    expect(
      projectInput.parse({
        projectName: 'Customer 360',
        sourceMode: 'uc_table',
        sourceIdentifier: 'mysql_sales.commerce.customers',
        outputTable: 'customer_360',
        sourceConnectionAlias: 'federated-source',
        targetConnectionAlias: 'external-target',
      })
    ).toMatchObject({ outputTable: 'customer_360' });

    expect(() =>
      projectInput.parse({
        projectName: 'Customer 360',
        sourceMode: 'uc_table',
        sourceIdentifier: 'customers',
        outputTable: 'Customer 360',
      })
    ).toThrow();
  });

  it('rejects a table outside the configured AWS MySQL foreign schema', () => {
    vi.stubEnv('DATAONE_SOURCE_FOREIGN_CATALOG', 'dataone_mysql_source');
    vi.stubEnv('DATAONE_SOURCE_DEFAULT_SCHEMA', 'dataone_source');

    expect(() =>
      projectInput.parse({
        projectName: 'Customer 360',
        sourceMode: 'uc_table',
        sourceIdentifier: 'workspace.default.bronze_customer_churn',
        outputTable: 'customer_360',
        sourceConnectionAlias: 'federated-source',
        targetConnectionAlias: 'external-target',
      })
    ).toThrow();

    expect(
      projectInput.parse({
        projectName: 'Customer 360',
        sourceMode: 'uc_table',
        sourceIdentifier: 'dataone_mysql_sales_a1b2c3d4e5.sales.orders',
        outputTable: 'customer_360',
        sourceConnectionAlias: 'federated-source',
        targetConnectionAlias: 'external-target',
      })
    ).toMatchObject({ sourceIdentifier: 'dataone_mysql_sales_a1b2c3d4e5.sales.orders' });
  });

  it('requires exact workflow and Databricks run identifiers', () => {
    expect(
      runInput.parse({
        projectId: '8cc7c3a5-f673-4bd7-9001-2b56c3623d26',
        workflowRunId: 'run_20260922_1234',
        databricksRunId: 123456789,
      })
    ).toMatchObject({ databricksRunId: 123456789 });
  });
});
