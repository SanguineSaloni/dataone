import {
  Alert,
  AlertDescription,
  AlertTitle,
  AreaChart,
  Badge,
  BarChart,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DonutChart,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Input,
  Label,
  LineChart,
  PieChart,
  ScatterChart,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@databricks/appkit-ui/react';
import { BarChart3, CircleAlert, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import {
  VISUALIZATION_AGGREGATIONS,
  VISUALIZATION_CHART_TYPES,
  VISUALIZATION_FILTER_OPERATORS,
  compatibleFilterOperators,
  compatibleXFields,
  compatibleYFields,
  isChartTypeCompatible,
  normalizeVisualizationRows,
  prepareVisualizationRows,
  reconcileVisualizationSelection,
  suggestedVisualizationTitle,
  type VisualizationAggregation,
  type VisualizationChartType,
  type VisualizationDatasetInput,
  type VisualizationField,
  type VisualizationFilter,
  type VisualizationFilterOperator,
  type VisualizationRow,
} from './visualizationBuilderModel.js';

interface VisualizationBuilderProps {
  datasets: VisualizationDatasetInput[];
  freshness: string;
  isDemo: boolean;
}

function isVisualizationChartType(value: string): value is VisualizationChartType {
  return VISUALIZATION_CHART_TYPES.some((option) => option.value === value);
}

function isVisualizationAggregation(value: string): value is VisualizationAggregation {
  return VISUALIZATION_AGGREGATIONS.some((option) => option.value === value);
}

function isVisualizationFilterOperator(value: string): value is VisualizationFilterOperator {
  return VISUALIZATION_FILTER_OPERATORS.some((option) => option.value === value);
}

function fieldByKey(fields: readonly VisualizationField[], key: string | null): VisualizationField | undefined {
  return fields.find((field) => field.key === key);
}

function VisualizationChart({
  chartType,
  rows,
  xField,
  yField,
  title,
}: {
  chartType: VisualizationChartType;
  rows: VisualizationRow[];
  xField: VisualizationField;
  yField: VisualizationField;
  title: string;
}) {
  const ariaLabel = `${title}: ${yField.label} by ${xField.label}`;

  if (chartType === 'horizontal-bar') {
    return (
      <BarChart
        data={rows}
        xKey={xField.key}
        yKey={yField.key}
        orientation="horizontal"
        colorPalette="categorical"
        height={420}
        showLegend={false}
        ariaLabel={ariaLabel}
        testId="custom-visualization-chart"
      />
    );
  }

  if (chartType === 'line') {
    return (
      <LineChart
        data={rows}
        xKey={xField.key}
        yKey={yField.key}
        colorPalette="categorical"
        height={420}
        showLegend={false}
        smooth={false}
        showSymbol
        ariaLabel={ariaLabel}
        testId="custom-visualization-chart"
      />
    );
  }

  if (chartType === 'area') {
    return (
      <AreaChart
        data={rows}
        xKey={xField.key}
        yKey={yField.key}
        colorPalette="categorical"
        height={420}
        showLegend={false}
        smooth={false}
        showSymbol
        ariaLabel={ariaLabel}
        testId="custom-visualization-chart"
      />
    );
  }

  if (chartType === 'pie') {
    return (
      <PieChart
        data={rows}
        xKey={xField.key}
        yKey={yField.key}
        colorPalette="categorical"
        height={420}
        showLegend
        showLabels
        labelPosition="outside"
        ariaLabel={ariaLabel}
        testId="custom-visualization-chart"
      />
    );
  }

  if (chartType === 'donut') {
    return (
      <DonutChart
        data={rows}
        xKey={xField.key}
        yKey={yField.key}
        colorPalette="categorical"
        height={420}
        showLegend
        showLabels
        labelPosition="outside"
        innerRadius={52}
        ariaLabel={ariaLabel}
        testId="custom-visualization-chart"
      />
    );
  }

  if (chartType === 'scatter') {
    return (
      <ScatterChart
        data={rows}
        xKey={xField.key}
        yKey={yField.key}
        colorPalette="categorical"
        height={420}
        showLegend={false}
        symbolSize={10}
        ariaLabel={ariaLabel}
        testId="custom-visualization-chart"
      />
    );
  }

  return (
    <BarChart
      data={rows}
      xKey={xField.key}
      yKey={yField.key}
      orientation="vertical"
      colorPalette="categorical"
      height={420}
      showLegend={false}
      ariaLabel={ariaLabel}
      testId="custom-visualization-chart"
    />
  );
}

export function VisualizationBuilder({ datasets, freshness, isDemo }: VisualizationBuilderProps) {
  const firstDataset = datasets[0];
  const [datasetId, setDatasetId] = useState(firstDataset?.id ?? 'unavailable');
  const [chartType, setChartType] = useState<VisualizationChartType>(firstDataset?.defaultChartType ?? 'bar');
  const [xKey, setXKey] = useState(firstDataset?.defaultXKey ?? '');
  const [yKey, setYKey] = useState(firstDataset?.defaultYKey ?? '');
  const [chartTitle, setChartTitle] = useState(firstDataset?.defaultTitle ?? 'Custom visualization');
  const [aggregation, setAggregation] = useState<VisualizationAggregation>('sum');
  const [filters, setFilters] = useState<VisualizationFilter[]>([]);
  const nextFilterId = useRef(1);

  const activeDataset = datasets.find((dataset) => dataset.id === datasetId) ?? firstDataset;
  const normalized = useMemo(
    () => normalizeVisualizationRows(activeDataset?.rows ?? [], activeDataset?.normalize),
    [activeDataset]
  );
  const selection = reconcileVisualizationSelection(normalized.fields, chartType, xKey, yKey, aggregation);
  const selectedXField = fieldByKey(normalized.fields, selection.xKey);
  const selectedYField = fieldByKey(normalized.fields, selection.yKey);
  const xFields = compatibleXFields(normalized.fields, chartType);
  const yFields = compatibleYFields(normalized.fields, selection.xKey, aggregation);
  const prepared = prepareVisualizationRows(
    normalized.rows,
    chartType,
    selectedXField,
    selectedYField,
    aggregation,
    filters,
    normalized.fields
  );
  const chartRows = prepared.rows;
  const suggestedTitle = suggestedVisualizationTitle(chartType, selectedXField, selectedYField, aggregation);
  const selectedTypeCompatible = isChartTypeCompatible(normalized.fields, chartType, aggregation);
  const aggregationLabel =
    VISUALIZATION_AGGREGATIONS.find((option) => option.value === aggregation)?.label ?? aggregation;
  const titleIsValid = chartTitle.trim().length > 0;
  const categoryCount = selection.xKey ? new Set(chartRows.map((row) => String(row[selection.xKey ?? '']))).size : 0;
  const pieHasManySlices = (chartType === 'pie' || chartType === 'donut') && categoryCount > 7;

  const selectDataset = (nextDatasetId: string) => {
    const nextDataset = datasets.find((dataset) => dataset.id === nextDatasetId);
    if (!nextDataset) return;
    setDatasetId(nextDataset.id);
    setChartType(nextDataset.defaultChartType);
    setXKey(nextDataset.defaultXKey);
    setYKey(nextDataset.defaultYKey);
    setChartTitle(nextDataset.defaultTitle);
    setAggregation('sum');
    setFilters([]);
  };

  const selectChartType = (value: string) => {
    if (!isVisualizationChartType(value)) return;
    const nextSelection = reconcileVisualizationSelection(
      normalized.fields,
      value,
      selection.xKey,
      selection.yKey,
      aggregation
    );
    setChartType(value);
    setXKey(nextSelection.xKey ?? '');
    setYKey(nextSelection.yKey ?? '');
  };

  const selectAggregation = (value: string) => {
    if (!isVisualizationAggregation(value)) return;
    const nextSelection = reconcileVisualizationSelection(
      normalized.fields,
      chartType,
      selection.xKey,
      selection.yKey,
      value
    );
    setAggregation(value);
    setXKey(nextSelection.xKey ?? '');
    setYKey(nextSelection.yKey ?? '');
  };

  const selectXField = (value: string) => {
    const nextSelection = reconcileVisualizationSelection(
      normalized.fields,
      chartType,
      value,
      selection.yKey,
      aggregation
    );
    setXKey(nextSelection.xKey ?? '');
    setYKey(nextSelection.yKey ?? '');
  };

  const addFilter = () => {
    const firstField = normalized.fields[0];
    if (!firstField || filters.length >= 5) return;
    setFilters((current) => [
      ...current,
      { id: `visualization-filter-${nextFilterId.current++}`, fieldKey: firstField.key, operator: '=', value: '' },
    ]);
  };

  const updateFilter = (id: string, update: Partial<Omit<VisualizationFilter, 'id'>>) => {
    setFilters((current) =>
      current.map((filter) => {
        if (filter.id !== id) return filter;
        const nextFilter = { ...filter, ...update };
        const nextField = fieldByKey(normalized.fields, nextFilter.fieldKey);
        if (!compatibleFilterOperators(nextField).includes(nextFilter.operator)) nextFilter.operator = '=';
        return nextFilter;
      })
    );
  };

  if (!activeDataset) {
    return (
      <Empty className="dataone-empty">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BarChart3 aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>No visualization datasets configured</EmptyTitle>
          <EmptyDescription>Add a governed query result before building a graph.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Card className="dataone-panel dataone-chart-builder">
      <CardHeader className="dataone-chart-builder-heading">
        <div>
          <Badge variant="outline">Interactive chart builder</Badge>
          <CardTitle>Create a visualization from governed run data</CardTitle>
          <CardDescription>
            Choose columns by name, select a graph and measure, then narrow the result with optional AND filters.
          </CardDescription>
        </div>
        <Badge variant="secondary">{isDemo ? 'Local demo data' : 'Databricks SQL data'}</Badge>
      </CardHeader>
      <CardContent className="dataone-chart-builder-content">
        <div className="dataone-chart-builder-controls" aria-label="Visualization controls">
          <div className="dataone-chart-control dataone-chart-control--title">
            <Label htmlFor="visualization-title">Graph name</Label>
            <div className="dataone-chart-title-control">
              <Input
                id="visualization-title"
                value={chartTitle}
                onChange={(event) => setChartTitle(event.target.value.slice(0, 100))}
                placeholder="Enter a graph name"
                aria-describedby="visualization-title-help"
              />
              <Button type="button" variant="outline" onClick={() => setChartTitle(suggestedTitle)}>
                <Sparkles aria-hidden="true" />
                Suggested name
              </Button>
            </div>
            <small id="visualization-title-help">The name appears above the generated chart.</small>
          </div>

          <div className="dataone-chart-control">
            <Label htmlFor="visualization-dataset">Dataset</Label>
            <Select value={activeDataset.id} onValueChange={selectDataset}>
              <SelectTrigger id="visualization-dataset" aria-label="Visualization dataset">
                <SelectValue placeholder="Select a dataset" />
              </SelectTrigger>
              <SelectContent>
                {datasets.map((dataset) => (
                  <SelectItem key={dataset.id} value={dataset.id}>
                    {dataset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="dataone-chart-control">
            <Label htmlFor="visualization-type">Graph type</Label>
            <Select value={chartType} onValueChange={selectChartType}>
              <SelectTrigger id="visualization-type" aria-label="Graph type">
                <SelectValue placeholder="Select a graph type" />
              </SelectTrigger>
              <SelectContent>
                {VISUALIZATION_CHART_TYPES.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    disabled={!isChartTypeCompatible(normalized.fields, option.value, aggregation)}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="dataone-chart-control">
            <Label htmlFor="visualization-x-column">X column</Label>
            <Select value={selection.xKey ?? ''} onValueChange={selectXField} disabled={xFields.length === 0}>
              <SelectTrigger id="visualization-x-column" aria-label="X column">
                <SelectValue placeholder="Select an X column" />
              </SelectTrigger>
              <SelectContent>
                {xFields.map((field) => (
                  <SelectItem key={field.key} value={field.key}>
                    {field.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="dataone-chart-control">
            <Label htmlFor="visualization-y-column">Y column</Label>
            <Select
              value={selection.yKey ?? ''}
              onValueChange={(value) => setYKey(value)}
              disabled={yFields.length === 0}
            >
              <SelectTrigger id="visualization-y-column" aria-label="Y column">
                <SelectValue placeholder="Select a numeric Y column" />
              </SelectTrigger>
              <SelectContent>
                {yFields.map((field) => (
                  <SelectItem key={field.key} value={field.key}>
                    {field.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="dataone-chart-control">
            <Label htmlFor="visualization-aggregation">Measure</Label>
            <Select value={aggregation} onValueChange={selectAggregation}>
              <SelectTrigger id="visualization-aggregation" aria-label="Measure calculation">
                <SelectValue placeholder="Select a measure" />
              </SelectTrigger>
              <SelectContent>
                {VISUALIZATION_AGGREGATIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <small>
              {aggregation === 'count'
                ? 'Counts non-empty values in the selected Y column.'
                : aggregation === 'percentage'
                  ? 'Shows each X group as a percentage of the filtered Y-column sum.'
                  : `Calculates the ${aggregation} of the selected Y column for each X group.`}
            </small>
          </div>

          <section className="dataone-chart-filter-panel" aria-labelledby="visualization-filters-title">
            <div className="dataone-chart-filter-heading">
              <div>
                <h3 id="visualization-filters-title">Filters</h3>
                <p>Every filter is applied with AND. Empty values do not match.</p>
              </div>
              <div className="dataone-chart-filter-actions">
                {filters.length > 0 && (
                  <Button type="button" variant="ghost" onClick={() => setFilters([])}>
                    Clear filters
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={addFilter}
                  disabled={normalized.fields.length === 0 || filters.length >= 5}
                >
                  <Plus aria-hidden="true" />
                  Add filter
                </Button>
              </div>
            </div>

            {filters.length === 0 ? (
              <p className="dataone-chart-filter-empty">No filters applied. The chart uses every available row.</p>
            ) : (
              <div className="dataone-chart-filter-list">
                {filters.map((filter, index) => {
                  const filterField = fieldByKey(normalized.fields, filter.fieldKey);
                  const operatorOptions = VISUALIZATION_FILTER_OPERATORS.filter((operator) =>
                    compatibleFilterOperators(filterField).includes(operator.value)
                  );
                  return (
                    <div className="dataone-chart-filter-row" key={filter.id}>
                      <div className="dataone-chart-control">
                        <Label htmlFor={`${filter.id}-column`}>Column</Label>
                        <Select
                          value={filter.fieldKey}
                          onValueChange={(value) => updateFilter(filter.id, { fieldKey: value })}
                        >
                          <SelectTrigger id={`${filter.id}-column`} aria-label={`Filter ${index + 1} column`}>
                            <SelectValue placeholder="Select a column" />
                          </SelectTrigger>
                          <SelectContent>
                            {normalized.fields.map((field) => (
                              <SelectItem key={field.key} value={field.key}>
                                {field.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="dataone-chart-control">
                        <Label htmlFor={`${filter.id}-operator`}>Condition</Label>
                        <Select
                          value={filter.operator}
                          onValueChange={(value) => {
                            if (isVisualizationFilterOperator(value)) updateFilter(filter.id, { operator: value });
                          }}
                        >
                          <SelectTrigger id={`${filter.id}-operator`} aria-label={`Filter ${index + 1} condition`}>
                            <SelectValue placeholder="Select a condition" />
                          </SelectTrigger>
                          <SelectContent>
                            {operatorOptions.map((operator) => (
                              <SelectItem key={operator.value} value={operator.value}>
                                {operator.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="dataone-chart-control">
                        <Label htmlFor={`${filter.id}-value`}>Value</Label>
                        <Input
                          id={`${filter.id}-value`}
                          value={filter.value}
                          onChange={(event) => updateFilter(filter.id, { value: event.target.value.slice(0, 200) })}
                          inputMode={filterField?.kind === 'measure' ? 'decimal' : 'text'}
                          placeholder={filterField?.kind === 'time' ? '2026-09-16' : 'Enter a value'}
                        />
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove filter ${index + 1}`}
                        onClick={() => setFilters((current) => current.filter((item) => item.id !== filter.id))}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {!titleIsValid && (
          <Alert>
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Give the graph a name</AlertTitle>
            <AlertDescription>Enter a descriptive graph name before using the preview.</AlertDescription>
          </Alert>
        )}

        {activeDataset.warning && (
          <Alert>
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Dataset note</AlertTitle>
            <AlertDescription>{activeDataset.warning}</AlertDescription>
          </Alert>
        )}

        {pieHasManySlices && (
          <Alert>
            <CircleAlert aria-hidden="true" />
            <AlertTitle>This chart contains {categoryCount} slices</AlertTitle>
            <AlertDescription>
              Pie and donut charts are clearest with seven or fewer categories. Choose a bar chart for more precise
              comparison.
            </AlertDescription>
          </Alert>
        )}

        <Card className="dataone-chart-preview">
          <CardHeader className="dataone-chart-preview-heading">
            <div>
              <CardDescription>Live chart preview</CardDescription>
              <CardTitle>{chartTitle.trim() || 'Untitled visualization'}</CardTitle>
            </div>
            <div className="dataone-chart-builder-meta">
              <Badge variant="outline">{activeDataset.label}</Badge>
              <Badge variant="outline">{chartRows.length} plotted rows</Badge>
              {selectedXField && <Badge variant="outline">X · {selectedXField.label}</Badge>}
              {selectedYField && <Badge variant="outline">Y · {selectedYField.label}</Badge>}
              <Badge variant="outline">Measure · {aggregationLabel}</Badge>
              {filters.length > 0 && <Badge variant="outline">{filters.length} active filters</Badge>}
            </div>
          </CardHeader>
          <CardContent>
            {activeDataset.loading ? (
              <div className="dataone-chart-builder-loading" aria-label={`Loading ${activeDataset.label}`}>
                <Skeleton className="h-6 w-56" />
                <Skeleton className="h-[360px] w-full" />
                {activeDataset.warehouseStatus?.state === 'STARTING' && (
                  <p>The SQL warehouse is starting. The preview will appear automatically.</p>
                )}
              </div>
            ) : activeDataset.error ? (
              <Alert variant="destructive">
                <CircleAlert aria-hidden="true" />
                <AlertTitle>Unable to load {activeDataset.label}</AlertTitle>
                <AlertDescription>{activeDataset.error}</AlertDescription>
              </Alert>
            ) : normalized.rows.length === 0 ? (
              <Empty className="dataone-empty">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <BarChart3 aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>No rows available for this dataset</EmptyTitle>
                  <EmptyDescription>Choose another governed dataset or run the pipeline again.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : !selectedTypeCompatible || !selectedXField || !selectedYField ? (
              <Alert>
                <CircleAlert aria-hidden="true" />
                <AlertTitle>No compatible X and Y columns</AlertTitle>
                <AlertDescription>
                  Select a graph type supported by this dataset. Scatter plots require two numeric columns.
                </AlertDescription>
              </Alert>
            ) : prepared.error ? (
              <Alert>
                <CircleAlert aria-hidden="true" />
                <AlertTitle>The selected graph cannot represent these values</AlertTitle>
                <AlertDescription>{prepared.error}</AlertDescription>
              </Alert>
            ) : chartRows.length === 0 ? (
              <Empty className="dataone-empty">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <BarChart3 aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>No plottable values</EmptyTitle>
                  <EmptyDescription>
                    No rows match the filters and selected X/Y columns. Adjust the filters, columns, or measure.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : titleIsValid ? (
              <VisualizationChart
                chartType={chartType}
                rows={chartRows}
                xField={selectedXField}
                yField={selectedYField}
                title={chartTitle.trim()}
              />
            ) : null}
          </CardContent>
        </Card>

        <small className="dataone-chart-builder-source">
          Source: {activeDataset.source} · Freshness: {freshness} · Measure: {aggregationLabel} ·{' '}
          {prepared.filteredOutRowCount} rows filtered out · {prepared.droppedRowCount} rows without compatible X/Y
          values omitted{activeDataset.id === 'cleaned-records' ? ' · latest 100 cleaned records queried' : ''}.
        </small>
      </CardContent>
    </Card>
  );
}
