import { describe, expect, it } from 'vitest';
import {
  applyVisualizationFilters,
  compatibleFilterOperators,
  compatibleXFields,
  compatibleYFields,
  isChartTypeCompatible,
  normalizeVisualizationRows,
  prepareVisualizationRows,
  reconcileVisualizationSelection,
  sortVisualizationRows,
  suggestedVisualizationTitle,
} from './visualizationBuilderModel.js';

describe('visualization builder model', () => {
  it('infers identifiers, numeric measures, and timestamps without losing nulls', () => {
    const normalized = normalizeVisualizationRows([
      { customer_id: '1001', category: 'Enterprise', revenue: '1250.50', updated_at: '2026-09-02T10:00:00Z' },
      { customer_id: '1002', category: 'Starter', revenue: 450, updated_at: '2026-09-01T10:00:00Z' },
      { customer_id: '1003', category: 'Starter', revenue: null, updated_at: null },
    ]);

    expect(normalized.fields).toEqual([
      { key: 'customer_id', label: 'Customer Id', kind: 'dimension' },
      { key: 'category', label: 'Category', kind: 'dimension' },
      { key: 'revenue', label: 'Revenue', kind: 'measure' },
      { key: 'updated_at', label: 'Updated At', kind: 'time' },
    ]);
    expect(normalized.rows[0]?.revenue).toBe(1250.5);
    expect(normalized.rows[2]?.revenue).toBeNull();
  });

  it('keeps a mostly numeric dirty column available as a measure and nulls invalid values', () => {
    const normalized = normalizeVisualizationRows([
      { category: 'A', revenue: '10' },
      { category: 'B', revenue: 'N/A' },
    ]);

    expect(normalized.fields.find((field) => field.key === 'revenue')?.kind).toBe('measure');
    expect(normalized.rows.map((row) => row.revenue)).toEqual([10, null]);
  });

  it('selects two different numeric fields for a scatter plot', () => {
    const { fields } = normalizeVisualizationRows([{ label: 'A', quantity: 4, revenue: 125 }]);
    const selection = reconcileVisualizationSelection(fields, 'scatter', 'quantity', 'quantity');

    expect(selection).toEqual({ xKey: 'quantity', yKey: 'revenue' });
    expect(isChartTypeCompatible(fields, 'scatter')).toBe(true);
  });

  it('rejects a scatter plot when only one numeric field is available', () => {
    const { fields } = normalizeVisualizationRows([{ category: 'A', revenue: 125 }]);
    expect(isChartTypeCompatible(fields, 'scatter')).toBe(false);
  });

  it('allows a numeric X column while preventing the same measure on both axes', () => {
    const { fields } = normalizeVisualizationRows([{ quantity: 4, revenue: 125 }]);

    expect(compatibleXFields(fields, 'line').map((field) => field.key)).toEqual(['quantity', 'revenue']);
    expect(compatibleYFields(fields, 'quantity').map((field) => field.key)).toEqual(['revenue']);
    expect(isChartTypeCompatible(fields, 'line')).toBe(true);
  });

  it('falls back to a dimension for X when the first field is the only measure', () => {
    const { fields } = normalizeVisualizationRows([{ revenue: 125, category: 'Enterprise' }]);

    expect(reconcileVisualizationSelection(fields, 'bar')).toEqual({
      xKey: 'category',
      yKey: 'revenue',
    });
  });

  it('preserves the preferred Y column when choosing a fallback X column', () => {
    const { fields } = normalizeVisualizationRows([{ revenue: 125, quantity: 4, category: 'Enterprise' }]);

    expect(reconcileVisualizationSelection(fields, 'bar', 'missing', 'revenue')).toEqual({
      xKey: 'category',
      yKey: 'revenue',
    });
  });

  it('uses task-specific suggested titles', () => {
    const { fields } = normalizeVisualizationRows([
      { updated_at: '2026-09-01T10:00:00Z', quality_score: 92.6, category: 'A' },
    ]);
    const updatedAt = fields.find((field) => field.key === 'updated_at');
    const quality = fields.find((field) => field.key === 'quality_score');
    const category = fields.find((field) => field.key === 'category');

    expect(suggestedVisualizationTitle('line', updatedAt, quality, 'average')).toBe(
      'Average of Quality Score over time'
    );
    expect(suggestedVisualizationTitle('pie', category, quality, 'percentage')).toBe(
      'Quality Score percentage of total by Category'
    );
  });

  it('sorts time values left-to-right and places invalid timestamps last', () => {
    const { rows, fields } = normalizeVisualizationRows([
      { updated_at: '2026-09-03T00:00:00Z', score: 3 },
      { updated_at: 'invalid', score: 4 },
      { updated_at: '2026-09-01T00:00:00Z', score: 1 },
    ]);
    const sorted = sortVisualizationRows(
      rows,
      fields.find((field) => field.key === 'updated_at')
    );

    expect(sorted.map((row) => row.score)).toEqual([1, 3, 4]);
  });

  it('omits invalid timestamps from a time-series chart', () => {
    const normalized = normalizeVisualizationRows([
      { updated_at: '2026-09-03T00:00:00Z', score: 3 },
      { updated_at: 'invalid', score: 4 },
      { updated_at: '2026-09-01T00:00:00Z', score: 1 },
    ]);
    const prepared = prepareVisualizationRows(
      normalized.rows,
      'line',
      normalized.fields.find((field) => field.key === 'updated_at'),
      normalized.fields.find((field) => field.key === 'score')
    );

    expect(prepared.rows.map((row) => row.score)).toEqual([1, 3]);
    expect(prepared.droppedRowCount).toBe(1);
  });

  it('projects only selected fields and removes rows with non-numeric Y values', () => {
    const { rows, fields } = normalizeVisualizationRows([
      { category: 'A', revenue: 10, unrelated_timestamp: '2026-09-01T00:00:00Z' },
      { category: 'B', revenue: null, unrelated_timestamp: '2026-09-02T00:00:00Z' },
    ]);
    const prepared = prepareVisualizationRows(
      rows,
      'bar',
      fields.find((field) => field.key === 'category'),
      fields.find((field) => field.key === 'revenue')
    );

    expect(prepared.rows).toEqual([{ category: 'A', revenue: 10 }]);
    expect(prepared.droppedRowCount).toBe(1);
  });

  it('aggregates duplicate pie categories and rejects negative values', () => {
    const normalized = normalizeVisualizationRows([
      { category: 'A', revenue: 10 },
      { category: 'A', revenue: 5 },
      { category: 'B', revenue: 2 },
    ]);
    const xField = normalized.fields.find((field) => field.key === 'category');
    const yField = normalized.fields.find((field) => field.key === 'revenue');
    const prepared = prepareVisualizationRows(normalized.rows, 'pie', xField, yField);

    expect(prepared.rows).toEqual([
      { category: 'A', revenue: 15 },
      { category: 'B', revenue: 2 },
    ]);
    expect(prepared.aggregated).toBe(true);

    const negative = normalizeVisualizationRows([{ category: 'A', revenue: -1 }]);
    const negativeResult = prepareVisualizationRows(
      negative.rows,
      'pie',
      negative.fields.find((field) => field.key === 'category'),
      negative.fields.find((field) => field.key === 'revenue')
    );
    expect(negativeResult.error).toContain('negative');
    expect(negativeResult.aggregated).toBe(true);
  });

  it('calculates sum, average, count, minimum, maximum, and percentage measures by X column', () => {
    const normalized = normalizeVisualizationRows([
      { category: 'A', revenue: 10, status: 'Ready' },
      { category: 'A', revenue: 30, status: 'Ready' },
      { category: 'B', revenue: 60, status: 'Blocked' },
    ]);
    const category = normalized.fields.find((field) => field.key === 'category');
    const revenue = normalized.fields.find((field) => field.key === 'revenue');
    const status = normalized.fields.find((field) => field.key === 'status');

    const valuesFor = (aggregation: 'sum' | 'average' | 'min' | 'max' | 'percentage') =>
      prepareVisualizationRows(normalized.rows, 'bar', category, revenue, aggregation).rows.map((row) => row.revenue);

    expect(valuesFor('sum')).toEqual([40, 60]);
    expect(valuesFor('average')).toEqual([20, 60]);
    expect(valuesFor('min')).toEqual([10, 60]);
    expect(valuesFor('max')).toEqual([30, 60]);
    expect(valuesFor('percentage')).toEqual([40, 60]);
    expect(prepareVisualizationRows(normalized.rows, 'bar', category, status, 'count').rows).toEqual([
      { category: 'A', status: 2 },
      { category: 'B', status: 1 },
    ]);
  });

  it('allows any non-X column for count but requires numeric Y columns for other measures', () => {
    const { fields } = normalizeVisualizationRows([
      { country: 'US', status: 'Ready' },
      { country: 'UK', status: 'Blocked' },
    ]);

    expect(compatibleYFields(fields, 'country', 'sum')).toEqual([]);
    expect(compatibleYFields(fields, 'country', 'count').map((field) => field.key)).toEqual(['status']);
    expect(isChartTypeCompatible(fields, 'bar', 'count')).toBe(true);
  });

  it('applies numeric comparison filters with AND semantics', () => {
    const normalized = normalizeVisualizationRows([
      { category: 'A', revenue: 5 },
      { category: 'B', revenue: 10 },
      { category: 'B', revenue: 15 },
    ]);
    const result = applyVisualizationFilters(normalized.rows, normalized.fields, [
      { id: 'minimum', fieldKey: 'revenue', operator: '>=', value: '10' },
      { id: 'category', fieldKey: 'category', operator: '!=', value: 'A' },
    ]);

    expect(result.error).toBeNull();
    expect(result.filteredOutRowCount).toBe(1);
    expect(result.rows.map((row) => row.revenue)).toEqual([10, 15]);
  });

  it('supports date comparisons and reports invalid numeric filter values', () => {
    const normalized = normalizeVisualizationRows([
      { updated_at: '2026-09-15T00:00:00Z', score: 80 },
      { updated_at: '2026-09-17T00:00:00Z', score: 90 },
    ]);
    const dates = applyVisualizationFilters(normalized.rows, normalized.fields, [
      { id: 'date', fieldKey: 'updated_at', operator: '>', value: '2026-09-16' },
    ]);
    const invalidNumber = applyVisualizationFilters(normalized.rows, normalized.fields, [
      { id: 'score', fieldKey: 'score', operator: '<', value: 'not-a-number' },
    ]);

    expect(dates.rows.map((row) => row.score)).toEqual([90]);
    expect(invalidNumber.error).toBe('Enter a valid number for the Score filter.');
  });

  it('limits text columns to equality and inequality filters', () => {
    const { fields } = normalizeVisualizationRows([{ category: 'A', revenue: 10 }]);
    expect(compatibleFilterOperators(fields.find((field) => field.key === 'category'))).toEqual(['=', '!=']);
    expect(compatibleFilterOperators(fields.find((field) => field.key === 'revenue'))).toEqual([
      '=',
      '!=',
      '<',
      '<=',
      '>',
      '>=',
    ]);
  });
});
