export type VisualizationChartType = 'bar' | 'horizontal-bar' | 'line' | 'area' | 'pie' | 'donut' | 'scatter';
export type VisualizationAggregation = 'sum' | 'average' | 'count' | 'min' | 'max' | 'percentage';
export type VisualizationFilterOperator = '=' | '!=' | '<' | '<=' | '>' | '>=';

export type VisualizationFieldKind = 'dimension' | 'measure' | 'time';
export type VisualizationValue = string | number | boolean | null;
export type VisualizationRow = Record<string, VisualizationValue>;

export interface VisualizationField {
  key: string;
  label: string;
  kind: VisualizationFieldKind;
}

export interface NormalizedVisualizationData {
  rows: VisualizationRow[];
  fields: VisualizationField[];
}

export interface VisualizationSelection {
  xKey: string | null;
  yKey: string | null;
}

export interface VisualizationFilter {
  id: string;
  fieldKey: string;
  operator: VisualizationFilterOperator;
  value: string;
}

export interface PreparedVisualizationData {
  rows: VisualizationRow[];
  droppedRowCount: number;
  filteredOutRowCount: number;
  aggregated: boolean;
  error: string | null;
}

export interface NormalizeVisualizationOptions {
  labels?: Readonly<Record<string, string>>;
  kinds?: Readonly<Partial<Record<string, VisualizationFieldKind>>>;
  exclude?: readonly string[];
}

export interface VisualizationDatasetInput {
  id: string;
  label: string;
  source: string;
  rows: readonly Record<string, unknown>[];
  loading: boolean;
  error: string | null;
  warehouseStatus?: { state: string; elapsedMs: number } | null;
  defaultChartType: VisualizationChartType;
  defaultXKey: string;
  defaultYKey: string;
  defaultTitle: string;
  normalize?: NormalizeVisualizationOptions;
  warning?: string;
}

export const VISUALIZATION_CHART_TYPES = [
  { value: 'bar', label: 'Bar chart' },
  { value: 'horizontal-bar', label: 'Horizontal bar' },
  { value: 'line', label: 'Line / time series' },
  { value: 'area', label: 'Area / time series' },
  { value: 'pie', label: 'Pie chart' },
  { value: 'donut', label: 'Donut chart' },
  { value: 'scatter', label: 'Scatter plot' },
] as const satisfies ReadonlyArray<{ value: VisualizationChartType; label: string }>;

export const VISUALIZATION_AGGREGATIONS = [
  { value: 'sum', label: 'Sum' },
  { value: 'average', label: 'Average' },
  { value: 'count', label: 'Count (non-empty values)' },
  { value: 'min', label: 'Minimum' },
  { value: 'max', label: 'Maximum' },
  { value: 'percentage', label: 'Percentage of total (sum)' },
] as const satisfies ReadonlyArray<{ value: VisualizationAggregation; label: string }>;

export const VISUALIZATION_FILTER_OPERATORS = [
  { value: '=', label: 'Equal to (=)' },
  { value: '!=', label: 'Not equal to (!=)' },
  { value: '<', label: 'Less than (<)' },
  { value: '<=', label: 'Less than or equal to (<=)' },
  { value: '>', label: 'Greater than (>)' },
  { value: '>=', label: 'Greater than or equal to (>=)' },
] as const satisfies ReadonlyArray<{ value: VisualizationFilterOperator; label: string }>;

function isIdentifierField(key: string): boolean {
  return /(^|[_-])id$/i.test(key) || /^id$/i.test(key);
}

function isTimeFieldName(key: string): boolean {
  return /(^|[_-])(date|time|timestamp|datetime|created|updated|started|ended|at)$/i.test(key);
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function supportedValue(value: unknown): VisualizationValue | undefined {
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') {
    const numeric = Number(value);
    return Number.isSafeInteger(numeric) ? numeric : value.toString();
  }
  if (value instanceof Date) return value.toISOString();
  return undefined;
}

export function fieldLabel(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .trim();
}

function inferFieldKind(key: string, values: VisualizationValue[]): VisualizationFieldKind {
  if (isIdentifierField(key)) return 'dimension';

  if (isTimeFieldName(key)) {
    const hasValidDate = values.some((value) => typeof value === 'string' && !Number.isNaN(Date.parse(value)));
    if (hasValidDate) return 'time';
  }

  const numericValueCount = values.filter((value) => finiteNumber(value) != null).length;
  if (numericValueCount > 0 && numericValueCount / values.length >= 0.5) return 'measure';
  return 'dimension';
}

function timeValue(value: VisualizationValue | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN;
  if (typeof value !== 'string') return Number.NaN;
  return Date.parse(value);
}

export function normalizeVisualizationRows(
  rawRows: readonly Record<string, unknown>[],
  options: NormalizeVisualizationOptions = {}
): NormalizedVisualizationData {
  const excluded = new Set(options.exclude ?? []);
  const fieldKeys: string[] = [];

  for (const row of rawRows) {
    for (const key of Object.keys(row)) {
      if (!excluded.has(key) && !fieldKeys.includes(key) && supportedValue(row[key]) !== undefined) {
        fieldKeys.push(key);
      }
    }
  }

  const fields = fieldKeys
    .map((key): VisualizationField | null => {
      const values = rawRows
        .map((row) => supportedValue(row[key]))
        .filter((value): value is VisualizationValue => value !== undefined && value !== null && value !== '');
      if (values.length === 0) return null;
      return {
        key,
        label: options.labels?.[key] ?? fieldLabel(key),
        kind: options.kinds?.[key] ?? inferFieldKind(key, values),
      };
    })
    .filter((field): field is VisualizationField => field !== null);

  const rows = rawRows.map((rawRow) => {
    const row: VisualizationRow = {};
    for (const field of fields) {
      const value = supportedValue(rawRow[field.key]);
      if (value === undefined || value === null || value === '') {
        row[field.key] = null;
      } else if (field.kind === 'measure') {
        row[field.key] = finiteNumber(value);
      } else if (typeof value === 'boolean') {
        row[field.key] = value ? 'True' : 'False';
      } else {
        row[field.key] = value;
      }
    }
    return row;
  });

  return { rows, fields };
}

export function compatibleXFields(
  fields: readonly VisualizationField[],
  chartType: VisualizationChartType
): VisualizationField[] {
  if (chartType === 'scatter') return fields.filter((field) => field.kind === 'measure');
  return [...fields];
}

export function compatibleYFields(
  fields: readonly VisualizationField[],
  xKey: string | null,
  aggregation: VisualizationAggregation = 'sum'
): VisualizationField[] {
  const candidates = aggregation === 'count' ? fields : fields.filter((field) => field.kind === 'measure');
  return candidates.filter((field) => field.key !== xKey);
}

export function isChartTypeCompatible(
  fields: readonly VisualizationField[],
  chartType: VisualizationChartType,
  aggregation: VisualizationAggregation = 'sum'
): boolean {
  return compatibleXFields(fields, chartType).some(
    (field) => compatibleYFields(fields, field.key, aggregation).length > 0
  );
}

export function reconcileVisualizationSelection(
  fields: readonly VisualizationField[],
  chartType: VisualizationChartType,
  preferredXKey?: string | null,
  preferredYKey?: string | null,
  aggregation: VisualizationAggregation = 'sum'
): VisualizationSelection {
  const xFields = compatibleXFields(fields, chartType);
  const preferredX = xFields.find(
    (field) => field.key === preferredXKey && compatibleYFields(fields, field.key, aggregation).length > 0
  );
  const validFallbackXFields = xFields.filter((field) => compatibleYFields(fields, field.key, aggregation).length > 0);
  const preservesPreferredY = (field: VisualizationField) =>
    compatibleYFields(fields, field.key, aggregation).some((candidate) => candidate.key === preferredYKey);
  const fallbackXPreservingY =
    validFallbackXFields.find((field) => field.kind !== 'measure' && preservesPreferredY(field)) ??
    validFallbackXFields.find(preservesPreferredY);
  const fallbackX =
    fallbackXPreservingY ?? validFallbackXFields.find((field) => field.kind !== 'measure') ?? validFallbackXFields[0];
  const xKey = preferredX?.key ?? fallbackX?.key ?? null;
  const yFields = compatibleYFields(fields, xKey, aggregation);
  const yKey = yFields.some((field) => field.key === preferredYKey)
    ? (preferredYKey ?? null)
    : (yFields[0]?.key ?? null);
  return { xKey, yKey };
}

export function suggestedVisualizationTitle(
  chartType: VisualizationChartType,
  xField: VisualizationField | undefined,
  yField: VisualizationField | undefined,
  aggregation: VisualizationAggregation = 'sum'
): string {
  if (!xField || !yField) return 'Untitled visualization';
  const measureLabel =
    aggregation === 'percentage'
      ? `${yField.label} percentage of total`
      : `${VISUALIZATION_AGGREGATIONS.find((option) => option.value === aggregation)?.label.split(' (')[0] ?? aggregation} of ${yField.label}`;

  if (chartType === 'scatter') return `${measureLabel} versus ${xField.label}`;
  if ((chartType === 'line' || chartType === 'area') && xField.kind === 'time') {
    return `${measureLabel} over time`;
  }
  return `${measureLabel} by ${xField.label}`;
}

export function sortVisualizationRows(
  rows: readonly VisualizationRow[],
  xField: VisualizationField | undefined
): VisualizationRow[] {
  if (xField?.kind !== 'time') return [...rows];
  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const leftValue = left.row[xField.key];
      const rightValue = right.row[xField.key];
      const leftTime = timeValue(leftValue);
      const rightTime = timeValue(rightValue);
      if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) return left.index - right.index;
      if (Number.isNaN(leftTime)) return 1;
      if (Number.isNaN(rightTime)) return -1;
      return leftTime - rightTime || left.index - right.index;
    })
    .map(({ row }) => row);
}

export function compatibleFilterOperators(field: VisualizationField | undefined): VisualizationFilterOperator[] {
  if (!field || field.kind === 'dimension') return ['=', '!='];
  return VISUALIZATION_FILTER_OPERATORS.map((operator) => operator.value);
}

function compareFilterValue(
  rowValue: VisualizationValue | undefined,
  field: VisualizationField,
  filter: VisualizationFilter
): { matches: boolean; error: string | null } {
  if (filter.value.trim() === '') {
    return { matches: false, error: `Enter a value for the ${field.label} filter.` };
  }
  if (!compatibleFilterOperators(field).includes(filter.operator)) {
    return {
      matches: false,
      error: `${filter.operator} is only available for numeric or date columns. Choose = or != for ${field.label}.`,
    };
  }
  if (rowValue == null) return { matches: false, error: null };

  let comparison: number;
  if (field.kind === 'measure') {
    const left = finiteNumber(rowValue);
    const right = finiteNumber(filter.value);
    if (right == null) {
      return { matches: false, error: `Enter a valid number for the ${field.label} filter.` };
    }
    if (left == null) return { matches: false, error: null };
    comparison = left - right;
  } else if (field.kind === 'time') {
    const left = timeValue(rowValue);
    const right = Date.parse(filter.value);
    if (Number.isNaN(right)) {
      return { matches: false, error: `Enter a valid date or timestamp for the ${field.label} filter.` };
    }
    if (Number.isNaN(left)) return { matches: false, error: null };
    comparison = left - right;
  } else {
    comparison = String(rowValue).localeCompare(filter.value.trim(), undefined, { sensitivity: 'base' });
  }

  if (filter.operator === '=') return { matches: comparison === 0, error: null };
  if (filter.operator === '!=') return { matches: comparison !== 0, error: null };
  if (filter.operator === '<') return { matches: comparison < 0, error: null };
  if (filter.operator === '<=') return { matches: comparison <= 0, error: null };
  if (filter.operator === '>') return { matches: comparison > 0, error: null };
  return { matches: comparison >= 0, error: null };
}

export function applyVisualizationFilters(
  rows: readonly VisualizationRow[],
  fields: readonly VisualizationField[],
  filters: readonly VisualizationFilter[]
): { rows: VisualizationRow[]; filteredOutRowCount: number; error: string | null } {
  let filteredRows = [...rows];

  for (const filter of filters) {
    const field = fields.find((candidate) => candidate.key === filter.fieldKey);
    if (!field) {
      return {
        rows: [],
        filteredOutRowCount: rows.length,
        error: 'A selected filter column is no longer available. Remove the filter and add it again.',
      };
    }

    const nextRows: VisualizationRow[] = [];
    for (const row of filteredRows) {
      const result = compareFilterValue(row[field.key], field, filter);
      if (result.error) {
        return { rows: [], filteredOutRowCount: rows.length, error: result.error };
      }
      if (result.matches) nextRows.push(row);
    }
    filteredRows = nextRows;
  }

  return {
    rows: filteredRows,
    filteredOutRowCount: rows.length - filteredRows.length,
    error: null,
  };
}

function validXValue(
  value: VisualizationValue | undefined,
  xField: VisualizationField,
  chartType: VisualizationChartType
): value is string | number {
  if (chartType === 'scatter') return typeof value === 'number' && Number.isFinite(value);
  if (xField.kind === 'time') return !Number.isNaN(timeValue(value));
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
}

export function prepareVisualizationRows(
  rows: readonly VisualizationRow[],
  chartType: VisualizationChartType,
  xField: VisualizationField | undefined,
  yField: VisualizationField | undefined,
  aggregation: VisualizationAggregation = 'sum',
  filters: readonly VisualizationFilter[] = [],
  fields: readonly VisualizationField[] = []
): PreparedVisualizationData {
  if (!xField || !yField) {
    return { rows: [], droppedRowCount: rows.length, filteredOutRowCount: 0, aggregated: false, error: null };
  }

  const filtered = applyVisualizationFilters(rows, fields.length > 0 ? fields : [xField, yField], filters);
  if (filtered.error) {
    return {
      rows: [],
      droppedRowCount: 0,
      filteredOutRowCount: filtered.filteredOutRowCount,
      aggregated: false,
      error: filtered.error,
    };
  }

  const groups = new Map<string, { xValue: string | number; numericValues: number[]; count: number }>();
  let droppedRowCount = 0;

  for (const row of sortVisualizationRows(filtered.rows, xField)) {
    const xValue = row[xField.key];
    const yValue = row[yField.key];

    if (!validXValue(xValue, xField, chartType)) {
      droppedRowCount += 1;
      continue;
    }

    const groupKey = `${typeof xValue}:${String(xValue)}`;
    const group = groups.get(groupKey) ?? { xValue, numericValues: [], count: 0 };
    if (yValue !== null && yValue !== undefined && yValue !== '') group.count += 1;

    if (aggregation !== 'count') {
      if (typeof yValue !== 'number' || !Number.isFinite(yValue)) {
        droppedRowCount += 1;
        groups.set(groupKey, group);
        continue;
      }
      group.numericValues.push(yValue);
    }
    groups.set(groupKey, group);
  }

  const aggregatedRows: VisualizationRow[] = [];
  for (const group of groups.values()) {
    const values = group.numericValues;
    if (aggregation !== 'count' && values.length === 0) continue;
    let aggregate: number;
    if (aggregation === 'count') aggregate = group.count;
    else if (aggregation === 'average') aggregate = values.reduce((sum, value) => sum + value, 0) / values.length;
    else if (aggregation === 'min') aggregate = Math.min(...values);
    else if (aggregation === 'max') aggregate = Math.max(...values);
    else aggregate = values.reduce((sum, value) => sum + value, 0);
    aggregatedRows.push({ [xField.key]: group.xValue, [yField.key]: aggregate });
  }

  if (aggregation === 'percentage') {
    if (aggregatedRows.some((row) => Number(row[yField.key]) < 0)) {
      return {
        rows: [],
        droppedRowCount,
        filteredOutRowCount: filtered.filteredOutRowCount,
        aggregated: true,
        error: 'Percentage of total requires non-negative values in the selected Y column.',
      };
    }
    const total = aggregatedRows.reduce((sum, row) => sum + Number(row[yField.key]), 0);
    if (total <= 0) {
      return {
        rows: [],
        droppedRowCount,
        filteredOutRowCount: filtered.filteredOutRowCount,
        aggregated: true,
        error: 'Percentage of total requires a positive sum in the selected Y column.',
      };
    }
    for (const row of aggregatedRows) {
      row[yField.key] = Number(((Number(row[yField.key]) / total) * 100).toFixed(2));
    }
  }

  if ((chartType === 'pie' || chartType === 'donut') && aggregatedRows.some((row) => Number(row[yField.key]) < 0)) {
    return {
      rows: [],
      droppedRowCount,
      filteredOutRowCount: filtered.filteredOutRowCount,
      aggregated: true,
      error: 'Pie and donut charts cannot represent negative values. Choose a bar or line chart instead.',
    };
  }

  if (chartType === 'pie' || chartType === 'donut') {
    const total = aggregatedRows.reduce((sum, row) => sum + Number(row[yField.key]), 0);
    if (total <= 0) {
      return {
        rows: [],
        droppedRowCount,
        filteredOutRowCount: filtered.filteredOutRowCount,
        aggregated: true,
        error: 'Pie and donut charts require a positive total. Choose another Y column, measure, or graph type.',
      };
    }
  }

  return {
    rows: aggregatedRows,
    droppedRowCount,
    filteredOutRowCount: filtered.filteredOutRowCount,
    aggregated: true,
    error: null,
  };
}
