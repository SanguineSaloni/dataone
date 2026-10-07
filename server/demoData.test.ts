import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  createDemoAnalytics,
  createDemoJobRun,
  parseCsv,
  parseDemoSource,
  parseJsonRecords,
  parseParquetRecords,
  transformDemoRecords,
  type DemoDataValue,
} from './demoData.js';

const samplePath = (extension: string) =>
  fileURLToPath(new URL(`../samples/customer_revenue_quality_demo.${extension}`, import.meta.url));
const sampleCsv = readFileSync(samplePath('csv'), 'utf8');
const sampleJson = readFileSync(samplePath('json'), 'utf8');
const sampleParquet = readFileSync(samplePath('parquet'));

describe('DataOne local CSV demo data', () => {
  it('parses quoted values, escaped quotes, a BOM, and embedded newlines', () => {
    const parsed = parseCsv('\uFEFFid,note,amount\r\n1,"hello, world",12\r\n2,"said ""yes""\non Tuesday",20\r\n');

    expect(parsed.headers).toEqual(['id', 'note', 'amount']);
    expect(parsed.rows).toEqual([
      { id: '1', note: 'hello, world', amount: '12' },
      { id: '2', note: 'said "yes"\non Tuesday', amount: '20' },
    ]);
  });

  it('rejects structurally unsafe CSV rather than silently dropping fields', () => {
    expect(() => parseCsv('id,name\n1,Ada,extra\n')).toThrow('expected 2');
    expect(() => parseCsv('id,name\n1,"Ada\n')).toThrow('unterminated');
    expect(() => parseCsv('id,id\n1,2\n')).toThrow('unique');
  });

  it('keeps only normalized source columns in the transformed target dataset', () => {
    const transformed = transformDemoRecords(parseCsv('Passenger ID,Name,Age\n1,"  ada lovelace  ",36\n2,,\n'));

    expect(transformed.headers).toEqual(['passenger_id', 'name', 'age']);
    expect(transformed.rows).toEqual([
      { passenger_id: '1', name: 'Ada Lovelace', age: '36' },
      { passenger_id: '2', name: null, age: null },
    ]);
  });

  it('publishes invalid typed values as null while preserving valid dates and numbers', () => {
    const transformed = transformDemoRecords(
      parseCsv('order_date,quantity,unit_price\n2026-09-18,2,10.50\n2026-13-40,two,unknown\n')
    );

    expect(transformed.rows).toEqual([
      { order_date: '2026-09-18', quantity: '2', unit_price: '10.50' },
      { order_date: null, quantity: null, unit_price: null },
    ]);
  });

  it('parses a JSON array, one object, and NDJSON with explicit schema validation', () => {
    expect(parseJsonRecords('[{"id":1,"active":true},{"id":2,"active":false}]').rows).toEqual([
      { id: '1', active: 'true' },
      { id: '2', active: 'false' },
    ]);
    expect(parseJsonRecords('{"id":1,"name":null}').rows).toEqual([{ id: '1', name: '' }]);
    expect(parseJsonRecords('{"id":1,"name":"Ada"}\n{"id":2,"name":"Grace"}').rows).toHaveLength(2);
    expect(() => parseJsonRecords('[{"id":1},{"id":2,"extra":true}]')).toThrow('inconsistent schema');
    expect(() => parseJsonRecords('[{"id":1,"nested":{"unsafe":true}}]')).toThrow('must be a scalar value');
    expect(() => parseJsonRecords('{"id":1}\nnot-json')).toThrow('JSON document is invalid');
  });

  it('uses the verified Parquet parser and rejects non-Parquet binary data', async () => {
    const records = await parseParquetRecords(sampleParquet);

    expect(records.headers).toContain('customer-id');
    expect(records.rows).toHaveLength(16);
    await expect(parseParquetRecords(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow('PAR1');
  });

  it('normalizes equivalent CSV, JSON, and Parquet samples into the same analytics contract', async () => {
    const csvRecords = await parseDemoSource('csv', sampleCsv);
    const jsonRecords = await parseDemoSource('json', sampleJson);
    const parquetRecords = await parseDemoSource('parquet', sampleParquet);

    expect(jsonRecords).toEqual(csvRecords);
    expect(parquetRecords).toEqual(csvRecords);

    const snapshots = [
      createDemoAnalytics(csvRecords, { sourceFormat: 'csv', sourceIdentifier: 'sample.csv' }),
      createDemoAnalytics(jsonRecords, { sourceFormat: 'json', sourceIdentifier: 'sample.json' }),
      createDemoAnalytics(parquetRecords, { sourceFormat: 'parquet', sourceIdentifier: 'sample.parquet' }),
    ];
    const coreMetrics = snapshots.map((snapshot) => {
      const row = snapshot.queries.dashboard_kpis[0];
      return {
        row_count: row?.row_count,
        column_count: row?.column_count,
        issue_cells: row?.issue_cells,
        transformed_cells: row?.transformed_cells,
        quality_score: row?.quality_score,
        mapping_confidence_pct: row?.mapping_confidence_pct,
        quarantined_rows: row?.quarantined_rows,
        commerce: snapshot.queries.commerce_performance,
      };
    });
    expect(coreMetrics[1]).toEqual(coreMetrics[0]);
    expect(coreMetrics[2]).toEqual(coreMetrics[0]);
    expect(snapshots.map((snapshot) => snapshot.sourceFormat)).toEqual(['csv', 'json', 'parquet']);
  });

  it('produces all run-scoped analytics contracts from the sample file', () => {
    const snapshot = createDemoAnalytics(sampleCsv, {
      runId: 'sample-run-1234',
      projectName: 'Sample CSV Demo',
      sourceIdentifier: 'csv/sample-run-1234/customer_revenue_quality_demo.csv',
    });
    const kpis = snapshot.queries.dashboard_kpis[0];

    expect(kpis).toMatchObject({
      run_id: 'sample-run-1234',
      project_name: 'Sample CSV Demo',
      row_count: 16,
      column_count: 11,
      cell_count: 176,
      valid_cells: 163,
      issue_cells: 13,
      quality_score: 92.6,
      mapped_columns: 11,
      mapping_confidence_pct: 98.1,
      cleaned_rows: 16,
      quarantined_rows: 6,
      run_status: 'COMPLETED',
    });

    expect(Object.keys(snapshot.queries).sort()).toEqual(
      [
        'cleaned_records',
        'commerce_performance',
        'dashboard_kpis',
        'database_inventory',
        'quality_by_column',
        'quality_issue_distribution',
        'recent_runs',
        'schema_mapping',
        'topology_inventory',
        'transformation_summary',
      ].sort()
    );
    expect(snapshot.queries.schema_mapping.filter((row) => row.review_status === 'REVIEW_REQUIRED')).toHaveLength(2);
    expect(snapshot.queries.cleaned_records.filter((row) => row.record_status === 'QUARANTINED')).toHaveLength(6);
  });

  it('keeps cleaning evidence and the revenue-impact story internally coherent', () => {
    const snapshot = createDemoAnalytics(sampleCsv);
    const issueCounts = Object.fromEntries(
      new Map<string, DemoDataValue>(
        snapshot.queries.quality_issue_distribution.map((row): [string, DemoDataValue] => [
          String(row.quality_issue),
          row.issue_count,
        ])
      )
    );
    const firstCleanedRecord = snapshot.queries.cleaned_records.find((row) => row.record_id === '4');
    const analyticsPro = snapshot.queries.commerce_performance.find((row) => row.category === 'Analytics Pro');

    expect(issueCounts).toEqual({
      missing: 8,
      invalid_date: 2,
      invalid_email: 2,
      invalid_number: 1,
      valid: 163,
    });
    expect(firstCleanedRecord).toMatchObject({ issue_count: 3, record_status: 'QUARANTINED' });
    expect(String(firstCleanedRecord?.cleaned_record_json)).toContain('"first_name":"Noah"');
    expect(String(firstCleanedRecord?.cleaned_record_json)).toContain('"country":null');
    expect(analyticsPro).toMatchObject({ order_count: 9, revenue: 16887, delivered_orders: 7 });
    expect(snapshot.story).toMatchObject({
      totalOrderValue: 29074,
      nonDeliveredRevenueAtRisk: 12994,
      quarantinedOrderValue: 9093,
      quarantinedRecords: 6,
      unpricedOrders: 2,
    });
  });
});

describe('DataOne local demo Job shape', () => {
  it('exposes the same task progression consumed by the workflow UI', () => {
    const profiling = createDemoJobRun(9001, 'PROFILING');
    const pipeline = createDemoJobRun(9001, 'PIPELINE');
    const succeeded = createDemoJobRun(9001, 'SUCCEEDED');

    expect(profiling.state.life_cycle_state).toBe('RUNNING');
    expect(profiling.tasks[0]?.state.life_cycle_state).toBe('RUNNING');
    expect(pipeline.tasks[0]?.state.result_state).toBe('SUCCESS');
    expect(pipeline.tasks[1]?.state.life_cycle_state).toBe('RUNNING');
    expect(succeeded.state).toMatchObject({ life_cycle_state: 'TERMINATED', result_state: 'SUCCESS' });
    expect(succeeded.tasks.every((task) => task.state.result_state === 'SUCCESS')).toBe(true);
  });

  it('shows controlled target publication only for the simulated database journey', () => {
    expect(() => createDemoJobRun(9002, 'PUBLISHING')).toThrow('includePublishTask');

    const publishing = createDemoJobRun(9002, 'PUBLISHING', { includePublishTask: true });
    const succeeded = createDemoJobRun(9002, 'SUCCEEDED', { includePublishTask: true });

    expect(publishing.tasks).toHaveLength(3);
    expect(publishing.tasks.find((task) => task.task_key === 'quality_pipeline')?.state.result_state).toBe('SUCCESS');
    expect(publishing.tasks.find((task) => task.task_key === 'publish_target')?.state.life_cycle_state).toBe('RUNNING');
    expect(succeeded.tasks.find((task) => task.task_key === 'publish_target')?.state.result_state).toBe('SUCCESS');
  });

  it('labels database source, target, and simulated connector topology without exposing credentials', () => {
    const snapshot = createDemoAnalytics(parseCsv(sampleCsv), {
      projectName: 'MySQL Commerce to PostgreSQL Analytics',
      sourceIdentifier: 'demo-mysql-commerce',
      sourceMode: 'database_connection',
      sourceFormat: 'database',
      targetIdentifier: 'demo-postgres-analytics',
    });
    const topology = snapshot.queries.topology_inventory;

    expect(snapshot.targetIdentifier).toBe('demo-postgres-analytics');
    expect(topology[0]).toMatchObject({
      source_node: 'demo-mysql-commerce',
      operation: 'CDC_INGEST',
      databricks_component: 'Lakeflow Connect · simulated',
    });
    expect(topology[topology.length - 1]).toMatchObject({
      target_node: 'demo-postgres-analytics',
      operation: 'PUBLISH_ANALYTICS',
      databricks_component: 'Lakeflow Job export · simulated',
    });
    expect(JSON.stringify(snapshot)).not.toMatch(/password|secret|token/i);
  });
});
