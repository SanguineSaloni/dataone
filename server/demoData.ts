import { parquetReadObjects } from 'hyparquet';

export const DEMO_QUERY_KEYS = [
  'dashboard_kpis',
  'quality_by_column',
  'quality_issue_distribution',
  'transformation_summary',
  'schema_mapping',
  'database_inventory',
  'commerce_performance',
  'cleaned_records',
  'topology_inventory',
  'recent_runs',
] as const;

export type DemoQueryKey = (typeof DEMO_QUERY_KEYS)[number];
export type DemoDataValue = string | number | boolean | null;
export type DemoDataRow = Record<string, DemoDataValue>;
export type DemoFileFormat = 'csv' | 'json' | 'parquet';
export type DemoSourceFormat = DemoFileFormat | 'database' | 'unity_catalog';
export type DemoSourceMode = 'volume_file' | 'database_connection' | 'uc_table';

export interface ParsedRecords {
  headers: string[];
  rows: Array<Record<string, string>>;
}

export interface TransformedRecords {
  headers: string[];
  rows: Array<Record<string, string | null>>;
}

export type ParsedCsv = ParsedRecords;

export interface DemoAnalyticsOptions {
  runId?: string;
  projectName?: string;
  sourceIdentifier?: string;
  sourceMode?: DemoSourceMode;
  sourceFormat?: DemoSourceFormat;
  targetIdentifier?: string;
  startedAt?: string;
  sourceConnectionLive?: boolean;
  targetConnectionLive?: boolean;
}

export interface DemoBusinessStory {
  problem: string;
  action: string;
  totalOrderValue: number;
  nonDeliveredRevenueAtRisk: number;
  quarantinedOrderValue: number;
  quarantinedRecords: number;
  unpricedOrders: number;
}

export interface DemoAnalyticsSnapshot {
  runId: string;
  projectName: string;
  sourceIdentifier: string;
  sourceMode: DemoSourceMode;
  sourceFormat: DemoSourceFormat;
  targetIdentifier: string | null;
  startedAt: string;
  updatedAt: string;
  story: DemoBusinessStory;
  queries: Record<DemoQueryKey, DemoDataRow[]>;
}

export type DemoJobStage = 'PENDING' | 'PROFILING' | 'PIPELINE' | 'PUBLISHING' | 'SUCCEEDED' | 'FAILED';

export interface DemoJobRun {
  run_id: number;
  run_name: string;
  start_time: number;
  end_time?: number;
  state: {
    life_cycle_state: string;
    result_state?: string;
    state_message: string;
  };
  tasks: Array<{
    task_key: 'profile_source' | 'quality_pipeline' | 'publish_target';
    state: {
      life_cycle_state: string;
      result_state?: string;
      state_message: string;
    };
  }>;
}

interface AnalyzedCell {
  columnName: string;
  rawValue: string;
  cleanValue: string | null;
  qualityIssue: 'valid' | 'missing' | 'invalid_email' | 'invalid_number' | 'invalid_date';
  wasTransformed: boolean;
  transformation: string;
}

const DEFAULT_STARTED_AT = '2026-09-15T09:30:00.000Z';
const EMAIL_COLUMN = /(^|_)email($|_)/;
const DATE_COLUMN = /(^|_)(date|time|timestamp|created_at|updated_at)($|_)/;
const NUMBER_COLUMN = /(^|_)(amount|price|cost|quantity|qty|count|score|rate|total)($|_)/;
const COUNTRY_COLUMN = /(^|_)country($|_)/;
const STATUS_COLUMN = /(^|_)status($|_)/;
const NAME_COLUMN = /(^|_)(first_name|last_name|name)($|_)/;
const EMAIL_VALUE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function round(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(
      /(^|[\s'()/-])([a-z])/g,
      (_match, separator: string, letter: string) => `${separator}${letter.toUpperCase()}`
    );
}

function normalizeDate(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ][^\s]+)?$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) {
    return null;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function parseNumber(value: string): number | null {
  const normalized = value.trim().replace(/,/g, '');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function inferSourceType(values: string[]): string {
  const present = values.map((value) => value.trim()).filter(Boolean);
  if (present.length === 0) return 'string';
  if (present.every((value) => /^[+-]?\d+$/.test(value))) return 'bigint';
  if (present.every((value) => Number.isFinite(Number(value)))) return 'double';
  if (present.every((value) => normalizeDate(value) !== null)) return 'date';
  return 'string';
}

function targetName(columnName: string): string {
  return (
    columnName
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase() || 'unnamed_column'
  );
}

function transformationFor(columnName: string): string {
  const key = columnName.toLowerCase();
  if (key.includes('email')) return 'Normalize email';
  if (key.includes('country')) return 'Standardize country';
  if (/date|time|timestamp|created_at|updated_at/.test(key)) return 'Normalize date';
  if (/amount|price|cost|quantity|qty|count|score|rate|total/.test(key)) return 'Validate number';
  return 'Trim and normalize text';
}

function analyzeCell(columnName: string, rawValue: string): AnalyzedCell {
  const key = columnName.toLowerCase();
  const trimmed = rawValue.trim();
  const missing = trimmed === '';
  const parsedDate = DATE_COLUMN.test(key) ? normalizeDate(trimmed) : null;
  const parsedNumber = NUMBER_COLUMN.test(key) ? parseNumber(trimmed) : null;

  let qualityIssue: AnalyzedCell['qualityIssue'] = 'valid';
  if (missing) qualityIssue = 'missing';
  else if (EMAIL_COLUMN.test(key) && !EMAIL_VALUE.test(trimmed)) qualityIssue = 'invalid_email';
  else if (NUMBER_COLUMN.test(key) && parsedNumber === null) qualityIssue = 'invalid_number';
  else if (DATE_COLUMN.test(key) && parsedDate === null) qualityIssue = 'invalid_date';

  let cleanValue: string | null;
  if (missing) cleanValue = null;
  else if (EMAIL_COLUMN.test(key)) cleanValue = trimmed.toLowerCase();
  else if (COUNTRY_COLUMN.test(key) && ['in', 'india'].includes(trimmed.toLowerCase())) cleanValue = 'INDIA';
  else if (COUNTRY_COLUMN.test(key) && ['us', 'usa', 'united states'].includes(trimmed.toLowerCase()))
    cleanValue = 'USA';
  else if (STATUS_COLUMN.test(key)) cleanValue = titleCase(trimmed);
  else if (DATE_COLUMN.test(key)) cleanValue = parsedDate;
  else if (NUMBER_COLUMN.test(key)) cleanValue = parsedNumber === null ? null : trimmed.replace(/,/g, '');
  else if (NAME_COLUMN.test(key)) cleanValue = titleCase(trimmed);
  else cleanValue = trimmed;

  return {
    columnName,
    rawValue,
    cleanValue,
    qualityIssue,
    wasTransformed: rawValue !== cleanValue,
    transformation: transformationFor(columnName),
  };
}

/**
 * Produces the dataset written to an external target. Target column names are
 * normalized, but DataOne's quality/audit metadata remains in the analytics
 * snapshot instead of being appended to the customer's target table.
 */
export function transformDemoRecords(records: ParsedRecords): TransformedRecords {
  const columns = records.headers.map((sourceColumn) => ({
    sourceColumn,
    targetColumn: targetName(sourceColumn),
  }));
  const targetHeaders = columns.map((column) => column.targetColumn);
  if (new Set(targetHeaders).size !== targetHeaders.length) {
    throw new Error('Two source columns normalize to the same target column name. Review the schema mapping.');
  }

  return {
    headers: targetHeaders,
    rows: records.rows.map((row) =>
      Object.fromEntries(
        columns.map(({ sourceColumn, targetColumn }) => [
          targetColumn,
          analyzeCell(sourceColumn, row[sourceColumn] ?? '').cleanValue,
        ])
      )
    ),
  };
}

function issueLabel(issue: string): string {
  return issue
    .split('_')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

/**
 * Parses RFC-4180-style CSV text, including escaped quotes, quoted commas,
 * embedded newlines, UTF-8 BOMs, and a trailing newline.
 */
export function parseCsv(csvText: string): ParsedCsv {
  const input = csvText.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;

  const finishField = () => {
    record.push(field);
    field = '';
  };
  const finishRecord = () => {
    finishField();
    records.push(record);
    record = [];
  };

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      if (field.length > 0) throw new Error(`Unexpected quote at character ${index + 1}.`);
      quoted = true;
    } else if (character === ',') {
      finishField();
    } else if (character === '\n') {
      finishRecord();
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error('CSV contains an unterminated quoted field.');
  if (field.length > 0 || record.length > 0) finishRecord();

  const nonEmptyRecords = records.filter((candidate) => !(candidate.length === 1 && candidate[0]?.trim() === ''));
  const headerRecord = nonEmptyRecords.shift();
  if (!headerRecord) throw new Error('CSV must contain a header row.');

  const headers = headerRecord.map((header) => header.trim());
  if (headers.some((header) => !header)) throw new Error('CSV header names cannot be empty.');
  if (new Set(headers).size !== headers.length) throw new Error('CSV header names must be unique.');

  const rows = nonEmptyRecords.map((values, index) => {
    if (values.length !== headers.length) {
      throw new Error(`CSV row ${index + 2} has ${values.length} fields; expected ${headers.length}.`);
    }
    return Object.fromEntries(headers.map((header, columnIndex) => [header, values[columnIndex] ?? '']));
  });

  if (rows.length === 0) throw new Error('CSV must contain at least one data row.');
  return { headers, rows };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Unknown parser error';
}

function normalizeRecordValue(value: unknown, path: string): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${path} must be a finite number.`);
    return String(value);
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error(`${path} contains an invalid timestamp.`);
    return value.toISOString();
  }
  throw new Error(`${path} must be a scalar value; nested objects, arrays, and binary values are not supported.`);
}

function normalizeObjectRecords(values: unknown[], label: string): ParsedRecords {
  if (values.length === 0) throw new Error(`${label} must contain at least one record.`);
  if (!values.every(isRecord)) throw new Error(`${label} records must all be JSON-style objects.`);

  const firstRecord = values[0];
  if (!firstRecord) throw new Error(`${label} must contain at least one record.`);
  const headers = Object.keys(firstRecord);
  if (headers.length === 0) throw new Error(`${label} records must contain at least one field.`);
  if (headers.some((header) => header.trim() === '')) throw new Error(`${label} field names cannot be empty.`);

  const headerSet = new Set(headers);
  const rows = values.map((value, index) => {
    if (!isRecord(value)) throw new Error(`${label} record ${index + 1} must be an object.`);
    const keys = Object.keys(value);
    const missing = headers.filter((header) => !Object.prototype.hasOwnProperty.call(value, header));
    const extra = keys.filter((key) => !headerSet.has(key));
    if (missing.length > 0 || extra.length > 0) {
      const differences = [
        ...(missing.length > 0 ? [`missing ${missing.join(', ')}`] : []),
        ...(extra.length > 0 ? [`unexpected ${extra.join(', ')}`] : []),
      ];
      throw new Error(`${label} record ${index + 1} has an inconsistent schema (${differences.join('; ')}).`);
    }

    return Object.fromEntries(
      headers.map((header) => [header, normalizeRecordValue(value[header], `${label} record ${index + 1}.${header}`)])
    );
  });
  return { headers, rows };
}

/** Parses a JSON array, one JSON object, or newline-delimited JSON objects. */
export function parseJsonRecords(jsonText: string): ParsedRecords {
  const input = jsonText.replace(/^\uFEFF/, '').trim();
  if (!input) throw new Error('JSON input is empty.');
  if (!input.startsWith('[') && !input.startsWith('{')) {
    throw new Error('JSON input must be an object, an array of objects, or newline-delimited objects.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input) as unknown;
  } catch (documentError) {
    const lines = input.split(/\r?\n/).filter((line) => line.trim() !== '');
    if (lines.length < 2 || lines.some((line) => !line.trim().startsWith('{'))) {
      throw new Error(`JSON document is invalid: ${errorMessage(documentError)}`);
    }

    const records = lines.map((line, index): unknown => {
      try {
        return JSON.parse(line) as unknown;
      } catch (lineError) {
        throw new Error(`NDJSON line ${index + 1} is invalid: ${errorMessage(lineError)}`);
      }
    });
    return normalizeObjectRecords(records, 'NDJSON');
  }

  if (Array.isArray(parsed)) return normalizeObjectRecords(parsed, 'JSON array');
  if (isRecord(parsed)) return normalizeObjectRecords([parsed], 'JSON object');
  throw new Error('JSON input must be an object, an array of objects, or newline-delimited objects.');
}

function parquetMagic(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset] ?? 0,
    bytes[offset + 1] ?? 0,
    bytes[offset + 2] ?? 0,
    bytes[offset + 3] ?? 0
  );
}

/** Parses a real Apache Parquet payload through hyparquet and normalizes rows to the common record contract. */
export async function parseParquetRecords(input: Uint8Array | ArrayBuffer): Promise<ParsedRecords> {
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
  if (
    bytes.byteLength < 12 ||
    parquetMagic(bytes, 0) !== 'PAR1' ||
    parquetMagic(bytes, bytes.byteLength - 4) !== 'PAR1'
  ) {
    throw new Error('Parquet input is invalid: required PAR1 header or footer is missing.');
  }

  const fileBytes = Uint8Array.from(bytes);
  let parsed: unknown;
  try {
    parsed = await parquetReadObjects({ file: fileBytes.buffer });
  } catch (error) {
    throw new Error(`Parquet input could not be decoded: ${errorMessage(error)}`);
  }
  if (!Array.isArray(parsed)) throw new Error('Parquet decoder did not return a row array.');
  return normalizeObjectRecords(parsed, 'Parquet');
}

export async function parseDemoSource(
  format: DemoFileFormat,
  input: string | Uint8Array | ArrayBuffer
): Promise<ParsedRecords> {
  if (format === 'csv') {
    if (typeof input !== 'string') throw new Error('CSV input must be decoded UTF-8 text.');
    return parseCsv(input);
  }
  if (format === 'json') {
    if (typeof input !== 'string') throw new Error('JSON input must be decoded UTF-8 text.');
    return parseJsonRecords(input);
  }
  if (typeof input === 'string') throw new Error('Parquet input must be binary data.');
  return parseParquetRecords(input);
}

export function createDemoAnalytics(
  input: string | ParsedRecords,
  options: DemoAnalyticsOptions = {}
): DemoAnalyticsSnapshot {
  const records = typeof input === 'string' ? parseCsv(input) : input;
  if (records.headers.length === 0 || records.rows.length === 0) {
    throw new Error('Demo analytics requires at least one column and one row.');
  }

  const runId = options.runId ?? 'demo-run-20260915';
  const projectName = options.projectName ?? 'Customer Revenue Recovery';
  const sourceIdentifier = options.sourceIdentifier ?? 'samples/customer_revenue_quality_demo.csv';
  const sourceMode = options.sourceMode ?? 'volume_file';
  const sourceFormat = options.sourceFormat ?? 'csv';
  const targetIdentifier = options.targetIdentifier ?? null;
  const startedAtDate = new Date(options.startedAt ?? DEFAULT_STARTED_AT);
  if (Number.isNaN(startedAtDate.getTime())) throw new Error('startedAt must be a valid timestamp.');
  const startedAt = startedAtDate.toISOString();
  const updatedAt = new Date(startedAtDate.getTime() + 4 * 60 * 1000).toISOString();

  const sourceTypes = new Map(
    records.headers.map((header) => [header, inferSourceType(records.rows.map((row) => row[header] ?? ''))])
  );
  const analyzedRows = records.rows.map((row) =>
    records.headers.map((header) => analyzeCell(header, row[header] ?? ''))
  );
  const allCells = analyzedRows.flat();

  const issueCells = allCells.filter((cell) => cell.qualityIssue !== 'valid').length;
  const transformedCells = allCells.filter((cell) => cell.wasTransformed).length;
  const cellCount = allCells.length;
  const validCells = cellCount - issueCells;
  const quarantinedRows = analyzedRows.filter((row) => row.some((cell) => cell.qualityIssue !== 'valid')).length;

  const schemaMapping: DemoDataRow[] = records.headers.map((sourceColumn, index) => {
    const targetColumn = targetName(sourceColumn);
    const mappingConfidence = targetColumn === sourceColumn.toLowerCase() ? 0.99 : 0.94;
    const sourceType = sourceTypes.get(sourceColumn) ?? 'string';
    return {
      ordinal: index + 1,
      source_column: sourceColumn,
      target_column: targetColumn,
      source_type: sourceType,
      target_type: sourceType,
      confidence_pct: round(100 * mappingConfidence, 1),
      name_comparison: sourceColumn === targetColumn ? 'EXACT_NAME' : 'NORMALIZED_NAME',
      type_comparison: 'TYPE_MATCH',
      review_status: mappingConfidence >= 0.95 ? 'AUTO_MAPPED' : 'REVIEW_REQUIRED',
      profiled_at: startedAt,
    };
  });
  const mappingConfidence = round(
    schemaMapping.reduce((sum, row) => sum + Number(row.confidence_pct), 0) / schemaMapping.length,
    1
  );

  const qualityByColumn: DemoDataRow[] = records.headers
    .map((columnName) => {
      const cells = allCells.filter((cell) => cell.columnName === columnName);
      const missingCount = cells.filter((cell) => cell.qualityIssue === 'missing').length;
      const columnIssueCount = cells.filter((cell) => cell.qualityIssue !== 'valid').length;
      const columnTransformedCount = cells.filter((cell) => cell.wasTransformed).length;
      const qualityScore = round((100 * (cells.length - columnIssueCount)) / cells.length, 1);
      return {
        column_name: columnName,
        source_type: sourceTypes.get(columnName) ?? 'string',
        cell_count: cells.length,
        missing_count: missingCount,
        issue_count: columnIssueCount,
        transformed_count: columnTransformedCount,
        quality_score: qualityScore,
        completeness_pct: round((100 * (cells.length - missingCount)) / cells.length, 1),
        health_status: qualityScore >= 95 ? 'HEALTHY' : qualityScore >= 90 ? 'REVIEW' : 'CRITICAL',
      };
    })
    .sort(
      (left, right) =>
        Number(left.quality_score) - Number(right.quality_score) ||
        Number(right.issue_count) - Number(left.issue_count) ||
        String(left.column_name).localeCompare(String(right.column_name))
    );

  const issueCounts = new Map<string, number>();
  allCells.forEach((cell) => issueCounts.set(cell.qualityIssue, (issueCounts.get(cell.qualityIssue) ?? 0) + 1));
  const issueDistribution: DemoDataRow[] = [...issueCounts.entries()]
    .map(([issue, count]) => ({
      quality_issue: issue,
      issue_label: issueLabel(issue),
      issue_count: count,
      share_pct: round((100 * count) / cellCount, 1),
      is_issue: issue !== 'valid',
    }))
    .sort((left, right) => {
      if (Boolean(left.is_issue) !== Boolean(right.is_issue)) return left.is_issue ? -1 : 1;
      return (
        Number(right.issue_count) - Number(left.issue_count) ||
        String(left.quality_issue).localeCompare(String(right.quality_issue))
      );
    });

  const transformationGroups = new Map<string, { evaluated: number; changed: number }>();
  allCells.forEach((cell) => {
    const group = transformationGroups.get(cell.transformation) ?? { evaluated: 0, changed: 0 };
    group.evaluated += 1;
    if (cell.wasTransformed) group.changed += 1;
    transformationGroups.set(cell.transformation, group);
  });
  const transformationSummary: DemoDataRow[] = [...transformationGroups.entries()]
    .map(([transformation, counts]) => ({
      transformation,
      evaluated_cells: counts.evaluated,
      changed_cells: counts.changed,
      change_rate_pct: round((100 * counts.changed) / counts.evaluated, 1),
      action_status: counts.changed > 0 ? 'APPLIED' : 'NO_CHANGE',
    }))
    .sort(
      (left, right) =>
        Number(right.changed_cells) - Number(left.changed_cells) ||
        Number(right.evaluated_cells) - Number(left.evaluated_cells) ||
        String(left.transformation).localeCompare(String(right.transformation))
    );

  const cleanedRecords: DemoDataRow[] = analyzedRows
    .map((cells, index) => {
      const cleanedRecord = Object.fromEntries(cells.map((cell) => [cell.columnName, cell.cleanValue]));
      const recordIssueCount = cells.filter((cell) => cell.qualityIssue !== 'valid').length;
      const recordTransformedCount = cells.filter((cell) => cell.wasTransformed).length;
      const quarantined = recordIssueCount > 0;
      return {
        record_id: String(index + 1),
        cleaned_record_json: JSON.stringify(cleanedRecord),
        issue_count: recordIssueCount,
        transformed_count: recordTransformedCount,
        is_quarantined: quarantined,
        record_status: quarantined ? 'QUARANTINED' : 'READY',
        cleaned_at: updatedAt,
      };
    })
    .sort(
      (left, right) =>
        Number(Boolean(right.is_quarantined)) - Number(Boolean(left.is_quarantined)) ||
        Number(right.issue_count) - Number(left.issue_count) ||
        Number(left.record_id) - Number(right.record_id)
    );

  const commerceGroups = new Map<string, { orders: number; revenue: number; delivered: number }>();
  let totalOrderValue = 0;
  let nonDeliveredRevenueAtRisk = 0;
  let quarantinedOrderValue = 0;
  let unpricedOrders = 0;
  analyzedRows.forEach((cells) => {
    const cellMap = new Map(cells.map((cell) => [cell.columnName, cell]));
    const category = cellMap.get('category')?.cleanValue ?? 'Uncategorized';
    const quantity = parseNumber(cellMap.get('quantity')?.cleanValue ?? '');
    const unitPrice = parseNumber(cellMap.get('unit_price')?.cleanValue ?? '');
    const status = cellMap.get('order_status')?.cleanValue ?? '';
    const revenue = quantity === null || unitPrice === null ? null : round(quantity * unitPrice, 2);
    const delivered = status.toLowerCase() === 'delivered';
    const quarantined = cells.some((cell) => cell.qualityIssue !== 'valid');
    const group = commerceGroups.get(category) ?? { orders: 0, revenue: 0, delivered: 0 };
    group.orders += 1;
    if (revenue === null) unpricedOrders += 1;
    else {
      group.revenue += revenue;
      totalOrderValue += revenue;
      if (!delivered) nonDeliveredRevenueAtRisk += revenue;
      if (quarantined) quarantinedOrderValue += revenue;
    }
    if (delivered) group.delivered += 1;
    commerceGroups.set(category, group);
  });
  const commercePerformance: DemoDataRow[] = [...commerceGroups.entries()]
    .map(([category, values]) => ({
      category,
      order_count: values.orders,
      revenue: round(values.revenue, 2),
      delivered_orders: values.delivered,
      revenue_per_order: round(values.revenue / values.orders, 2),
      delivery_rate_pct: round((100 * values.delivered) / values.orders, 1),
    }))
    .sort(
      (left, right) =>
        Number(right.revenue) - Number(left.revenue) || String(left.category).localeCompare(String(right.category))
    );

  const dashboardKpis: DemoDataRow[] = [
    {
      run_id: runId,
      project_name: projectName,
      source_mode: sourceMode,
      source_format: sourceFormat,
      source_identifier: sourceIdentifier,
      row_count: records.rows.length,
      column_count: records.headers.length,
      cell_count: cellCount,
      valid_cells: validCells,
      issue_cells: issueCells,
      transformed_cells: transformedCells,
      quality_score: round((100 * validCells) / cellCount, 1),
      mapped_columns: schemaMapping.length,
      mapping_confidence_pct: mappingConfidence,
      cleaned_rows: records.rows.length,
      quarantined_rows: quarantinedRows,
      run_status: 'COMPLETED',
      started_at: startedAt,
      updated_at: updatedAt,
    },
  ];

  const recentRuns: DemoDataRow[] = [
    {
      run_id: runId,
      project_name: projectName,
      source_mode: sourceMode,
      source_format: sourceFormat,
      source_identifier: sourceIdentifier,
      row_count: records.rows.length,
      column_count: records.headers.length,
      quality_score: round((100 * validCells) / cellCount, 1),
      mapping_confidence_pct: mappingConfidence,
      quarantined_rows: quarantinedRows,
      run_status: 'COMPLETED',
      started_at: startedAt,
      updated_at: updatedAt,
    },
  ];

  const databaseInventory: DemoDataRow[] = [
    {
      schema_name: 'dataone_bronze',
      data_layer: 'INGEST',
      table_count: 1,
      materialized_view_count: 0,
      managed_table_count: 1,
      column_count: 9,
      assets: 'ingested_cells',
    },
    {
      schema_name: 'dataone_silver',
      data_layer: 'STANDARDIZE',
      table_count: 0,
      materialized_view_count: 0,
      managed_table_count: 0,
      column_count: 0,
      assets: '',
    },
    {
      schema_name: 'dataone_gold',
      data_layer: 'SERVE',
      table_count: 7,
      materialized_view_count: 6,
      managed_table_count: 1,
      column_count: 63,
      assets:
        'clean_cells, cleaned_records, commerce_performance, quality_by_column, quality_issue_distribution, quality_summary, schema_mapping',
    },
    {
      schema_name: 'dataone_ops',
      data_layer: 'CONTROL',
      table_count: 2,
      materialized_view_count: 0,
      managed_table_count: 2,
      column_count: 23,
      assets: 'project_runs, schema_profiles',
    },
  ];

  const isDatabaseJourney = sourceMode === 'database_connection';
  const isLiveLocalDatabaseJourney = isDatabaseJourney && options.sourceConnectionLive === true;
  const isLiveLocalTargetJourney = isDatabaseJourney && options.targetConnectionLive === true;
  const bronzeSource = isDatabaseJourney
    ? 'workspace.dataone_bronze.mysql_commerce_orders'
    : 'workspace.dataone_bronze.ingested_cells';
  const topologyInventory: DemoDataRow[] = [
    {
      edge_order: 1,
      run_id: runId,
      source_node: sourceIdentifier,
      target_node: bronzeSource,
      operation: isDatabaseJourney ? 'CDC_INGEST' : 'INGEST_AND_PROFILE',
      databricks_component: isLiveLocalDatabaseJourney
        ? 'Local MySQL connector · live read'
        : isDatabaseJourney
          ? 'Lakeflow Connect · simulated'
          : 'Lakeflow Job',
      governance_state: 'CAPTURED',
    },
    {
      edge_order: 2,
      run_id: runId,
      source_node: bronzeSource,
      target_node: 'workspace.dataone_gold.clean_cells',
      operation: 'CLEAN_AND_CLASSIFY',
      databricks_component: 'Lakeflow Pipeline',
      governance_state: 'GOVERNED',
    },
    {
      edge_order: 3,
      run_id: runId,
      source_node: 'workspace.dataone_gold.clean_cells',
      target_node: 'workspace.dataone_gold.quality_summary',
      operation: 'AGGREGATE_QUALITY',
      databricks_component: 'Lakeflow Pipeline',
      governance_state: 'PUBLISHED',
    },
    {
      edge_order: 4,
      run_id: runId,
      source_node: 'workspace.dataone_gold.clean_cells',
      target_node: 'workspace.dataone_gold.cleaned_records',
      operation: 'ASSEMBLE_RECORDS',
      databricks_component: 'Lakeflow Pipeline',
      governance_state: 'PUBLISHED',
    },
    {
      edge_order: 5,
      run_id: runId,
      source_node: 'workspace.dataone_ops.schema_profiles',
      target_node: 'workspace.dataone_gold.schema_mapping',
      operation: 'PUBLISH_SCHEMA_CONTRACT',
      databricks_component: 'Unity Catalog',
      governance_state: 'PUBLISHED',
    },
    {
      edge_order: 6,
      run_id: runId,
      source_node: 'workspace.dataone_gold.clean_cells',
      target_node: 'workspace.dataone_gold.commerce_performance',
      operation: 'BUILD_ANALYTICS',
      databricks_component: 'SQL Warehouse',
      governance_state: 'PUBLISHED',
    },
    ...(targetIdentifier
      ? [
          {
            edge_order: 7,
            run_id: runId,
            source_node: 'workspace.dataone_gold.commerce_performance',
            target_node: targetIdentifier,
            operation: 'PUBLISH_ANALYTICS',
            databricks_component: 'Lakeflow Job export · simulated',
            governance_state: 'READY_FOR_EXPORT',
          },
        ]
      : []),
  ];

  return {
    runId,
    projectName,
    sourceIdentifier,
    sourceMode,
    sourceFormat,
    targetIdentifier,
    startedAt,
    updatedAt,
    story: {
      problem: isDatabaseJourney
        ? isLiveLocalDatabaseJourney
          ? 'A live local MySQL source must be profiled and standardized before governed analytics publication.'
          : 'A simulated MySQL commerce source contains malformed customer fields and failed high-value orders before publication to analytics.'
        : 'A paid-campaign order export contains malformed customer fields and failed high-value orders, putting revenue and trust at risk.',
      action: isDatabaseJourney
        ? isLiveLocalDatabaseJourney && isLiveLocalTargetJourney
          ? 'Read the source through protected localhost connectors, standardize safe values, retain quality evidence separately, and publish the transformed columns to PostgreSQL.'
          : isLiveLocalDatabaseJourney
            ? 'Read the source through the protected localhost connector, standardize safe values, quarantine invalid rows, and stage approved results for the simulated target.'
            : 'Use governed connection aliases, standardize safe values, quarantine invalid rows, and stage approved results for the simulated PostgreSQL target.'
        : 'Standardize safe values, quarantine invalid records for review, and prioritize recovery of failed or cancelled orders.',
      totalOrderValue: round(totalOrderValue, 2),
      nonDeliveredRevenueAtRisk: round(nonDeliveredRevenueAtRisk, 2),
      quarantinedOrderValue: round(quarantinedOrderValue, 2),
      quarantinedRecords: quarantinedRows,
      unpricedOrders,
    },
    queries: {
      dashboard_kpis: dashboardKpis,
      quality_by_column: qualityByColumn,
      quality_issue_distribution: issueDistribution,
      transformation_summary: transformationSummary,
      schema_mapping: schemaMapping,
      database_inventory: databaseInventory,
      commerce_performance: commercePerformance,
      cleaned_records: cleanedRecords,
      topology_inventory: topologyInventory,
      recent_runs: recentRuns,
    },
  };
}

export function createDemoJobRun(
  runId: number,
  stage: DemoJobStage,
  options: { startedAtMs?: number; workflowLabel?: string; includePublishTask?: boolean; targetLive?: boolean } = {}
): DemoJobRun {
  const includePublishTask = options.includePublishTask ?? false;
  if (stage === 'PUBLISHING' && !includePublishTask) {
    throw new Error('PUBLISHING requires includePublishTask for the simulated database journey.');
  }
  const startTime = options.startedAtMs ?? Date.UTC(2026, 8, 15, 9, 30, 0);
  const profileSucceeded = stage === 'PIPELINE' || stage === 'PUBLISHING' || stage === 'SUCCEEDED';
  const pipelineSucceeded = stage === 'PUBLISHING' || stage === 'SUCCEEDED';
  const runFinished = stage === 'SUCCEEDED' || stage === 'FAILED';

  return {
    run_id: runId,
    run_name: `${options.workflowLabel ?? 'DataOne local file demo'} ${runId}`,
    start_time: startTime,
    ...(runFinished ? { end_time: startTime + (includePublishTask ? 5_000 : 4_000) } : {}),
    state:
      stage === 'SUCCEEDED'
        ? {
            life_cycle_state: 'TERMINATED',
            result_state: 'SUCCESS',
            state_message: options.targetLive
              ? 'Local transformation completed and PostgreSQL storage was verified; no Databricks resource was called.'
              : 'Local deterministic demo completed; no Databricks resource was called.',
          }
        : stage === 'FAILED'
          ? {
              life_cycle_state: 'TERMINATED',
              result_state: 'FAILED',
              state_message: 'The local deterministic demo was intentionally marked failed.',
            }
          : {
              life_cycle_state: stage === 'PENDING' ? 'PENDING' : 'RUNNING',
              state_message:
                stage === 'PIPELINE'
                  ? 'Simulating the Lakeflow Pipeline stage.'
                  : stage === 'PUBLISHING'
                    ? options.targetLive
                      ? 'Publishing transformed records to local PostgreSQL.'
                      : 'Simulating controlled publication to the target connection alias.'
                    : 'Simulating source profiling.',
            },
    tasks: [
      {
        task_key: 'profile_source',
        state:
          stage === 'FAILED'
            ? {
                life_cycle_state: 'TERMINATED',
                result_state: 'FAILED',
                state_message: 'Local profiling simulation failed.',
              }
            : profileSucceeded
              ? {
                  life_cycle_state: 'TERMINATED',
                  result_state: 'SUCCESS',
                  state_message: 'Local profiling simulation completed.',
                }
              : {
                  life_cycle_state: stage === 'PROFILING' ? 'RUNNING' : 'PENDING',
                  state_message:
                    stage === 'PROFILING' ? 'Profiling the selected demo source.' : 'Waiting to profile the source.',
                },
      },
      {
        task_key: 'quality_pipeline',
        state: pipelineSucceeded
          ? {
              life_cycle_state: 'TERMINATED',
              result_state: 'SUCCESS',
              state_message: 'Local quality simulation completed.',
            }
          : stage === 'PIPELINE'
            ? {
                life_cycle_state: 'RUNNING',
                state_message: 'Computing deterministic quality and mapping fixtures.',
              }
            : {
                life_cycle_state: stage === 'FAILED' ? 'SKIPPED' : 'PENDING',
                ...(stage === 'FAILED' ? { result_state: 'SKIPPED' } : {}),
                state_message: stage === 'FAILED' ? 'Skipped after profiling failure.' : 'Waiting for profiling.',
              },
      },
      ...(includePublishTask
        ? [
            {
              task_key: 'publish_target' as const,
              state:
                stage === 'SUCCEEDED'
                  ? {
                      life_cycle_state: 'TERMINATED',
                      result_state: 'SUCCESS',
                      state_message: options.targetLive
                        ? 'Transformed records were verified in the local PostgreSQL target.'
                        : 'Controlled target publication simulation completed.',
                    }
                  : stage === 'PUBLISHING'
                    ? {
                        life_cycle_state: 'RUNNING',
                        state_message: options.targetLive
                          ? 'Publishing transformed columns to the local PostgreSQL target.'
                          : 'Publishing through the governed PostgreSQL target alias.',
                      }
                    : {
                        life_cycle_state: stage === 'FAILED' ? 'SKIPPED' : 'PENDING',
                        ...(stage === 'FAILED' ? { result_state: 'SKIPPED' } : {}),
                        state_message:
                          stage === 'FAILED' ? 'Skipped after an upstream failure.' : 'Waiting for quality checks.',
                      },
            },
          ]
        : []),
    ],
  };
}
