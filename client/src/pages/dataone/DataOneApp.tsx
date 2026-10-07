import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  BarChart,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  GenieChatInput,
  GenieChatMessage,
  Input,
  Label,
  Progress,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useAnalyticsQuery,
  useGenieChat,
  type GenieMessageItem,
  type UseAnalyticsQueryResult,
} from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bot,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  Code2,
  Database,
  FileText,
  FileJson2,
  FileSpreadsheet,
  GitBranch,
  Home,
  Layers3,
  Loader2,
  LockKeyhole,
  Menu,
  Network,
  Play,
  RefreshCw,
  Scale,
  Search,
  SearchCode,
  ShieldCheck,
  Sparkles,
  TableProperties,
  TrendingUp,
  WandSparkles,
  Workflow,
  X,
  XCircle,
} from 'lucide-react';
import {
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  projectGoldTableLeaf,
  projectGoldTableName,
  projectPostgresTableLeaf,
} from '../../../../shared/projectGold.js';
import { DatabaseConnectorSetup, type DatabaseConnectionTestResult } from './DatabaseConnectorSetup.js';
import { FederatedSourceSetup, type SqliteSourceSelection } from './FederatedSourceSetup.js';
import { VisualizationBuilder } from './VisualizationBuilder.js';
import {
  buildRunScopedQuestion,
  isDatasetRowCountQuestion,
  visibleQuestionFromRunScopedContent,
  type AskDataRunContext,
} from './askDataModel.js';
import {
  databaseConnectorLabel,
  defaultDatabaseConnector,
  localMysqlSourceRequest,
  localPostgresTargetRequest,
  type DatabaseConnectorConfig,
  validateDatabaseConnector,
} from './databaseConnectorModel.js';
import type { VisualizationDatasetInput } from './visualizationBuilderModel.js';

type SourceMode = 'volume_file' | 'sqlite_file' | 'uc_table' | 'demo_database';
type FileSourceFormat = 'csv' | 'json' | 'parquet';
type SourceFormat = FileSourceFormat | 'sqlite' | 'database';
type ExternalTargetEngine = 'postgresql' | 'mysql';
type AppScreen = 'setup' | 'progress' | 'results'; //step up means user selects the source and project and progress databricks job and pipleine are running.Results are hte processed results are displayed
type WorkspaceView =
  | 'dashboard'
  | 'mapper'
  | 'governance'
  | 'askdata'
  | 'quality'
  | 'visualizations'
  | 'prediction'
  | 'audit';
type DataRow = Record<string, unknown>;

interface Identity {
  email?: string | null;
  user?: string | null;
}

interface WorkflowConfig {
  projectName: string;
  runId: string;
  sourceMode: SourceMode;
  sourceFormat: SourceFormat;
  sourcePath: string;
  sourceTable: string;
  sourceLabel: string;
  outputTable: string;
  targetEngine: ExternalTargetEngine;
  targetLabel: string;
  sourceLive: boolean;
  targetLive: boolean;
  targetRowCount: number | null;
  targetColumns: string[];
}

interface DemoSampleDescriptor {
  format: FileSourceFormat;
  filename: string;
  url: string;
  label?: string;
  description?: string;
  rowCount?: number;
  mediaType?: string;
  sizeBytes?: number;
}

interface DemoConnectionDescriptor {
  alias: string;
  label?: string;
  engine?: string;
  description?: string;
}

interface DemoConnectionPair {
  source: DemoConnectionDescriptor;
  target: DemoConnectionDescriptor;
}

interface JobTask {
  task_key?: string;
  state?: {
    life_cycle_state?: string;
    result_state?: string;
    state_message?: string;
  };
}

interface JobRun {
  run_id?: number;
  run_name?: string;
  start_time?: number;
  end_time?: number;
  state?: {
    life_cycle_state?: string;
    result_state?: string;
    state_message?: string;
  };
  tasks?: JobTask[];
}

interface QueryState<T extends DataRow = DataRow> {
  data: T[] | null;
  loading: boolean;
  error: string | null;
  warehouseStatus?: { state: string; elapsedMs: number } | null;
}

function isDataRow(value: unknown): value is DataRow {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function dataRows(value: unknown): DataRow[] {
  return Array.isArray(value) ? value.filter(isDataRow) : [];
}

function validateDataRowQuery(query: UseAnalyticsQueryResult<unknown>, queryName: string): QueryState {
  if (query.data === null) return { ...query, data: null };
  if (Array.isArray(query.data) && query.data.every(isDataRow)) {
    return { ...query, data: query.data };
  }
  return {
    ...query,
    data: null,
    loading: false,
    error: query.error ?? `${queryName} returned an unexpected result shape.`,
  };
}

interface DemoAskDataSummary {
  projectName: string;
  runId: string;
  rowCount: number | null;
  cleanedRows: number | null;
  qualityScore: number | null;
  mappingConfidence: number | null;
  quarantinedRows: number | null;
  transformedCells: number | null;
  qualityRows: DataRow[];
  transformations: DataRow[];
  mappings: DataRow[];
  commerce: DataRow[];
  issues: DataRow[];
  sourceMode: SourceMode;
  sourceLabel: string;
  targetLabel: string;
  freshness: string;
  riskScore: number | null;
  riskLevel: string;
}

interface DemoAnswer {
  id: number;
  question: string;
  answer: string;
  sql: string;
}

const TARGET_SCHEMA = 'workspace.dataone_gold';
const MAX_UPLOAD_SIZE = 500 * 1024 * 1024;
const TERMINAL_LIFECYCLE_STATES = new Set(['TERMINATED', 'SKIPPED', 'INTERNAL_ERROR']);
const GENIE_TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED']);

const FLOW_STEPS = [
  { label: 'Overview', icon: Activity },
  { label: 'Schema Intelligence', icon: SearchCode },
  { label: 'Quality & Cleaning', icon: WandSparkles },
  { label: 'Topology & Impact', icon: Network },
  { label: 'Visualizations', icon: BarChart3 },
  { label: 'Semantics', icon: Scale },
  { label: 'Risk Forecast', icon: TrendingUp },
  { label: 'AskData · Genie', icon: Bot },
  { label: 'Audit', icon: ShieldCheck },
] as const;

const DATAONE_QUESTION_GROUPS = [
  {
    label: 'Run health',
    questions: [
      'What is the latest DataOne run and its data quality score?',
      'How many rows were cleaned or quarantined?',
    ],
  },
  {
    label: 'Data quality',
    questions: ['Which columns have the lowest quality scores?', 'What quality issues were detected?'],
  },
  {
    label: 'Schema mapping',
    questions: ['Which mappings still need human review?', 'Summarize source-to-target mapping confidence.'],
  },
  {
    label: 'Business impact',
    questions: ['Which category has the highest revenue?', 'Summarize the business impact of this run.'],
  },
  {
    label: 'Prediction',
    questions: ['What is the heuristic risk forecast?', 'Which factors contribute most to forecast risk?'],
  },
  {
    label: 'Source & target',
    questions: ['What are the source and target for this run?', 'Is PostgreSQL a native pipeline sink in this demo?'],
  },
] as const;

const WORKSPACE_NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: Home },
  { id: 'mapper', label: 'Schema Mapper', icon: GitBranch },
  { id: 'governance', label: 'Autopilot Governance', icon: ShieldCheck },
  { id: 'askdata', label: 'AskData (NL2SQL)', icon: Search },
  { id: 'quality', label: 'Data Quality', icon: CheckCircle2 },
  { id: 'visualizations', label: 'Data Visualization', icon: BarChart3 },
  { id: 'prediction', label: 'Prediction / Risk Forecast', icon: TrendingUp },
  { id: 'audit', label: 'Audit Trail & Cross-Source Intelligence', icon: FileText },
] as const satisfies ReadonlyArray<{
  id: WorkspaceView;
  label: string;
  icon: typeof Home;
}>;

function getErrorMessage(value: unknown, fallback: string): string {
  if (value instanceof Error && value.message) return value.message;
  if (typeof value === 'string' && value) return value;
  return fallback;
}

async function readError(response: Response, fallback: string): Promise<string> {
  const body = (await response
    .clone()
    .json()
    .catch(() => null)) as { error?: string; message?: string } | null;
  if (body?.error) return body.error;
  if (body?.message) return body.message;
  const text = await response.text().catch(() => '');
  const normalized = text.trim();
  if (!normalized || /<\/?(?:html|body|head)[\s>]/i.test(normalized)) return fallback;
  return normalized.slice(0, 500);
}

function normalizedExtension(fileName: string): FileSourceFormat | null {
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (extension === 'csv' || extension === 'json' || extension === 'parquet') {
    return extension;
  }
  return null;
}

function demoSampleMimeType(format: FileSourceFormat): string {
  if (format === 'csv') return 'text/csv';
  if (format === 'json') return 'application/json';
  return 'application/vnd.apache.parquet';
}

function parseDemoSamples(value: unknown): DemoSampleDescriptor[] {
  const candidate = value as { samples?: unknown } | null;
  const rawSamples = Array.isArray(value) ? value : candidate?.samples;
  if (!Array.isArray(rawSamples)) {
    throw new Error('The demo samples endpoint returned an invalid response.');
  }

  const samples = rawSamples.map((raw, index) => {
    if (!raw || typeof raw !== 'object') {
      throw new Error(`Demo sample ${index + 1} is invalid.`);
    }
    const item = raw as Record<string, unknown>;
    const format = item.format;
    const filename = item.filename;
    const url = item.url;
    if (
      (format !== 'csv' && format !== 'json' && format !== 'parquet') ||
      typeof filename !== 'string' ||
      !filename ||
      typeof url !== 'string' ||
      !url
    ) {
      throw new Error(`Demo sample ${index + 1} is missing format, filename, or URL.`);
    }
    return {
      format,
      filename,
      url,
      label: typeof item.label === 'string' ? item.label : undefined,
      description: typeof item.description === 'string' ? item.description : undefined,
      rowCount: typeof item.rowCount === 'number' ? item.rowCount : undefined,
      mediaType: typeof item.mediaType === 'string' ? item.mediaType : undefined,
      sizeBytes: typeof item.sizeBytes === 'number' ? item.sizeBytes : undefined,
    } satisfies DemoSampleDescriptor;
  });

  const formats = new Set(samples.map((sample) => sample.format));
  for (const required of ['csv', 'json', 'parquet'] as const) {
    if (!formats.has(required)) {
      throw new Error(`The demo samples response is missing the required ${required.toUpperCase()} sample.`);
    }
  }
  return samples;
}

function parseDemoConnection(value: unknown, role: 'source' | 'target'): DemoConnectionDescriptor {
  if (typeof value === 'string' && value) return { alias: value };
  if (!value || typeof value !== 'object') {
    throw new Error(`The demo ${role} connection descriptor is missing.`);
  }
  const item = value as Record<string, unknown>;
  const alias = item.alias;
  if (typeof alias !== 'string' || !alias) {
    throw new Error(`The demo ${role} connection alias is missing.`);
  }
  return {
    alias,
    label: typeof item.label === 'string' ? item.label : undefined,
    engine: typeof item.engine === 'string' ? item.engine : undefined,
    description: typeof item.description === 'string' ? item.description : undefined,
  };
}

function parseDemoConnections(value: unknown): DemoConnectionPair {
  if (!value || typeof value !== 'object') {
    throw new Error('The demo connections endpoint returned an invalid response.');
  }
  const item = value as Record<string, unknown>;
  const source = parseDemoConnection(item.source ?? item.sourceConnection, 'source');
  const target = parseDemoConnection(item.target ?? item.targetConnection, 'target');
  if (source.alias !== 'demo-mysql-commerce' || target.alias !== 'demo-postgres-analytics') {
    throw new Error('The demo backend returned unexpected source or target connection aliases.');
  }
  return { source, target };
}

function safeSegment(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 72) || 'dataone-project'
  );
}

function safeFileName(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/\.\.+/g, '-')
    .slice(-180);
}

function createRunId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `run-${Date.now()}`;
}

function runPayload(value: unknown): JobRun {
  if (!value || typeof value !== 'object') return {};
  const candidate = value as { run?: unknown };
  return (candidate.run && typeof candidate.run === 'object' ? candidate.run : value) as JobRun;
}

function runStatus(run: JobRun | null): string {
  return run?.state?.life_cycle_state ?? 'PENDING';
}

function runResult(run: JobRun | null): string | undefined {
  return run?.state?.result_state;
}

function taskByKey(run: JobRun | null, key: string): JobTask | undefined {
  return run?.tasks?.find((task) => task.task_key === key);
}

function taskSucceeded(task?: JobTask): boolean {
  return task?.state?.result_state === 'SUCCESS';
}

function externalPublishTask(run: JobRun | null): JobTask | undefined {
  return taskByKey(run, 'publish_external_database') ?? taskByKey(run, 'publish_external_postgres');
}

function workflowUnlockCount(run: JobRun | null, launching: boolean): number {
  if (launching) return 1;
  if (runResult(run) === 'SUCCESS') return FLOW_STEPS.length;

  const profile = taskByKey(run, 'profile_source');
  const pipeline = taskByKey(run, 'quality_pipeline');
  const externalTarget = externalPublishTask(run);
  const publishTarget = taskByKey(run, 'publish_project_gold') ?? taskByKey(run, 'publish_target');
  if (taskSucceeded(externalTarget) || externalTarget?.state?.life_cycle_state === 'RUNNING') return 8;
  if (taskSucceeded(publishTarget)) return 8;
  if (publishTarget?.state?.life_cycle_state === 'RUNNING') return 7;
  if (taskSucceeded(pipeline)) return 5;
  if (pipeline?.state?.life_cycle_state === 'RUNNING') return 4;
  if (taskSucceeded(profile)) return 3;
  if (profile?.state?.life_cycle_state === 'RUNNING') return 2;
  return 1;
}

function formatInteger(value: number | null): string {
  return value == null ? '—' : new Intl.NumberFormat().format(value);
}

function formatPercent(value: number | null): string {
  return value == null ? '—' : `${value.toFixed(1)}%`;
}

function displayString(value: unknown, fallback = '—'): string {
  if (value == null || value === '') return fallback;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return `${value}`;
  }
  if (value instanceof Date) return value.toISOString();
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

function formatTimestamp(value: unknown): string {
  if (value == null || value === '') return 'Not available';
  const text = displayString(value, 'Not available');
  const date = new Date(text);
  return Number.isNaN(date.getTime())
    ? text
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}

function valueFrom(row: DataRow | undefined, keys: string[]): unknown {
  if (!row) return undefined;
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
  }
  return undefined;
}

function textFrom(row: DataRow | undefined, keys: string[], fallback = '—'): string {
  const value = valueFrom(row, keys);
  return displayString(value, fallback);
}

function numberFrom(row: DataRow | undefined, keys: string[]): number | null {
  const raw = valueFrom(row, keys);
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'number' && typeof raw !== 'string' && typeof raw !== 'bigint') {
    return null;
  }
  const value = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(value) ? value : null;
}

function cleanedRecordVisualizationRows(value: unknown): { rows: DataRow[]; invalidRecordCount: number } {
  const rows: DataRow[] = [];
  let invalidRecordCount = 0;

  for (const record of dataRows(value)) {
    const rawPayload = valueFrom(record, ['cleaned_record_json']);
    let payload: DataRow | null = isDataRow(rawPayload) ? rawPayload : null;

    if (!payload && typeof rawPayload === 'string') {
      try {
        const parsed: unknown = JSON.parse(rawPayload);
        payload = isDataRow(parsed) ? parsed : null;
      } catch {
        payload = null;
      }
    }

    if (!payload) {
      invalidRecordCount += 1;
      payload = { dataone_parse_status: 'Invalid cleaned record payload' };
    }

    rows.push({
      ...payload,
      dataone_record_id: textFrom(record, ['record_id']),
      dataone_issue_count: numberFrom(record, ['issue_count']),
      dataone_transformed_count: numberFrom(record, ['transformed_count']),
      dataone_record_status: textFrom(record, ['record_status']),
      dataone_cleaned_at: textFrom(record, ['cleaned_at'], ''),
      dataone_quarantined: valueFrom(record, ['is_quarantined']) === true,
    });
  }

  return { rows, invalidRecordCount };
}

function statusTone(status: string): 'good' | 'warning' | 'bad' | 'neutral' {
  const normalized = status.toUpperCase();
  if (
    normalized.includes('SUCCESS') ||
    normalized.includes('HEALTHY') ||
    normalized.includes('PASS') ||
    normalized.includes('APPROVED') ||
    normalized.includes('CLEAN') ||
    normalized === 'LOW'
  ) {
    return 'good';
  }
  if (
    normalized.includes('FAIL') ||
    normalized.includes('ERROR') ||
    normalized.includes('QUARANTIN') ||
    normalized.includes('REJECT') ||
    normalized === 'HIGH'
  ) {
    return 'bad';
  }
  if (
    normalized.includes('REVIEW') ||
    normalized.includes('WARN') ||
    normalized.includes('PENDING') ||
    normalized.includes('RUNNING') ||
    normalized === 'MODERATE'
  ) {
    return 'warning';
  }
  return 'neutral';
}

function genieStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    ASKING_AI: 'Understanding your question',
    EXECUTING_QUERY: 'Running generated SQL',
    FETCHING_METADATA: 'Reading governed metadata',
    COMPLETED: 'Answer ready',
    FAILED: 'Answer failed',
  };
  return labels[status] ?? status.toLowerCase().replaceAll('_', ' ');
}

function hasZeroRowQueryResult(message: GenieMessageItem): boolean {
  return message.attachments.some((attachment) => {
    if (!attachment.query || !attachment.attachmentId) return false;
    const result = message.queryResults.get(attachment.attachmentId);
    return result?.result.data_array.length === 0;
  });
}

function ToneBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={`dataone-tone dataone-tone--${statusTone(status)}`}>
      {status}
    </Badge>
  );
}

function IdentityBadge({
  identity,
  loading,
  failed,
  isDemo = false,
}: {
  identity: Identity | null;
  loading: boolean;
  failed: boolean;
  isDemo?: boolean;
}) {
  if (loading) return <Skeleton className="h-7 w-44" />;
  if (failed && !isDemo) return <Badge variant="destructive">Identity unavailable</Badge>;
  return (
    <Badge variant="secondary" className="dataone-identity-badge">
      <LockKeyhole aria-hidden="true" />
      {identity?.email ?? identity?.user ?? (isDemo ? 'Local demo viewer' : 'Signed in through Databricks')}
    </Badge>
  );
}

export function DataOneApp() {
  const isDemo = useMemo(() => new URLSearchParams(window.location.search).get('demo') === '1', []);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [identityLoading, setIdentityLoading] = useState(true);
  const [identityFailed, setIdentityFailed] = useState(false);
  const [screen, setScreen] = useState<AppScreen>('setup');
  const [config, setConfig] = useState<WorkflowConfig | null>(null);
  const [run, setRun] = useState<JobRun | null>(null);
  const [launching, setLaunching] = useState(false);
  const [launchMessage, setLaunchMessage] = useState(
    isDemo ? 'Preparing the local data demo' : 'Preparing governed run'
  );
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [pollWarning, setPollWarning] = useState<string | null>(null);
  const [completedAt, setCompletedAt] = useState<Date | null>(null);
  const recentRuns = useAnalyticsQuery('recent_runs');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/whoami', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await readError(response, 'Unable to verify identity'));
        }
        return response.json() as Promise<Identity>;
      })
      .then((value) => {
        setIdentity(value);
        setIdentityFailed(false);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setIdentityFailed(true);
      })
      .finally(() => setIdentityLoading(false));
    return () => controller.abort();
  }, []);

  const pollRun = useCallback(
    async (runId: number, signal?: AbortSignal) => {
      const response = await fetch(`/api/jobs/default/runs/${runId}`, { signal });
      if (!response.ok) {
        throw new Error(await readError(response, `Unable to read run ${runId}`));
      }
      const latest = runPayload(await response.json());
      setRun(latest);
      setPollWarning(null);

      const lifeCycle = runStatus(latest);
      if (!TERMINAL_LIFECYCLE_STATES.has(lifeCycle)) return false;

      if (runResult(latest) === 'SUCCESS') {
        setCompletedAt(new Date());
        setScreen('results');
        setWorkflowError(null);
      } else {
        setWorkflowError(
          latest.state?.state_message ||
            `${isDemo ? 'The simulated run' : 'The Databricks run'} ended with ${runResult(latest) ?? lifeCycle}.`
        );
      }
      return true;
    },
    [isDemo]
  );

  useEffect(() => {
    if (screen !== 'progress' || !run?.run_id || launching || workflowError) {
      return undefined;
    }

    const controller = new AbortController();
    let timer: number | undefined;

    const tick = async () => {
      try {
        const terminal = await pollRun(run.run_id as number, controller.signal);
        if (!terminal && !controller.signal.aborted) {
          timer = window.setTimeout(() => void tick(), 3000);
        }
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setPollWarning(`${getErrorMessage(error, 'Status refresh failed')}. Retrying automatically…`);
        if (!controller.signal.aborted) {
          timer = window.setTimeout(() => void tick(), 6000);
        }
      }
    };

    void tick();
    return () => {
      controller.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, [launching, pollRun, run?.run_id, screen, workflowError]);

  const startWorkflow = async (request: {
    projectName: string;
    sourceMode: SourceMode;
    file: File | null;
    sourceTable: string;
    sourceConnection: string | null;
    targetConnection: string | null;
    sourceConnectionLabel: string | null;
    targetConnectionLabel: string | null;
    sourceDatabase: DatabaseConnectorConfig | null;
    targetDatabase: DatabaseConnectorConfig | null;
    sqliteSource: SqliteSourceSelection | null;
    targetEngine: ExternalTargetEngine;
  }) => {
    setWorkflowError(null);
    setPollWarning(null);
    setLaunching(true);
    setScreen('progress');
    setRun(null);

    const runId = createRunId();
    const outputTable = projectGoldTableName(request.projectName);
    let sourceFormat: SourceFormat = 'parquet';
    let sourcePath = 'unused';
    let sourceLabel = request.sourceTable;
    let targetLabel =
      request.targetEngine === 'mysql' ? 'AWS MySQL · configured target' : 'AWS PostgreSQL · configured target';

    try {
      if (request.sourceMode === 'demo_database') {
        if (!isDemo) throw new Error('The database simulation is available only in explicit local demo mode.');
        if (!request.sourceConnection || !request.targetConnection) {
          throw new Error('Load valid demo source and target connection descriptors before starting.');
        }

        sourceFormat = 'database';
        sourceLabel = request.sourceConnectionLabel ?? request.sourceConnection;
        targetLabel = request.targetConnectionLabel ?? request.targetConnection;
        const localMysqlSource = request.sourceDatabase ? localMysqlSourceRequest(request.sourceDatabase) : null;
        const localPostgresTarget = request.targetDatabase
          ? localPostgresTargetRequest(request.targetDatabase, projectPostgresTableLeaf(request.projectName))
          : null;
        let workflowConfig: WorkflowConfig = {
          projectName: request.projectName.trim(),
          runId,
          sourceMode: request.sourceMode,
          sourceFormat,
          sourcePath,
          sourceTable: localMysqlSource ? `${localMysqlSource.database}.${localMysqlSource.table}` : 'unused',
          sourceLabel,
          outputTable,
          targetEngine: request.targetEngine,
          targetLabel,
          sourceLive: Boolean(localMysqlSource),
          targetLive: Boolean(localPostgresTarget),
          targetRowCount: null,
          targetColumns: [],
        };
        setConfig(workflowConfig);
        setLaunchMessage(
          localMysqlSource && localPostgresTarget
            ? `Reading MySQL, transforming the dataset, and publishing it to ${targetLabel}`
            : localMysqlSource
              ? `Reading live local MySQL data from ${sourceLabel}; Databricks processing and target export remain simulated`
              : `Simulating ${sourceLabel} ingestion and the controlled export step to ${targetLabel}`
        );

        const databaseResponse = await fetch('/api/demo/database/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceConnection: request.sourceConnection,
            targetConnection: request.targetConnection,
            sourceLabel,
            targetLabel,
            projectName: request.projectName.trim(),
            workflowRunId: runId,
            ...(localMysqlSource ? { sourceDatabase: localMysqlSource } : {}),
            ...(localPostgresTarget ? { targetDatabase: localPostgresTarget } : {}),
          }),
        });
        if (!databaseResponse.ok) {
          throw new Error(await readError(databaseResponse, 'Unable to start the database simulation.'));
        }

        const body = (await databaseResponse.json()) as {
          runId?: number;
          run_id?: number;
          workflowRunId?: string;
          targetLive?: boolean;
          targetPublication?: unknown;
          run?: unknown;
        };
        const returnedRun = runPayload(body);
        const demoRunId = body.runId ?? body.run_id ?? returnedRun.run_id;
        if (!demoRunId) throw new Error('The database demo API did not return a job run ID.');
        if (!body.workflowRunId) throw new Error('The database demo API did not return a workflow run ID.');
        if (body.workflowRunId !== runId) {
          throw new Error('The database demo API returned a workflow run ID that does not match the request.');
        }
        if (localPostgresTarget) {
          if (body.targetLive !== true || !isDataRow(body.targetPublication)) {
            throw new Error('The PostgreSQL target did not return a verified publication result.');
          }
          const publishedRows = body.targetPublication.rowCount;
          const publishedColumns = body.targetPublication.columns;
          if (typeof publishedRows !== 'number' || !Array.isArray(publishedColumns)) {
            throw new Error('The PostgreSQL publication result has an unexpected shape.');
          }
          workflowConfig = {
            ...workflowConfig,
            targetLive: true,
            targetRowCount: publishedRows,
            targetColumns: publishedColumns.filter((column): column is string => typeof column === 'string'),
          };
          setConfig(workflowConfig);
        }

        const normalizedRun: JobRun = {
          ...returnedRun,
          run_id: demoRunId,
          state: returnedRun.state ?? { life_cycle_state: 'PENDING' },
        };
        setRun(normalizedRun);
        if (TERMINAL_LIFECYCLE_STATES.has(runStatus(normalizedRun)) && runResult(normalizedRun) === 'SUCCESS') {
          setCompletedAt(new Date());
          setScreen('results');
          setWorkflowError(null);
        } else {
          setLaunchMessage('Local database simulation accepted the run');
        }
        return;
      }

      if (request.sourceMode === 'volume_file' || request.sourceMode === 'sqlite_file') {
        const uploadFile = request.sourceMode === 'sqlite_file' ? request.sqliteSource?.file : request.file;
        if (!uploadFile) {
          throw new Error(
            request.sourceMode === 'sqlite_file'
              ? 'Choose a SQLite file and select one of its tables.'
              : 'Select a CSV, JSON, or Parquet file.'
          );
        }
        const format = request.sourceMode === 'sqlite_file' ? 'sqlite' : normalizedExtension(uploadFile.name);
        if (!format) throw new Error('Only CSV, JSON, Parquet, and SQLite sources are supported.');
        if (uploadFile.size > MAX_UPLOAD_SIZE) {
          throw new Error('The selected file is larger than the 500 MB upload limit.');
        }

        sourceFormat = format;
        const directory = `${sourceFormat}/${safeSegment(request.projectName)}/${runId}`;
        sourcePath = `${directory}/${safeFileName(uploadFile.name)}`;
        sourceLabel =
          request.sourceMode === 'sqlite_file' && request.sqliteSource
            ? `${uploadFile.name} · ${request.sqliteSource.table}`
            : uploadFile.name;

        // [DBX-VOLUME-REST] AppKit Files routes resolve the server-side `files`
        // alias to the bound UC Volume. The browser never supplies a volume ID.
        setLaunchMessage(
          isDemo ? 'Preparing a local demo landing path' : 'Creating a governed Unity Catalog landing path'
        );
        const mkdirResponse = await fetch('/api/files/files/mkdir', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: directory }),
        });
        if (!mkdirResponse.ok) {
          throw new Error(await readError(mkdirResponse, 'Unable to create the landing directory'));
        }

        setLaunchMessage(
          isDemo
            ? `Loading ${uploadFile.name} into the local demo backend`
            : `Uploading ${uploadFile.name} to the governed volume`
        );
        const uploadResponse = await fetch(`/api/files/files/upload?path=${encodeURIComponent(sourcePath)}`, {
          method: 'POST',
          body: uploadFile,
        });
        if (!uploadResponse.ok) {
          throw new Error(await readError(uploadResponse, 'File upload failed'));
        }
      } else if (request.sourceMode === 'uc_table') {
        const [, database, table] = request.sourceTable.split('.');
        sourceLabel = `Federated AWS database · ${database}.${table}`;
      }

      const workflowConfig: WorkflowConfig = {
        projectName: request.projectName.trim(),
        runId,
        sourceMode: request.sourceMode,
        sourceFormat,
        sourcePath,
        sourceTable:
          request.sourceMode === 'uc_table'
            ? request.sourceTable.trim()
            : request.sourceMode === 'sqlite_file'
              ? (request.sqliteSource?.table ?? '')
              : 'unused',
        sourceLabel,
        outputTable,
        targetEngine: request.targetEngine,
        targetLabel,
        sourceLive: false,
        targetLive: false,
        targetRowCount: null,
        targetColumns: [],
      };
      setConfig(workflowConfig);

      let savedProjectId: string | null = null;
      if (!isDemo) {
        setLaunchMessage('Saving the project definition in AWS PostgreSQL');
        const projectResponse = await fetch('/api/ops/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectName: workflowConfig.projectName,
            sourceMode: workflowConfig.sourceMode === 'uc_table' ? 'uc_table' : 'volume_file',
            sourceIdentifier:
              workflowConfig.sourceMode === 'uc_table' ? workflowConfig.sourceTable : workflowConfig.sourcePath,
            outputTable: projectGoldTableLeaf(workflowConfig.projectName),
            sourceConnectionAlias: workflowConfig.sourceMode === 'uc_table' ? 'federated-source' : null,
            targetConnectionAlias: `external-${workflowConfig.targetEngine}-target`,
          }),
        });
        if (!projectResponse.ok) {
          throw new Error(await readError(projectResponse, 'Unable to save the DataOne project in AWS PostgreSQL'));
        }
        const savedProject: unknown = await projectResponse.json();
        if (!isDataRow(savedProject) || typeof savedProject.id !== 'string') {
          throw new Error('AWS PostgreSQL returned an invalid DataOne project ID.');
        }
        savedProjectId = savedProject.id;
      }

      // [DBX-JOB-REST] Starts only the AppKit `default` Job alias. The Job owns
      // the downstream pipeline_task, so no direct Pipelines API call is needed.
      setLaunchMessage(
        isDemo
          ? 'Starting deterministic profile and quality simulation'
          : 'Starting the Databricks profiling and quality job'
      );
      const runResponse = await fetch('/api/jobs/default/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          params: {
            job_parameters: {
              project_name: workflowConfig.projectName,
              run_id: workflowConfig.runId,
              source_mode: workflowConfig.sourceMode === 'uc_table' ? 'uc_table' : 'volume_file',
              source_path: workflowConfig.sourcePath,
              source_format: workflowConfig.sourceFormat,
              json_mode: 'lines',
              source_table: workflowConfig.sourceTable,
              output_table: projectGoldTableLeaf(workflowConfig.projectName),
              target_engine: workflowConfig.targetEngine,
            },
          },
        }),
      });
      if (!runResponse.ok) {
        throw new Error(
          await readError(
            runResponse,
            isDemo ? 'Unable to start the simulated run' : 'Unable to start the Databricks job'
          )
        );
      }

      const body = (await runResponse.json()) as { runId?: number; run_id?: number };
      const databricksRunId = body.runId ?? body.run_id;
      if (!databricksRunId) {
        throw new Error('The Jobs API did not return a run ID.');
      }
      setRun({ run_id: databricksRunId, state: { life_cycle_state: 'PENDING' } });
      if (!isDemo && savedProjectId) {
        const runStoreResponse = await fetch('/api/ops/runs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: savedProjectId,
            workflowRunId: workflowConfig.runId,
            databricksRunId,
          }),
        });
        if (!runStoreResponse.ok) {
          setPollWarning(
            `Databricks run ${databricksRunId} started, but its AWS PostgreSQL run reference could not be saved: ${await readError(
              runStoreResponse,
              'unknown storage error'
            )}`
          );
        }
      }
      setLaunchMessage(isDemo ? 'Local demo accepted the simulated run' : 'Databricks accepted the run');
    } catch (error: unknown) {
      setWorkflowError(getErrorMessage(error, 'Unable to start the DataOne workflow.'));
    } finally {
      setLaunching(false);
    }
  };

  const resetWorkflow = () => {
    setScreen('setup');
    setConfig(null);
    setRun(null);
    setWorkflowError(null);
    setPollWarning(null);
    setCompletedAt(null);
    setLaunchMessage(isDemo ? 'Preparing the local data demo' : 'Preparing governed run');
  };

  return (
    <div className="dataone-app">
      {screen !== 'results' && (
        <header className="dataone-topbar">
          <div className="dataone-brand" aria-label="Veltirs DataOne">
            <span>Veltirs DataOne</span>
          </div>
          <div className="dataone-topbar-meta">
            <IdentityBadge identity={identity} loading={identityLoading} failed={identityFailed} isDemo={isDemo} />
          </div>
        </header>
      )}

      {screen === 'setup' && <SetupExperience isDemo={isDemo} onStart={startWorkflow} />}

      {screen === 'progress' && (
        <main className="dataone-workspace">
          <WorkflowHeading
            config={config}
            run={run}
            completedAt={completedAt}
            isDemo={isDemo}
            onReset={resetWorkflow}
          />
          <FlowStepper unlocked={workflowUnlockCount(run, launching)} failed={Boolean(workflowError)} />

          <ProcessingExperience
            config={config}
            run={run}
            launching={launching}
            launchMessage={launchMessage}
            error={workflowError}
            warning={pollWarning}
            isDemo={isDemo}
            onRetry={() => {
              setWorkflowError(null);
              setPollWarning(null);
            }}
            onReset={resetWorkflow}
          />
        </main>
      )}

      {screen === 'results' && config && (
        <ResultsExperience
          config={config}
          identity={identity}
          completedAt={completedAt}
          recentRuns={recentRuns}
          isDemo={isDemo}
          onNewRun={resetWorkflow}
        />
      )}
    </div>
  );
}

function OperationalStoreStatus() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('Checking AWS PostgreSQL…');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/ops/health', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response, 'AWS PostgreSQL is unavailable'));
        const body: unknown = await response.json();
        if (!isDataRow(body) || body.storage !== 'aws-postgresql') {
          throw new Error('The operational store returned an unexpected response.');
        }
        setStatus('ready');
        setMessage('AWS PostgreSQL · connection and project state ready');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setStatus('error');
        setMessage(getErrorMessage(error, 'AWS PostgreSQL is unavailable'));
      });
    return () => controller.abort();
  }, []);

  return (
    <div className={`dataone-connection-state${status === 'error' ? ' is-error' : ''}`}>
      {status === 'loading' ? <Loader2 className="dataone-spin" aria-hidden="true" /> : <span />}
      {message}
    </div>
  );
}

function SetupExperience({
  isDemo,
  onStart,
}: {
  isDemo: boolean;
  onStart: (request: {
    projectName: string;
    sourceMode: SourceMode;
    file: File | null;
    sourceTable: string;
    sourceConnection: string | null;
    targetConnection: string | null;
    sourceConnectionLabel: string | null;
    targetConnectionLabel: string | null;
    sourceDatabase: DatabaseConnectorConfig | null;
    targetDatabase: DatabaseConnectorConfig | null;
    sqliteSource: SqliteSourceSelection | null;
    targetEngine: ExternalTargetEngine;
  }) => Promise<void>;
}) {
  const [projectName, setProjectName] = useState(isDemo ? 'Customer Revenue Quality Demo' : 'Customer 360 Migration');
  const [sourceMode, setSourceMode] = useState<SourceMode>('volume_file');
  const [sourceTable, setSourceTable] = useState(isDemo ? 'workspace.default.bronze_customer_churn' : '');
  const [sqliteSource, setSqliteSource] = useState<SqliteSourceSelection | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [demoSamples, setDemoSamples] = useState<DemoSampleDescriptor[]>([]);
  const [demoSamplesLoading, setDemoSamplesLoading] = useState(isDemo);
  const [demoSamplesError, setDemoSamplesError] = useState<string | null>(null);
  const [sampleLoading, setSampleLoading] = useState<string | null>(null);
  const [selectedSample, setSelectedSample] = useState<string | null>(null);
  const [demoConnections, setDemoConnections] = useState<DemoConnectionPair | null>(null);
  const [demoConnectionsLoading, setDemoConnectionsLoading] = useState(isDemo);
  const [demoConnectionsError, setDemoConnectionsError] = useState<string | null>(null);
  const [sourceDatabase, setSourceDatabase] = useState(() => defaultDatabaseConnector('source'));
  const [targetDatabase, setTargetDatabase] = useState(() => defaultDatabaseConnector('target'));
  const [externalTargetEngine, setExternalTargetEngine] = useState<ExternalTargetEngine>('postgresql');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const postgresTargetTable = projectPostgresTableLeaf(projectName);
  const effectiveTargetDatabase = useMemo(
    () => (targetDatabase.engine === 'postgresql' ? { ...targetDatabase, table: postgresTargetTable } : targetDatabase),
    [postgresTargetTable, targetDatabase]
  );

  const loadDemoSamples = useCallback(async (signal?: AbortSignal) => {
    setDemoSamplesLoading(true);
    setDemoSamplesError(null);
    try {
      const response = await fetch('/api/demo/samples', { signal });
      if (!response.ok) throw new Error(await readError(response, 'Unable to list demo samples.'));
      const samples = parseDemoSamples(await response.json());
      if (!signal?.aborted) setDemoSamples(samples);
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (!signal?.aborted) {
        setDemoSamples([]);
        setDemoSamplesError(getErrorMessage(error, 'Unable to list demo samples.'));
      }
    } finally {
      if (!signal?.aborted) setDemoSamplesLoading(false);
    }
  }, []);

  const loadDemoConnections = useCallback(async (signal?: AbortSignal) => {
    setDemoConnectionsLoading(true);
    setDemoConnectionsError(null);
    try {
      const response = await fetch('/api/demo/connections', { signal });
      if (!response.ok) throw new Error(await readError(response, 'Unable to load demo connection aliases.'));
      const connections = parseDemoConnections(await response.json());
      if (!signal?.aborted) setDemoConnections(connections);
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (!signal?.aborted) {
        setDemoConnections(null);
        setDemoConnectionsError(getErrorMessage(error, 'Unable to load demo connection aliases.'));
      }
    } finally {
      if (!signal?.aborted) setDemoConnectionsLoading(false);
    }
  }, []);

  const testLocalMysql = useCallback(
    async (database: DatabaseConnectorConfig): Promise<DatabaseConnectionTestResult> => {
      const sourceDatabase = localMysqlSourceRequest(database);
      if (!sourceDatabase) throw new Error('Select MySQL to test a live local database connection.');

      const response = await fetch('/api/demo/database/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDatabase }),
      });
      if (!response.ok) throw new Error(await readError(response, 'Unable to connect to local MySQL.'));

      const body: unknown = await response.json();
      if (!isDataRow(body) || typeof body.rowCount !== 'number' || !Array.isArray(body.columns)) {
        throw new Error('The MySQL connection test returned an unexpected response.');
      }
      const columns = body.columns.filter((column): column is string => typeof column === 'string');
      return { rowCount: body.rowCount, columns, table: sourceDatabase.table, tableExists: true };
    },
    []
  );

  const testLocalPostgres = useCallback(
    async (database: DatabaseConnectorConfig): Promise<DatabaseConnectionTestResult> => {
      const targetDatabase = localPostgresTargetRequest(database, postgresTargetTable);
      if (!targetDatabase) throw new Error('Select PostgreSQL to test a live local target connection.');

      const response = await fetch('/api/demo/database/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetDatabase }),
      });
      if (!response.ok) throw new Error(await readError(response, 'Unable to connect to local PostgreSQL.'));

      const body: unknown = await response.json();
      if (
        !isDataRow(body) ||
        typeof body.rowCount !== 'number' ||
        typeof body.table !== 'string' ||
        typeof body.tableExists !== 'boolean' ||
        !Array.isArray(body.columns)
      ) {
        throw new Error('The PostgreSQL connection test returned an unexpected response.');
      }
      const columns = body.columns.filter((column): column is string => typeof column === 'string');
      return { rowCount: body.rowCount, columns, table: body.table, tableExists: body.tableExists };
    },
    [postgresTargetTable]
  );

  useEffect(() => {
    if (!isDemo) return undefined;
    const controller = new AbortController();
    void loadDemoSamples(controller.signal);
    void loadDemoConnections(controller.signal);
    return () => controller.abort();
  }, [isDemo, loadDemoConnections, loadDemoSamples]);

  const chooseFile = (candidate: File | null) => {
    setFileError(null);
    setSelectedSample(null);
    if (!candidate) {
      setFile(null);
      return;
    }
    if (!normalizedExtension(candidate.name)) {
      setFile(null);
      setFileError('Choose a .csv, .json, or .parquet file.');
      return;
    }
    if (candidate.size > MAX_UPLOAD_SIZE) {
      setFile(null);
      setFileError('File exceeds the secure 500 MB upload limit.');
      return;
    }
    setSourceMode('volume_file');
    setFile(candidate);
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    chooseFile(event.target.files?.[0] ?? null);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    chooseFile(event.dataTransfer.files?.[0] ?? null);
  };

  const loadSample = async (descriptor: DemoSampleDescriptor) => {
    setFileError(null);
    setSampleLoading(descriptor.filename);
    try {
      const response = await fetch(descriptor.url);
      if (!response.ok) {
        throw new Error(await readError(response, `Unable to load ${descriptor.filename}`));
      }
      const sample = await response.blob();
      chooseFile(
        new File([sample], descriptor.filename, {
          type: descriptor.mediaType ?? demoSampleMimeType(descriptor.format),
        })
      );
      setSelectedSample(descriptor.filename);
    } catch (error: unknown) {
      setFileError(getErrorMessage(error, `Unable to load ${descriptor.filename}.`));
    } finally {
      setSampleLoading(null);
    }
  };

  const projectReady = projectName.trim().length >= 3;
  const sourceDatabaseValidation = validateDatabaseConnector(sourceDatabase);
  const targetDatabaseValidation = validateDatabaseConnector(effectiveTargetDatabase);
  const databaseReady = Boolean(
    demoConnections?.source.alias &&
      demoConnections?.target.alias &&
      sourceDatabaseValidation.valid &&
      targetDatabaseValidation.valid
  );
  const sourceReady =
    sourceMode === 'volume_file'
      ? Boolean(file)
      : sourceMode === 'sqlite_file'
        ? Boolean(sqliteSource)
        : sourceMode === 'demo_database'
          ? databaseReady
          : /^[^\s.]+\.[^\s.]+\.[^\s.]+$/.test(sourceTable.trim());
  const canStart = projectReady && sourceReady;
  const projectGoldTarget = projectGoldTableName(projectName);

  return (
    <main className="dataone-setup dataone-welcome">
      <section className="dataone-welcome-heading">
        <Badge variant="outline" className="dataone-eyebrow">
          <Sparkles aria-hidden="true" />
          DATABRICKS-NATIVE DATA ENGINEERING
        </Badge>
        <h1>Welcome to DataOne</h1>
        <p>Select an ingestion method, then run profiling, mapping, quality, governance, and AskData.</p>
      </section>

      {isDemo && (
        <Alert className="dataone-demo-banner">
          <FileSpreadsheet aria-hidden="true" />
          <AlertTitle>Local demo mode · synthetic file and database scenarios</AlertTitle>
          <AlertDescription>
            CSV, JSON, and Parquet use deterministic local fixtures. The MySQL connector can read a live database on
            this Mac; Databricks resources and target publication remain simulated in demo mode.
          </AlertDescription>
        </Alert>
      )}

      <div className="dataone-project-inline">
        <div>
          <Label htmlFor="project-name">Project name</Label>
          <Input
            id="project-name"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            placeholder="Customer 360 Migration"
            autoComplete="off"
          />
        </div>
        <span>
          <ShieldCheck aria-hidden="true" /> A unique run ID isolates every execution.
        </span>
      </div>

      <section className="dataone-welcome-options" aria-label="Choose a governed source">
        <Card
          className={`dataone-panel dataone-option-card dataone-upload-option${sourceMode === 'volume_file' ? ' is-selected' : ''}`}
          onClick={() => setSourceMode('volume_file')}
        >
          <CardHeader>
            <div className="dataone-option-label">
              <span>Option 1</span>
              {sourceMode === 'volume_file' && <Badge variant="secondary">Selected</Badge>}
            </div>
            <CardTitle>Quick Upload</CardTitle>
            <CardDescription>
              {isDemo
                ? 'Load one of three real sample files or choose another supported file for the local walkthrough.'
                : 'Upload a CSV, JSON, or Parquet file into a governed Unity Catalog Volume.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isDemo && (
              <section className="dataone-demo-sample-picker" aria-labelledby="demo-samples-title">
                <div>
                  <strong id="demo-samples-title">Bundled file samples</strong>
                  <span>Fetched as real browser File objects, then sent through the same upload flow.</span>
                </div>

                {demoSamplesLoading && (
                  <div className="dataone-demo-sample-loading" aria-label="Loading bundled demo samples">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                )}

                {!demoSamplesLoading && demoSamplesError && (
                  <Alert variant="destructive" className="dataone-inline-alert">
                    <CircleAlert aria-hidden="true" />
                    <AlertTitle>Sample list unavailable</AlertTitle>
                    <AlertDescription>{demoSamplesError}</AlertDescription>
                    <Button type="button" size="sm" variant="outline" onClick={() => void loadDemoSamples()}>
                      <RefreshCw aria-hidden="true" /> Retry
                    </Button>
                  </Alert>
                )}

                {!demoSamplesLoading && !demoSamplesError && demoSamples.length === 0 && (
                  <Empty className="dataone-demo-sample-empty">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <FileText aria-hidden="true" />
                      </EmptyMedia>
                      <EmptyTitle>No bundled samples returned</EmptyTitle>
                      <EmptyDescription>Use Browse Files, or retry after the demo server is ready.</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}

                {!demoSamplesLoading && !demoSamplesError && demoSamples.length > 0 && (
                  <div className="dataone-demo-sample-grid">
                    {demoSamples.map((sample) => {
                      const SampleIcon =
                        sample.format === 'csv' ? FileSpreadsheet : sample.format === 'json' ? FileJson2 : Layers3;
                      const loading = sampleLoading === sample.filename;
                      return (
                        <button
                          type="button"
                          key={`${sample.format}-${sample.filename}`}
                          className={selectedSample === sample.filename ? 'is-selected' : undefined}
                          disabled={Boolean(sampleLoading)}
                          onClick={(event) => {
                            event.stopPropagation();
                            void loadSample(sample);
                          }}
                        >
                          {loading ? <Loader2 className="dataone-spin" aria-hidden="true" /> : <SampleIcon />}
                          <span>
                            <strong>
                              {sample.label ?? sample.format.toUpperCase()}
                              {sample.rowCount != null ? ` · ${formatInteger(sample.rowCount)} rows` : ''}
                            </strong>
                            <small>{sample.description ?? sample.filename}</small>
                            <code>{sample.filename}</code>
                          </span>
                          <Badge variant="outline">{sample.format.toUpperCase()}</Badge>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            <div
              className={`dataone-dropzone${dragActive ? ' is-dragging' : ''}${file ? ' has-file' : ''}`}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragActive(true);
                setSourceMode('volume_file');
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragActive(false)}
              onDrop={onDrop}
            >
              <input
                ref={fileInputRef}
                className="sr-only"
                type="file"
                accept=".csv,.json,.parquet,text/csv,application/json,application/vnd.apache.parquet"
                onChange={onFileChange}
              />
              <div className="dataone-file-icons" aria-hidden="true">
                <FileSpreadsheet />
                <FileJson2 />
                <Layers3 />
              </div>
              {file ? (
                <>
                  <strong>{file.name}</strong>
                  <span>
                    {(file.size / 1024 / 1024).toFixed(2)} MB · ready for{' '}
                    {isDemo ? 'local simulation' : 'governed upload'}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={(event) => {
                      event.stopPropagation();
                      setSourceMode('volume_file');
                      fileInputRef.current?.click();
                    }}
                  >
                    Replace File
                  </Button>
                </>
              ) : (
                <>
                  <strong>Drag & Drop data file here</strong>
                  <span>or</span>
                  <div className="dataone-file-actions">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSourceMode('volume_file');
                        fileInputRef.current?.click();
                      }}
                    >
                      Browse Files
                    </Button>
                  </div>
                </>
              )}
              <small>Supports .csv, .json, and .parquet files up to 500 MB</small>
            </div>
            {fileError && (
              <Alert variant="destructive" className="dataone-inline-alert">
                <CircleAlert aria-hidden="true" />
                <AlertTitle>File not accepted</AlertTitle>
                <AlertDescription>{fileError}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <div className="dataone-welcome-or" aria-hidden="true">
          <span>OR</span>
        </div>

        <Card
          className={`dataone-panel dataone-option-card dataone-connection-option${sourceMode === 'uc_table' || sourceMode === 'sqlite_file' ? ' is-selected' : ''}`}
          aria-disabled={isDemo}
        >
          <CardHeader>
            <div className="dataone-option-label">
              <span>Option 2</span>
              {isDemo ? (
                <Badge variant="outline">Production reference</Badge>
              ) : (
                (sourceMode === 'uc_table' || sourceMode === 'sqlite_file') && (
                  <Badge variant="secondary">Selected</Badge>
                )
              )}
            </div>
            <CardTitle>AWS / SQLite → Databricks → Selected AWS Target</CardTitle>
            <CardDescription>
              {isDemo
                ? 'Shown as the production installation pattern. Local controls cover CSV, JSON, Parquet, plus a separate alias-based database demo.'
                : 'Select an AWS MySQL, PostgreSQL, or Oracle table, or upload a local SQLite database. DataOne runs Spark and Lakeflow, then publishes the project Gold table to the selected AWS database.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="dataone-connection-grid">
            <div className="dataone-connection-card">
              <div className="dataone-connection-title">
                <Database aria-hidden="true" />
                <div>
                  <strong>AWS or Local SQLite Source</strong>
                  <span>{isDemo ? 'Production resource-bound table' : 'Federation or governed Volume ingestion'}</span>
                </div>
              </div>
              {isDemo ? (
                <>
                  <Label htmlFor="source-type">Source type</Label>
                  <div id="source-type" className="dataone-static-field">
                    AWS RDS database · Lakehouse Federation <ChevronDown aria-hidden="true" />
                  </div>
                  <Label htmlFor="source-table">Catalog · schema · table</Label>
                  <Input id="source-table" value={sourceTable} disabled />
                </>
              ) : (
                <FederatedSourceSetup
                  value={sourceTable}
                  sqliteValue={sqliteSource}
                  onChange={(nextSourceTable) => {
                    setSqliteSource(null);
                    setSourceMode('uc_table');
                    setSourceTable(nextSourceTable);
                  }}
                  onSqliteChange={(nextSqliteSource) => {
                    setSqliteSource(nextSqliteSource);
                    setSourceTable('');
                    if (nextSqliteSource) setSourceMode('sqlite_file');
                  }}
                  onEngineChange={(engine) => setSourceMode(engine === 'sqlite' ? 'sqlite_file' : 'uc_table')}
                />
              )}
              <div className="dataone-connection-state">
                <span />{' '}
                {isDemo
                  ? 'Not called by this demo'
                  : sourceMode === 'sqlite_file'
                    ? 'SQLite file is staged in the bound Unity Catalog Volume'
                    : 'Database credentials stay in Unity Catalog'}
              </div>
              {!isDemo && <OperationalStoreStatus />}
            </div>

            <div className="dataone-connection-card">
              <div className="dataone-connection-title">
                <Layers3 aria-hidden="true" />
                <div>
                  <strong>{externalTargetEngine === 'mysql' ? 'AWS MySQL Target' : 'AWS PostgreSQL Target'}</strong>
                  <span>{isDemo ? 'Production target pattern' : 'Gold output plus verified external publication'}</span>
                </div>
              </div>
              <Label htmlFor="external-target-engine">External target database</Label>
              <select
                id="external-target-engine"
                className="dataone-static-field"
                value={externalTargetEngine}
                disabled={isDemo}
                onChange={(event) => setExternalTargetEngine(event.target.value as ExternalTargetEngine)}
              >
                <option value="postgresql">AWS PostgreSQL</option>
                <option value="mysql">AWS MySQL</option>
              </select>
              <Label>Governed target catalog</Label>
              <div className="dataone-static-field">workspace</div>
              <Label>Governed target schema</Label>
              <div className="dataone-static-field">dataone_gold</div>
              <Label>Final project table</Label>
              <div className="dataone-static-field">{projectGoldTarget}</div>
              <Label>Execution</Label>
              <div className="dataone-static-field">
                {isDemo
                  ? 'Production: Job → Pipeline → project table'
                  : `Job → Spark Declarative Pipeline → Gold Delta → AWS ${
                      externalTargetEngine === 'mysql' ? 'MySQL' : 'PostgreSQL'
                    } export`}
              </div>
              <div className="dataone-connection-state">
                <span /> {isDemo ? 'Not called by this demo' : 'Credentials are read from Databricks secrets'}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {isDemo && (
        <Card className={`dataone-panel dataone-database-demo${sourceMode === 'demo_database' ? ' is-selected' : ''}`}>
          <CardHeader>
            <div className="dataone-option-label">
              <span>Option 3</span>
              <Badge variant="outline">
                {sourceMode === 'demo_database'
                  ? sourceDatabase.engine === 'mysql'
                    ? effectiveTargetDatabase.engine === 'postgresql'
                      ? 'Selected · live MySQL → PostgreSQL'
                      : 'Selected · live MySQL source'
                    : 'Selected · simulated execution'
                  : 'Connector configuration'}
              </Badge>
            </div>
            <CardTitle>Source Database → Target Database</CardTitle>
            <CardDescription>
              Configure MySQL, PostgreSQL, Oracle, SQLite, or Databricks on either side. The local demo can read a
              loopback MySQL table and publish the transformed columns to loopback PostgreSQL.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {demoConnectionsLoading && (
              <div className="dataone-demo-connection-status" aria-label="Loading demo connection aliases">
                <Loader2 className="dataone-spin" aria-hidden="true" /> Loading safe demo execution aliases…
              </div>
            )}

            {!demoConnectionsLoading && demoConnectionsError && (
              <Alert variant="destructive" className="dataone-inline-alert">
                <CircleAlert aria-hidden="true" />
                <AlertTitle>Database demo aliases unavailable</AlertTitle>
                <AlertDescription>{demoConnectionsError}</AlertDescription>
                <Button type="button" size="sm" variant="outline" onClick={() => void loadDemoConnections()}>
                  <RefreshCw aria-hidden="true" /> Retry
                </Button>
              </Alert>
            )}

            {!demoConnectionsLoading && !demoConnectionsError && !demoConnections && (
              <Empty className="dataone-demo-connections-empty">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Database aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>No valid connection pair returned</EmptyTitle>
                  <EmptyDescription>
                    The database run remains disabled until both aliases are verified.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}

            <div className="dataone-database-connector-grid">
              <DatabaseConnectorSetup
                role="source"
                value={sourceDatabase}
                onChange={setSourceDatabase}
                onTestConnection={sourceDatabase.engine === 'mysql' ? testLocalMysql : undefined}
              />
              <span className="dataone-database-transfer-arrow" aria-hidden="true">
                <ArrowRight />
                <small>ETL + quality</small>
              </span>
              <DatabaseConnectorSetup
                role="target"
                value={effectiveTargetDatabase}
                onChange={(nextValue) =>
                  setTargetDatabase(
                    nextValue.engine === 'postgresql' ? { ...nextValue, table: postgresTargetTable } : nextValue
                  )
                }
                onTestConnection={effectiveTargetDatabase.engine === 'postgresql' ? testLocalPostgres : undefined}
                tableReadOnly={effectiveTargetDatabase.engine === 'postgresql'}
              />
            </div>

            <div className="dataone-demo-database-actions">
              <Button
                type="button"
                variant={sourceMode === 'demo_database' ? 'secondary' : 'outline'}
                disabled={!databaseReady}
                onClick={() => setSourceMode('demo_database')}
              >
                <Database aria-hidden="true" />
                {sourceMode === 'demo_database' ? 'Database flow selected' : 'Use database connectors'}
              </Button>
              <span>
                <LockKeyhole aria-hidden="true" /> Database credentials go only to the localhost backend and are never
                persisted, logged, or returned.
              </span>
            </div>

            <Alert className="dataone-demo-export-note">
              <CircleAlert aria-hidden="true" />
              <AlertTitle>Live local MySQL → PostgreSQL publication</AlertTitle>
              <AlertDescription>
                The PostgreSQL table name is derived from the project name: public.{postgresTargetTable}. A rerun
                transactionally replaces only that exact table and stores the transformed dataset columns without adding
                DataOne quality metadata. Production should use governed resource bindings instead of local
                browser-entered credentials.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      <section className="dataone-marketplace-note">
        <LockKeyhole aria-hidden="true" />
        <div>
          <strong>External AWS database sources</strong>
          <span>
            Configure MySQL, PostgreSQL, or Oracle as a Unity Catalog Connection and foreign catalog. DataOne reads the
            selected table through Spark, transforms it in a Lakeflow Pipeline, and runs a separately authorized
            PostgreSQL export task for the target. SQLite is uploaded to a governed Volume and read by the same Job. AWS
            PostgreSQL stores only app state and aliases—not database passwords.
          </span>
        </div>
      </section>

      <section className="dataone-launch-strip">
        {isDemo && (
          <div>
            <LockKeyhole aria-hidden="true" />
            <span>
              The database demo reads and writes locally while simulating the Databricks Job and Pipeline stages.
            </span>
          </div>
        )}
        <Button
          size="lg"
          className="dataone-start-button"
          disabled={!canStart}
          onClick={() =>
            void onStart({
              projectName,
              sourceMode,
              file,
              sourceTable,
              sourceConnection: demoConnections?.source.alias ?? null,
              targetConnection: demoConnections?.target.alias ?? null,
              sourceConnectionLabel: databaseConnectorLabel(sourceDatabase),
              targetConnectionLabel: databaseConnectorLabel(effectiveTargetDatabase),
              sourceDatabase,
              targetDatabase: effectiveTargetDatabase,
              sqliteSource,
              targetEngine: externalTargetEngine,
            })
          }
        >
          {sourceMode === 'demo_database'
            ? sourceDatabase.engine === 'mysql'
              ? effectiveTargetDatabase.engine === 'postgresql'
                ? 'Transform MySQL → PostgreSQL'
                : 'Read Local MySQL & Open Dashboard'
              : 'Simulate Database Flow & Open Dashboard'
            : isDemo
              ? 'Run File Sample & Open Dashboard'
              : sourceMode === 'sqlite_file'
                ? 'Upload SQLite & Run Databricks Workflow'
                : sourceMode === 'uc_table'
                  ? 'Run AWS Database → Databricks Workflow'
                  : 'Upload & Run Databricks Workflow'}
          <ArrowRight aria-hidden="true" />
        </Button>
        {!canStart && (
          <p>
            {!projectReady
              ? 'Enter a project name to continue.'
              : sourceMode === 'volume_file'
                ? 'Select a supported file or choose the database demo.'
                : sourceMode === 'sqlite_file'
                  ? 'Choose a SQLite file and select a compatible table.'
                  : sourceMode === 'demo_database'
                    ? 'Wait for valid source and target aliases, or retry the connection descriptor request.'
                    : 'Connect an AWS database and select a dataset to continue.'}
          </p>
        )}
      </section>
    </main>
  );
}

function WorkflowHeading({
  config,
  run,
  completedAt,
  isDemo,
  onReset,
}: {
  config: WorkflowConfig | null;
  run: JobRun | null;
  completedAt: Date | null;
  isDemo: boolean;
  onReset: () => void;
}) {
  const status = runResult(run) ?? runStatus(run);
  return (
    <section className="dataone-workflow-heading">
      <div>
        <Badge variant="outline" className="dataone-eyebrow">
          <Workflow aria-hidden="true" />
          {isDemo ? 'LOCAL DEMO WORKFLOW' : 'ONE-CLICK GOVERNED WORKFLOW'}
        </Badge>
        <h1>{config?.projectName ?? 'Starting DataOne'}</h1>
        <p>
          {config?.sourceLabel ?? 'Preparing source'}
          <ChevronRight aria-hidden="true" />
          {config?.sourceMode === 'demo_database' && (
            <>
              {TARGET_SCHEMA}
              <ChevronRight aria-hidden="true" />
            </>
          )}
          {config?.targetLabel ?? TARGET_SCHEMA}
        </p>
      </div>
      <div className="dataone-run-summary">
        <div>
          <span>{isDemo ? 'Simulated job run' : 'Databricks job run'}</span>
          <strong>{run?.run_id ? `#${run.run_id}` : runResult(run) === 'SUCCESS' ? 'Completed' : 'Creating…'}</strong>
        </div>
        <ToneBadge status={status} />
        {completedAt && <span>Completed {formatTimestamp(completedAt)}</span>}
        <Button variant="outline" onClick={onReset}>
          New run
        </Button>
      </div>
    </section>
  );
}

function FlowStepper({ unlocked, failed }: { unlocked: number; failed: boolean }) {
  return (
    <nav className="dataone-stepper" aria-label="DataOne workflow steps">
      {FLOW_STEPS.map((step, index) => {
        const Icon = step.icon;
        const complete = !failed && index < unlocked;
        const active = failed ? index === Math.max(unlocked - 1, 0) : index === unlocked;
        return (
          <div
            className={`dataone-step${complete ? ' is-complete' : ''}${active ? ' is-active' : ''}`}
            key={step.label}
            aria-current={active ? 'step' : undefined}
          >
            <span className="dataone-step-icon">
              {complete ? <Check aria-hidden="true" /> : <Icon aria-hidden="true" />}
            </span>
            <span>{step.label}</span>
          </div>
        );
      })}
    </nav>
  );
}

function ProcessingExperience({
  config,
  run,
  launching,
  launchMessage,
  error,
  warning,
  isDemo,
  onRetry,
  onReset,
}: {
  config: WorkflowConfig | null;
  run: JobRun | null;
  launching: boolean;
  launchMessage: string;
  error: string | null;
  warning: string | null;
  isDemo: boolean;
  onRetry: () => void;
  onReset: () => void;
}) {
  const unlocked = workflowUnlockCount(run, launching);
  const percent = Math.round((unlocked / FLOW_STEPS.length) * 100);
  const profile = taskByKey(run, 'profile_source');
  const pipeline = taskByKey(run, 'quality_pipeline');
  const publishProjectGold = taskByKey(run, 'publish_project_gold');
  const publishExternalDatabase = externalPublishTask(run);
  const publishTarget = taskByKey(run, 'publish_target');
  const publishTask = isDemo ? publishTarget : publishProjectGold;
  const currentMessage = launching
    ? launchMessage
    : publishExternalDatabase?.state?.life_cycle_state === 'RUNNING'
      ? `The final Job task is publishing governed business columns to the configured ${
          config?.targetEngine === 'mysql' ? 'MySQL' : 'PostgreSQL'
        } target.`
      : publishTask?.state?.life_cycle_state === 'RUNNING'
        ? isDemo
          ? config?.targetLive
            ? `Publishing transformed records to ${config.targetLabel}.`
            : 'The demo is simulating the separately controlled PostgreSQL export step.'
          : `Publishing quality-checked records to ${config?.outputTable ?? TARGET_SCHEMA}.`
        : pipeline?.state?.life_cycle_state === 'RUNNING'
          ? isDemo
            ? 'The local simulator is applying quality rules and deterministic transformations.'
            : 'Lakeflow is applying expectations, cleaning, and governed transformations.'
          : profile?.state?.life_cycle_state === 'RUNNING'
            ? isDemo
              ? 'The local simulator is profiling the sample and building schema intelligence.'
              : 'Spark is profiling the source and building schema intelligence.'
            : isDemo
              ? 'The simulated run is queued in the local demo backend.'
              : 'The Databricks job is queued for serverless compute.';

  return (
    <section className="dataone-processing" aria-live="polite">
      {warning && (
        <Alert className="dataone-inline-alert">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Status refresh delayed</AlertTitle>
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      )}

      {error ? (
        <Alert variant="destructive" className="dataone-run-error">
          <XCircle aria-hidden="true" />
          <AlertTitle>The governed run needs attention</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
          <div className="dataone-alert-actions">
            {run?.run_id && (
              <Button variant="outline" onClick={onRetry}>
                <RefreshCw aria-hidden="true" />
                Retry status check
              </Button>
            )}
            <Button variant="outline" onClick={onReset}>
              Return to setup
            </Button>
          </div>
        </Alert>
      ) : (
        <Card className="dataone-panel dataone-processing-card">
          <CardContent>
            <div className="dataone-processing-orb" aria-hidden="true">
              <Loader2 />
            </div>
            <Badge variant="secondary">{isDemo ? 'Simulated local execution' : 'Live Databricks execution'}</Badge>
            <h2>{currentMessage}</h2>
            <p>
              {isDemo
                ? 'The UI polls the local fixture API and unlocks every view when the deterministic run succeeds.'
                : 'Keep this page open. The app polls Lakeflow Jobs and unlocks every view only after the run succeeds.'}
            </p>
            <div className="dataone-progress-block">
              <div>
                <span>Workflow views unlocked</span>
                <strong>
                  {unlocked} of {FLOW_STEPS.length}
                </strong>
              </div>
              <Progress value={percent} aria-label={`${unlocked} of ${FLOW_STEPS.length} workflow views unlocked`} />
            </div>
            <div className="dataone-task-grid">
              <TaskStatus
                title="Source profile"
                component={
                  isDemo
                    ? config?.sourceMode === 'demo_database'
                      ? 'MySQL alias simulator'
                      : 'Local file profile simulator'
                    : 'Lakeflow Job · Spark'
                }
                state={
                  launching
                    ? 'PREPARING'
                    : (profile?.state?.result_state ?? profile?.state?.life_cycle_state ?? runStatus(run))
                }
              />
              <TaskStatus
                title="Quality & transformation"
                component={isDemo ? 'Local quality simulator' : 'Spark Declarative Pipeline'}
                state={pipeline?.state?.result_state ?? pipeline?.state?.life_cycle_state ?? 'WAITING'}
              />
              <TaskStatus
                title={
                  config?.sourceMode === 'demo_database' ? 'Controlled export preview' : 'Project Gold publication'
                }
                component={
                  isDemo
                    ? config?.sourceMode === 'demo_database'
                      ? config?.targetLive
                        ? config.targetLabel
                        : 'PostgreSQL export simulator'
                      : `Local preview · ${config?.outputTable ?? TARGET_SCHEMA}`
                    : (config?.outputTable ?? TARGET_SCHEMA)
                }
                state={
                  config?.sourceMode === 'demo_database'
                    ? (publishTarget?.state?.result_state ?? publishTarget?.state?.life_cycle_state ?? 'WAITING')
                    : isDemo
                      ? runResult(run) === 'SUCCESS'
                        ? 'PREVIEW_READY'
                        : 'WAITING'
                      : (publishProjectGold?.state?.result_state ??
                        publishProjectGold?.state?.life_cycle_state ??
                        'WAITING')
                }
              />
            </div>
            <div className="dataone-execution-note">
              <LockKeyhole aria-hidden="true" />
              {isDemo
                ? 'This is a deterministic local simulation. No workspace credential or Databricks resource is used.'
                : 'Files and Jobs execute as the DataOne app service principal. The signed-in human identity remains visible in the authenticated app session.'}
            </div>
            {config && <code>run_id: {config.runId}</code>}
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function TaskStatus({ title, component, state }: { title: string; component: string; state: string }) {
  return (
    <div className="dataone-task-status">
      <div>
        <span>{title}</span>
        <small>{component}</small>
      </div>
      <ToneBadge status={state} />
    </div>
  );
}

const WORKSPACE_VIEW_COPY: Record<WorkspaceView, { title: string; description: string }> = {
  dashboard: {
    title: 'Pipeline Overview',
    description: 'A unified view of migration, quality, and governance across this DataOne run.',
  },
  mapper: {
    title: 'Schema Mapper Workbench',
    description: 'Inspect source-to-target fields with generated confidence, type comparison, and review status.',
  },
  governance: {
    title: 'Autopilot Governance',
    description: 'Review governed assets, semantic definitions, and controls before downstream use.',
  },
  askdata: {
    title: 'AskData (NL2SQL)',
    description: 'Ask natural-language questions and inspect the SQL generated for each answer.',
  },
  quality: {
    title: 'Data Quality',
    description: 'Trace validity, completeness, transformations, and quarantined records for the selected run.',
  },
  visualizations: {
    title: 'Data Visualization',
    description: 'Compare quality exceptions and business outcomes from the current run.',
  },
  prediction: {
    title: 'Prediction & Risk Forecast',
    description: 'Inspect a transparent rule-based risk scenario derived from current-run analytics.',
  },
  audit: {
    title: 'Audit Trail & Cross-Source Intelligence',
    description: 'Follow the processing topology, execution identity, and recent DataOne activity.',
  },
};

function ResultsExperience({
  config,
  identity,
  completedAt,
  recentRuns,
  isDemo,
  onNewRun,
}: {
  config: WorkflowConfig;
  identity: Identity | null;
  completedAt: Date | null;
  recentRuns: QueryState;
  isDemo: boolean;
  onNewRun: () => void;
}) {
  const [activeView, setActiveView] = useState<WorkspaceView>('dashboard');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const copy = WORKSPACE_VIEW_COPY[activeView];
  const signedInAs = identity?.email ?? identity?.user ?? (isDemo ? 'Demo viewer' : 'Databricks user');

  const selectView = (view: WorkspaceView) => {
    setActiveView(view);
    setMobileNavOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="dataone-results-shell">
      <aside className={`dataone-sidebar${mobileNavOpen ? ' is-open' : ''}`} aria-label="DataOne navigation">
        <div className="dataone-sidebar-header">
          <div className="dataone-brand" aria-label="Veltirs DataOne">
            <span>Veltirs DataOne</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="dataone-sidebar-close"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
          >
            <X aria-hidden="true" />
          </Button>
        </div>

        <nav className="dataone-sidebar-nav">
          {WORKSPACE_NAV.map((item) => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                key={item.id}
                className={activeView === item.id ? 'is-active' : undefined}
                aria-current={activeView === item.id ? 'page' : undefined}
                onClick={() => selectView(item.id)}
              >
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="dataone-sidebar-footer">
          <div className="dataone-user-avatar" aria-hidden="true">
            {signedInAs
              .split(/[.@\s_-]+/)
              .slice(0, 2)
              .map((part) => part.charAt(0).toUpperCase())
              .join('') || 'DU'}
          </div>
          <div>
            <strong>{signedInAs}</strong>
            <span>{isDemo ? 'Local demo identity' : 'Databricks authenticated'}</span>
          </div>
          <div className="dataone-workspace-label">
            <span>Workspace</span>
            <strong>{isDemo ? 'Local demo' : 'Production'}</strong>
          </div>
          <div className="dataone-session-state">
            <span />
            {isDemo
              ? config.sourceLive
                ? config.targetLive
                  ? 'Live local MySQL → PostgreSQL · simulated Databricks stages'
                  : 'Live local MySQL source · simulated Databricks processing'
                : 'Synthetic fixture backend · no Databricks calls'
              : 'Session active · app service principal executes resources'}
          </div>
        </div>
      </aside>

      {mobileNavOpen && (
        <button
          type="button"
          className="dataone-sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <main className="dataone-results-main">
        <header className="dataone-results-toolbar">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="dataone-mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu aria-hidden="true" />
          </Button>
          <div className="dataone-source-status">
            <span className="dataone-live-dot" />
            <div>
              <strong>
                {config.sourceLabel} <ArrowRight aria-hidden="true" />
                {config.sourceMode === 'demo_database' && (
                  <>
                    {TARGET_SCHEMA} <ArrowRight aria-hidden="true" />
                  </>
                )}
                {config.targetLabel}
              </strong>
              <span>
                {config.sourceMode === 'demo_database'
                  ? config.sourceLive
                    ? config.targetLive
                      ? 'Live source read → transformed PostgreSQL publication · '
                      : 'Live source read → simulated processing and target preview · '
                    : 'Governed processing → controlled export · '
                  : ''}
                {isDemo ? (config.sourceLive ? 'Processed locally at' : 'Simulated at') : 'Last synced'}:{' '}
                {formatTimestamp(completedAt)} · run {config.runId.slice(0, 12)}
              </span>
            </div>
            <Badge variant="outline" className="dataone-tone dataone-tone--good">
              {isDemo
                ? config.sourceMode === 'demo_database'
                  ? config.sourceLive
                    ? config.targetLive
                      ? 'PostgreSQL target verified'
                      : 'Local MySQL read complete'
                    : 'Alias simulation complete'
                  : 'Demo complete'
                : 'Connected'}
            </Badge>
          </div>
          <div className="dataone-toolbar-actions">
            <Button type="button" variant="secondary" onClick={onNewRun}>
              <Play aria-hidden="true" /> Run New Analysis
            </Button>
            <Button type="button" variant="outline" onClick={() => selectView('governance')}>
              <Clock3 aria-hidden="true" /> Review Governance
            </Button>
          </div>
        </header>

        <section className="dataone-page-heading">
          <div>
            <p className="dataone-page-kicker">
              {isDemo
                ? config.sourceLive
                  ? config.targetLive
                    ? 'LIVE MYSQL SOURCE · VERIFIED POSTGRESQL TARGET'
                    : 'LIVE LOCAL MYSQL SOURCE · SIMULATED DATABRICKS PROCESSING'
                  : 'LOCAL SYNTHETIC DEMO · NO DATABRICKS CALLS'
                : 'LIVE DATABRICKS RESOURCES'}
            </p>
            <h1>{copy.title}</h1>
            <p>{copy.description}</p>
          </div>
          <Badge variant="outline" className="dataone-date-filter">
            {isDemo ? 'Demo run' : 'Current run'} <CalendarDays aria-hidden="true" />
          </Badge>
        </section>

        <ResultsViewContent
          activeView={activeView}
          config={config}
          identity={identity}
          completedAt={completedAt}
          recentRuns={recentRuns}
          isDemo={isDemo}
          onNavigate={selectView}
        />
      </main>
    </div>
  );
}

function ResultsViewContent({
  activeView,
  config,
  identity,
  completedAt,
  recentRuns,
  isDemo,
  onNavigate,
}: {
  activeView: WorkspaceView;
  config: WorkflowConfig;
  identity: Identity | null;
  completedAt: Date | null;
  recentRuns: QueryState;
  isDemo: boolean;
  onNavigate: (view: WorkspaceView) => void;
}) {
  const [showAllSuggestions, setShowAllSuggestions] = useState(true);
  const runParam = useMemo(() => ({ run_id: sql.string(config.runId) }), [config.runId]);

  // [DBX-ANALYTICS] Each hook executes its matching file in config/queries through
  // the AppKit Analytics plugin and the resource-bound SQL warehouse. No SELECT
  // statement or warehouse credential is sent from the browser.
  const kpis = validateDataRowQuery(useAnalyticsQuery('dashboard_kpis', runParam), 'dashboard_kpis');
  const quality = useAnalyticsQuery('quality_by_column', runParam);
  const issues = useAnalyticsQuery('quality_issue_distribution', runParam);
  const transformations = useAnalyticsQuery('transformation_summary', runParam);
  const mappings = validateDataRowQuery(useAnalyticsQuery('schema_mapping', runParam), 'schema_mapping');
  const inventory = validateDataRowQuery(useAnalyticsQuery('database_inventory'), 'database_inventory');
  const commerce = useAnalyticsQuery('commerce_performance', runParam);
  const cleanedRecords = useAnalyticsQuery('cleaned_records', runParam);
  const topology = validateDataRowQuery(useAnalyticsQuery('topology_inventory', runParam), 'topology_inventory');

  const newest = kpis.data?.[0];
  const freshness = formatTimestamp(valueFrom(newest, ['updated_at', 'started_at']) ?? completedAt);
  const qualityScore = numberFrom(newest, ['quality_score']);
  const mappingConfidence = numberFrom(newest, ['mapping_confidence_pct']);
  const rowCount = numberFrom(newest, ['row_count']);
  const cleanedRows = numberFrom(newest, ['cleaned_rows']);
  const quarantinedRows = numberFrom(newest, ['quarantined_rows']);
  const mappedRows = mappings.data ?? [];
  const autoMappedCount = mappedRows.filter((row) => textFrom(row, ['review_status']) === 'AUTO_MAPPED').length;
  const reviewRequiredCount = mappedRows.filter((row) => textFrom(row, ['review_status']) === 'REVIEW_REQUIRED').length;
  const qualityRows = quality.data ?? [];
  const healthyColumnCount = qualityRows.filter((row) => textFrom(row, ['health_status']) === 'HEALTHY').length;
  const quarantineRate =
    rowCount != null && rowCount > 0 && quarantinedRows != null ? (quarantinedRows / rowCount) * 100 : null;
  const mappingReviewRate = mappedRows.length > 0 ? (reviewRequiredCount / mappedRows.length) * 100 : null;
  const qualityGap = qualityScore == null ? null : Math.max(0, 100 - qualityScore);
  const riskScore =
    qualityGap == null || quarantineRate == null || mappingReviewRate == null
      ? null
      : Math.round(Math.min(100, qualityGap * 0.5 + quarantineRate * 0.3 + mappingReviewRate * 0.2));
  const riskLevel = riskScore == null ? 'Not available' : riskScore < 20 ? 'LOW' : riskScore < 40 ? 'MODERATE' : 'HIGH';
  const averageCompleteness =
    qualityRows.length > 0
      ? qualityRows.reduce((sum, row) => sum + (numberFrom(row, ['completeness_pct']) ?? 0), 0) / qualityRows.length
      : null;
  const visibleMappings = showAllSuggestions
    ? mappedRows
    : mappedRows.filter((row) => textFrom(row, ['review_status']) === 'AUTO_MAPPED');
  const generatedMappingProjection = (mappings.data ?? []).slice(0, 20).map((row, index, rows) => {
    const sourceColumn = textFrom(row, ['source_column'], 'source_column').replaceAll('`', '``');
    const targetColumn = textFrom(row, ['target_column'], 'target_column').replaceAll('`', '``');
    return `  \`${sourceColumn}\` AS \`${targetColumn}\`${index === rows.length - 1 ? '' : ','}`;
  });
  const generatedMappingSource =
    config.sourceMode === 'uc_table'
      ? config.sourceTable
      : config.sourceLive
        ? config.sourceTable
            .split('.')
            .map((segment) => `\`${segment.replaceAll('`', '``')}\``)
            .join('.')
        : config.sourceLabel;
  const generatedMappingSql = ['SELECT', ...generatedMappingProjection, `FROM ${generatedMappingSource};`].join('\n');

  const qualityChart = useMemo(
    () =>
      (quality.data ?? [])
        .map((row) => ({
          column: textFrom(row, ['column_name']),
          quality_score: numberFrom(row, ['quality_score']) ?? 0,
        }))
        .filter((row) => row.column !== '—'),
    [quality.data]
  );

  const issueChart = useMemo(
    () =>
      (issues.data ?? [])
        .filter((row) => numberFrom(row, ['issue_count']) != null)
        .map((row) => ({
          issue: textFrom(row, ['issue_label', 'quality_issue']),
          issue_count: numberFrom(row, ['issue_count']) ?? 0,
        })),
    [issues.data]
  );

  const commerceChart = useMemo(
    () =>
      (commerce.data ?? [])
        .filter((row) => numberFrom(row, ['revenue']) != null)
        .map((row) => ({
          category: textFrom(row, ['category']),
          revenue: numberFrom(row, ['revenue']) ?? 0,
        })),
    [commerce.data]
  );

  const cleanedVisualization = cleanedRecordVisualizationRows(cleanedRecords.data);
  const visualizationDatasets: VisualizationDatasetInput[] = [
    {
      id: 'commerce-performance',
      label: 'Commerce performance',
      source: 'workspace.dataone_gold.commerce_performance',
      rows: dataRows(commerce.data).map((row) => ({
        category: textFrom(row, ['category']),
        order_count: numberFrom(row, ['order_count']),
        revenue: numberFrom(row, ['revenue']),
        delivered_orders: numberFrom(row, ['delivered_orders']),
        revenue_per_order: numberFrom(row, ['revenue_per_order']),
        delivery_rate_pct: numberFrom(row, ['delivery_rate_pct']),
      })),
      loading: commerce.loading,
      error: commerce.error,
      warehouseStatus: commerce.warehouseStatus,
      defaultChartType: 'bar',
      defaultXKey: 'category',
      defaultYKey: 'revenue',
      defaultTitle: 'Revenue by category',
      normalize: {
        labels: {
          order_count: 'Order count',
          revenue: 'Revenue (USD)',
          delivered_orders: 'Delivered orders',
          revenue_per_order: 'Revenue per order (USD)',
          delivery_rate_pct: 'Delivery rate (%)',
        },
      },
    },
    {
      id: 'column-quality',
      label: 'Column quality',
      source: 'workspace.dataone_gold.quality_by_column',
      rows: dataRows(quality.data).map((row) => ({
        column_name: textFrom(row, ['column_name']),
        source_type: textFrom(row, ['source_type']),
        health_status: textFrom(row, ['health_status']),
        cell_count: numberFrom(row, ['cell_count']),
        missing_count: numberFrom(row, ['missing_count']),
        issue_count: numberFrom(row, ['issue_count']),
        transformed_count: numberFrom(row, ['transformed_count']),
        quality_score: numberFrom(row, ['quality_score']),
        completeness_pct: numberFrom(row, ['completeness_pct']),
      })),
      loading: quality.loading,
      error: quality.error,
      warehouseStatus: quality.warehouseStatus,
      defaultChartType: 'horizontal-bar',
      defaultXKey: 'column_name',
      defaultYKey: 'quality_score',
      defaultTitle: 'Quality score by source column',
      normalize: {
        labels: {
          column_name: 'Source column',
          source_type: 'Source data type',
          health_status: 'Health status',
          cell_count: 'Evaluated cells',
          missing_count: 'Missing cells',
          issue_count: 'Issue cells',
          transformed_count: 'Transformed cells',
          quality_score: 'Quality score (%)',
          completeness_pct: 'Completeness (%)',
        },
      },
    },
    {
      id: 'issue-distribution',
      label: 'Quality issue distribution',
      source: 'workspace.dataone_gold.quality_issue_distribution',
      rows: dataRows(issues.data).map((row) => ({
        issue_label: textFrom(row, ['issue_label']),
        quality_issue: textFrom(row, ['quality_issue']),
        issue_count: numberFrom(row, ['issue_count']),
        share_pct: numberFrom(row, ['share_pct']),
      })),
      loading: issues.loading,
      error: issues.error,
      warehouseStatus: issues.warehouseStatus,
      defaultChartType: 'horizontal-bar',
      defaultXKey: 'issue_label',
      defaultYKey: 'issue_count',
      defaultTitle: 'Detected issues by quality rule',
      normalize: {
        labels: {
          issue_label: 'Issue',
          quality_issue: 'Rule code',
          issue_count: 'Issue cells',
          share_pct: 'Share of issues (%)',
        },
      },
    },
    {
      id: 'transformation-summary',
      label: 'Transformation summary',
      source: 'workspace.dataone_gold.transformation_summary',
      rows: dataRows(transformations.data).map((row) => ({
        transformation: textFrom(row, ['transformation']),
        action_status: textFrom(row, ['action_status']),
        evaluated_cells: numberFrom(row, ['evaluated_cells']),
        changed_cells: numberFrom(row, ['changed_cells']),
        change_rate_pct: numberFrom(row, ['change_rate_pct']),
      })),
      loading: transformations.loading,
      error: transformations.error,
      warehouseStatus: transformations.warehouseStatus,
      defaultChartType: 'horizontal-bar',
      defaultXKey: 'transformation',
      defaultYKey: 'changed_cells',
      defaultTitle: 'Cells changed by transformation',
      normalize: {
        labels: {
          transformation: 'Transformation',
          action_status: 'Action status',
          evaluated_cells: 'Evaluated cells',
          changed_cells: 'Changed cells',
          change_rate_pct: 'Change rate (%)',
        },
      },
    },
    {
      id: 'schema-mapping',
      label: 'Schema mapping',
      source: 'workspace.dataone_gold.schema_mapping',
      rows: dataRows(mappings.data).map((row) => ({
        source_column: textFrom(row, ['source_column']),
        target_column: textFrom(row, ['target_column']),
        source_type: textFrom(row, ['source_type']),
        target_type: textFrom(row, ['target_type']),
        review_status: textFrom(row, ['review_status']),
        ordinal: numberFrom(row, ['ordinal']),
        confidence_pct: numberFrom(row, ['confidence_pct']),
        profiled_at: textFrom(row, ['profiled_at'], ''),
      })),
      loading: mappings.loading,
      error: mappings.error,
      warehouseStatus: mappings.warehouseStatus,
      defaultChartType: 'horizontal-bar',
      defaultXKey: 'source_column',
      defaultYKey: 'confidence_pct',
      defaultTitle: 'Mapping confidence by source column',
      normalize: {
        labels: {
          source_column: 'Source column',
          target_column: 'Target column',
          source_type: 'Source data type',
          target_type: 'Target data type',
          review_status: 'Review status',
          ordinal: 'Column position',
          confidence_pct: 'Mapping confidence (%)',
          profiled_at: 'Profiled at',
        },
        kinds: { profiled_at: 'time' },
      },
    },
    {
      id: 'cleaned-records',
      label: 'Cleaned record fields',
      source: 'workspace.dataone_gold.cleaned_records.cleaned_record_json',
      rows: cleanedVisualization.rows,
      loading: cleanedRecords.loading,
      error: cleanedRecords.error,
      warehouseStatus: cleanedRecords.warehouseStatus,
      defaultChartType: 'bar',
      defaultXKey: 'category',
      defaultYKey: 'unit_price',
      defaultTitle: 'Cleaned record field comparison',
      normalize: {
        exclude: [
          'dataone_parse_status',
          'dataone_record_id',
          'dataone_issue_count',
          'dataone_transformed_count',
          'dataone_record_status',
          'dataone_cleaned_at',
          'dataone_quarantined',
        ],
      },
      warning:
        cleanedVisualization.invalidRecordCount > 0
          ? `${cleanedVisualization.invalidRecordCount} cleaned record payloads could not be decoded. Their metadata remains available, but source fields are omitted.`
          : undefined,
    },
    {
      id: 'recent-runs',
      label: 'Recent DataOne runs',
      source: 'workspace.dataone_ops.project_runs + workspace.dataone_gold summaries',
      rows: dataRows(recentRuns.data).map((row) => ({
        run_id: textFrom(row, ['run_id']),
        project_name: textFrom(row, ['project_name']),
        source_mode: textFrom(row, ['source_mode']),
        source_format: textFrom(row, ['source_format']),
        run_status: textFrom(row, ['run_status']),
        row_count: numberFrom(row, ['row_count']),
        column_count: numberFrom(row, ['column_count']),
        quality_score: numberFrom(row, ['quality_score']),
        mapping_confidence_pct: numberFrom(row, ['mapping_confidence_pct']),
        quarantined_rows: numberFrom(row, ['quarantined_rows']),
        started_at: textFrom(row, ['started_at'], ''),
        updated_at: textFrom(row, ['updated_at'], ''),
      })),
      loading: recentRuns.loading,
      error: recentRuns.error,
      warehouseStatus: recentRuns.warehouseStatus,
      defaultChartType: 'line',
      defaultXKey: 'updated_at',
      defaultYKey: 'quality_score',
      defaultTitle: 'Quality score over recent runs',
      normalize: {
        labels: {
          run_id: 'Run ID',
          project_name: 'Project',
          source_mode: 'Source mode',
          source_format: 'Source format',
          run_status: 'Run status',
          row_count: 'Rows',
          column_count: 'Columns',
          quality_score: 'Quality score (%)',
          mapping_confidence_pct: 'Mapping confidence (%)',
          quarantined_rows: 'Quarantined rows',
          started_at: 'Started at',
          updated_at: 'Updated at',
        },
        kinds: { started_at: 'time', updated_at: 'time' },
      },
    },
  ];

  return (
    <div className="dataone-results" data-active-view={activeView}>
      <DataSection
        id="overview"
        number="01"
        icon={<Activity />}
        title="The run is complete — start with the outcome"
        description="A manager-ready summary of volume, trust, and delivery status for this exact run."
      >
        <QueryBoundary query={kpis} subject="run overview">
          <div className="dataone-dashboard-grid">
            <Card className="dataone-panel dataone-overview-card">
              <CardHeader>
                <CardTitle>Schema Mapping Confidence</CardTitle>
                <CardDescription>Generated from the latest schema profile</CardDescription>
              </CardHeader>
              <CardContent className="dataone-ring-card-content">
                <MetricRing value={mappingConfidence} label="mapping confidence" />
                <div className="dataone-overview-stat-list">
                  <div>
                    <span className="is-success" />
                    <strong>{formatInteger(autoMappedCount)}</strong>
                    <small>Auto-mapped fields</small>
                  </div>
                  <div>
                    <span />
                    <strong>{formatInteger(reviewRequiredCount)}</strong>
                    <small>Needs review</small>
                  </div>
                  <div>
                    <span />
                    <strong>{formatInteger(numberFrom(newest, ['mapped_columns']))}</strong>
                    <small>Total mapped fields</small>
                  </div>
                  <Button type="button" variant="ghost" onClick={() => onNavigate('mapper')}>
                    View Schema Mapper <ArrowRight aria-hidden="true" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="dataone-panel dataone-overview-card">
              <CardHeader>
                <CardTitle>Pipeline Insights</CardTitle>
                <CardDescription>
                  {isDemo
                    ? config.sourceLive
                      ? 'Run-scoped evidence from the live local MySQL read'
                      : 'Run-scoped evidence from local fixtures'
                    : 'Run-scoped evidence from governed tables'}
                </CardDescription>
              </CardHeader>
              <CardContent className="dataone-insight-list">
                <div>
                  <strong>{formatInteger(numberFrom(newest, ['transformed_cells']))}</strong>
                  <span>Cells transformed by {isDemo ? 'the demo simulator' : 'Lakeflow'}</span>
                </div>
                <div>
                  <strong>{formatInteger(reviewRequiredCount)}</strong>
                  <span>Schema fields pending human review</span>
                </div>
                <div className={quarantinedRows ? 'has-warning' : undefined}>
                  <strong>{formatInteger(quarantinedRows)}</strong>
                  <span>Records quarantined for quality issues</span>
                </div>
                <Button type="button" variant="ghost" onClick={() => onNavigate('audit')}>
                  View Audit Trail <ArrowRight aria-hidden="true" />
                </Button>
              </CardContent>
            </Card>

            <Card className="dataone-panel dataone-overview-card">
              <CardHeader>
                <CardTitle>Data Quality Health</CardTitle>
                <CardDescription>Validity and completeness across this run</CardDescription>
              </CardHeader>
              <CardContent className="dataone-ring-card-content">
                <MetricRing value={qualityScore} label="overall score" />
                <div className="dataone-overview-stat-list">
                  <div>
                    <span className="is-success" />
                    <strong>{formatInteger(healthyColumnCount)}</strong>
                    <small>Healthy columns</small>
                  </div>
                  <div>
                    <span className="is-warning" />
                    <strong>{formatPercent(averageCompleteness)}</strong>
                    <small>Average completeness</small>
                  </div>
                  <div>
                    <span />
                    <strong>{formatInteger(numberFrom(newest, ['issue_cells']))}</strong>
                    <small>Issue cells detected</small>
                  </div>
                  <Button type="button" variant="ghost" onClick={() => onNavigate('quality')}>
                    View Data Quality <ArrowRight aria-hidden="true" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="dataone-panel dataone-overview-card">
              <CardHeader>
                <CardTitle>Autopilot Governance</CardTitle>
                <CardDescription>Current execution and control state</CardDescription>
              </CardHeader>
              <CardContent className="dataone-governance-list">
                <div>
                  <CheckCircle2 aria-hidden="true" />
                  <span>
                    <strong>{isDemo ? 'Simulated pipeline completed' : 'Pipeline completed'}</strong>
                    <small>{freshness}</small>
                  </span>
                </div>
                <div>
                  <CheckCircle2 aria-hidden="true" />
                  <span>
                    <strong>
                      {formatInteger(cleanedRows)}{' '}
                      {isDemo
                        ? config.sourceLive
                          ? 'source records prepared'
                          : 'demo records prepared'
                        : 'governed records published'}
                    </strong>
                    <small>{isDemo ? 'Local preview of workspace.dataone_gold' : 'workspace.dataone_gold'}</small>
                  </span>
                </div>
                <div className={reviewRequiredCount > 0 ? 'has-warning' : undefined}>
                  <CircleAlert aria-hidden="true" />
                  <span>
                    <strong>{formatInteger(reviewRequiredCount)} mapping decisions need review</strong>
                    <small>Human approval remains separate from processing</small>
                  </span>
                </div>
                <Button type="button" variant="ghost" onClick={() => onNavigate('governance')}>
                  View Governance <ArrowRight aria-hidden="true" />
                </Button>
              </CardContent>
            </Card>
          </div>
          <div className="dataone-overview-band">
            <div>
              <span>Project</span>
              <strong>{textFrom(newest, ['project_name'], config.projectName)}</strong>
            </div>
            <div>
              <span>Source mode</span>
              <strong>{textFrom(newest, ['source_mode'], config.sourceMode)}</strong>
            </div>
            <div>
              <span>Run status</span>
              <ToneBadge status={textFrom(newest, ['run_status'], 'SUCCESS')} />
            </div>
            <div>
              <span>Analytics identity</span>
              <strong>
                {isDemo
                  ? config.sourceLive
                    ? 'Live local MySQL · simulated processing'
                    : 'Local deterministic fixture'
                  : 'App service principal'}
              </strong>
            </div>
          </div>
        </QueryBoundary>
      </DataSection>

      <DataSection
        id="schema-intelligence"
        number="02"
        icon={<SearchCode />}
        title="Schema differences are explicit before publication"
        description="Source-to-target recommendations include name, type, confidence, and review status."
      >
        <QueryBoundary query={mappings} subject="schema mapping">
          <div className="dataone-mapper-toolbar">
            <div>
              <span>Pipeline Version</span>
              <strong>v1.0 · run {config.runId.slice(0, 8)}</strong>
            </div>
            <label className="dataone-suggestion-toggle">
              <input
                type="checkbox"
                checked={showAllSuggestions}
                onChange={(event) => setShowAllSuggestions(event.target.checked)}
              />
              <span /> Show all suggestions
            </label>
            <Button
              type="button"
              variant="secondary"
              disabled
              title="Publishing needs a persistent approval store and a separately authorized mutation."
            >
              Review & Publish Mapping
            </Button>
          </div>

          <div className="dataone-mapper-workbench">
            <aside className="dataone-schema-panel" aria-label="Source schema">
              <header>
                <Database aria-hidden="true" />
                <strong>Source Schema</strong>
                <small>{config.sourceLabel}</small>
              </header>
              <div className="dataone-schema-search">
                <Search aria-hidden="true" />
                <span>Search columns in source</span>
              </div>
              <div className="dataone-schema-tree">
                <strong>
                  <ChevronDown aria-hidden="true" /> source
                </strong>
                {visibleMappings.slice(0, 14).map((row) => (
                  <div key={`source-${textFrom(row, ['ordinal'])}`}>
                    <span />
                    <strong>{textFrom(row, ['source_column'])}</strong>
                    <small>{textFrom(row, ['source_type'])}</small>
                  </div>
                ))}
              </div>
            </aside>

            <section className="dataone-mapping-canvas" aria-label="Mapping canvas">
              <header>
                <strong>Mapping Canvas</strong>
                <Badge variant="outline">{formatInteger(visibleMappings.length)} fields</Badge>
              </header>
              <div>
                {visibleMappings.slice(0, 14).map((row) => (
                  <div className="dataone-canvas-row" key={`canvas-${textFrom(row, ['ordinal'])}`}>
                    <span className="dataone-canvas-field">
                      <strong>{textFrom(row, ['source_column'])}</strong>
                      <small>{textFrom(row, ['source_type'])}</small>
                    </span>
                    <span className="dataone-canvas-line" aria-hidden="true" />
                    <Badge variant="outline">{formatPercent(numberFrom(row, ['confidence_pct']))}</Badge>
                    <span className="dataone-canvas-line" aria-hidden="true" />
                    <span className="dataone-canvas-field">
                      <strong>{textFrom(row, ['target_column'])}</strong>
                      <small>{textFrom(row, ['target_type'])}</small>
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <aside className="dataone-schema-panel" aria-label="Target schema">
              <header>
                <TableProperties aria-hidden="true" />
                <strong>Target Schema</strong>
                <small>{config.outputTable}</small>
              </header>
              <div className="dataone-schema-search">
                <Search aria-hidden="true" />
                <span>Search columns in target</span>
              </div>
              <div className="dataone-schema-tree">
                <strong>
                  <ChevronDown aria-hidden="true" /> gold
                </strong>
                {visibleMappings.slice(0, 14).map((row) => (
                  <div key={`target-${textFrom(row, ['ordinal'])}`}>
                    <span className={textFrom(row, ['review_status']) === 'AUTO_MAPPED' ? 'is-checked' : undefined} />
                    <strong>{textFrom(row, ['target_column'])}</strong>
                    <small>{textFrom(row, ['target_type'])}</small>
                  </div>
                ))}
              </div>
            </aside>
          </div>

          <section className="dataone-mapper-preview">
            <header>
              <strong>Data Preview</strong>
              <span>Transformation Logic</span>
              <span>Version History</span>
              <Badge variant="outline">Read-only review</Badge>
            </header>
            <div>
              <QueryBoundary query={cleanedRecords} subject="cleaned record preview">
                <DataTableShell label="Mapped record preview">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Record</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Issues</TableHead>
                        <TableHead>Changed fields</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(cleanedRecords.data ?? []).slice(0, 5).map((row) => (
                        <TableRow key={`mapper-preview-${textFrom(row, ['record_id'])}`}>
                          <TableCell className="dataone-json-cell">
                            <code>{textFrom(row, ['cleaned_record_json'])}</code>
                          </TableCell>
                          <TableCell>
                            <ToneBadge status={textFrom(row, ['record_status'])} />
                          </TableCell>
                          <TableCell>{formatInteger(numberFrom(row, ['issue_count']))}</TableCell>
                          <TableCell>{formatInteger(numberFrom(row, ['transformed_count']))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </DataTableShell>
              </QueryBoundary>
              <div className="dataone-generated-sql">
                <header>
                  <strong>Generated SQL (review preview)</strong>
                  <Badge variant="outline">Not executed</Badge>
                </header>
                <pre>
                  <code>{generatedMappingSql}</code>
                </pre>
              </div>
            </div>
          </section>

          <Alert className="dataone-mapper-boundary">
            <ShieldCheck aria-hidden="true" />
            <AlertTitle>
              {isDemo ? 'Demo review only; nothing is published' : 'Review is live; publish is intentionally gated'}
            </AlertTitle>
            <AlertDescription>
              {isDemo
                ? 'Mapping suggestions are deterministic sample output. The demo never writes an approval, mapping contract, or Unity Catalog object.'
                : 'Mapping suggestions come from the completed Databricks run. Persisting an approval requires a bound Lakebase or Unity Catalog decision store and an explicitly authorized backend mutation; this build does not claim that session-only UI state is a published contract.'}
            </AlertDescription>
          </Alert>
        </QueryBoundary>
      </DataSection>

      <DataSection
        id="quality-cleaning"
        number="03"
        icon={<WandSparkles />}
        title="Quality issues are measured, cleaned, or quarantined"
        description="Every score is tied to evaluated cells; transformations remain visible for human review."
      >
        <div className="dataone-two-column">
          <QueryCard
            query={quality}
            subject="column quality"
            title="Quality score by column"
            source="quality_by_column"
            freshness={freshness}
            isDemo={isDemo}
          >
            {qualityChart.length > 0 && (
              <BarChart
                data={qualityChart}
                xKey="column"
                yKey="quality_score"
                orientation="horizontal"
                colorPalette="sequential"
                height={360}
                ariaLabel="Quality score by source column"
              />
            )}
          </QueryCard>
          <QueryCard
            query={transformations}
            subject="transformation summary"
            title="Cleaning actions"
            source="transformation_summary"
            freshness={freshness}
            isDemo={isDemo}
          >
            <div className="dataone-action-list">
              {(transformations.data ?? []).slice(0, 8).map((row) => (
                <div key={`${textFrom(row, ['transformation'])}-${textFrom(row, ['action_status'])}`}>
                  <span className="dataone-action-icon">
                    <WandSparkles aria-hidden="true" />
                  </span>
                  <div>
                    <strong>{textFrom(row, ['transformation'])}</strong>
                    <small>
                      {formatInteger(numberFrom(row, ['changed_cells']))} changed of{' '}
                      {formatInteger(numberFrom(row, ['evaluated_cells']))} evaluated
                    </small>
                  </div>
                  <ToneBadge status={textFrom(row, ['action_status'])} />
                </div>
              ))}
            </div>
          </QueryCard>
        </div>
        <QueryBoundary query={cleanedRecords} subject="cleaned record preview">
          <DataTableShell label="Cleaned and quarantined record preview">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Record</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Issues</TableHead>
                  <TableHead>Transformations</TableHead>
                  <TableHead>Cleaned at</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(cleanedRecords.data ?? []).slice(0, 8).map((row) => (
                  <TableRow key={textFrom(row, ['record_id'])}>
                    <TableCell className="dataone-json-cell">
                      <code>{textFrom(row, ['cleaned_record_json'])}</code>
                    </TableCell>
                    <TableCell>
                      <ToneBadge status={textFrom(row, ['record_status'])} />
                    </TableCell>
                    <TableCell>{formatInteger(numberFrom(row, ['issue_count']))}</TableCell>
                    <TableCell>{formatInteger(numberFrom(row, ['transformed_count']))}</TableCell>
                    <TableCell>{formatTimestamp(valueFrom(row, ['cleaned_at']))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTableShell>
        </QueryBoundary>
      </DataSection>

      <DataSection
        id="topology-impact"
        number="04"
        icon={<Network />}
        title="The complete data path and its impact are traceable"
        description={
          isDemo
            ? 'Topology mirrors the intended production resource sequence, but every operation on this page is simulated locally.'
            : 'Topology is read from the run inventory, with each operation tied to its Databricks component and governance state.'
        }
      >
        <QueryBoundary query={topology} subject="topology inventory">
          <div className="dataone-topology">
            {(topology.data ?? []).map((row) => (
              <div
                className="dataone-topology-edge"
                key={`${textFrom(row, ['edge_order'])}-${textFrom(row, ['source_node'])}-${textFrom(row, ['target_node'])}`}
              >
                <div className="dataone-node">
                  <Database aria-hidden="true" />
                  <span>{textFrom(row, ['source_node'])}</span>
                </div>
                <div className="dataone-edge-label">
                  <small>{textFrom(row, ['databricks_component'])}</small>
                  <strong>{textFrom(row, ['operation'])}</strong>
                  <ArrowRight aria-hidden="true" />
                </div>
                <div className="dataone-node">
                  <Layers3 aria-hidden="true" />
                  <span>{textFrom(row, ['target_node'])}</span>
                </div>
                <ToneBadge status={textFrom(row, ['governance_state'])} />
              </div>
            ))}
          </div>
        </QueryBoundary>
        <div className="dataone-impact-grid">
          <MiniMetric
            label="Cells with issues"
            value={formatInteger(numberFrom(newest, ['issue_cells']))}
            icon={<CircleAlert />}
          />
          <MiniMetric
            label="Cells transformed"
            value={formatInteger(numberFrom(newest, ['transformed_cells']))}
            icon={<WandSparkles />}
          />
          <MiniMetric label="Rows quarantined" value={formatInteger(quarantinedRows)} icon={<ShieldCheck />} />
          <MiniMetric label="Target layer" value="Gold" icon={<Layers3 />} />
        </div>
      </DataSection>

      <DataSection
        id="visualizations"
        number="05"
        icon={<BarChart3 />}
        title="Exceptions and business outcomes are visible together"
        description={
          isDemo
            ? 'Build named charts from deterministic sample results by choosing the dataset, graph type, X column, and numeric Y column.'
            : 'Build named charts from run-scoped SQL results by choosing the dataset, graph type, X column, and numeric Y column.'
        }
      >
        <VisualizationBuilder
          key={config.runId}
          datasets={visualizationDatasets}
          freshness={freshness}
          isDemo={isDemo}
        />
        <div className="dataone-two-column">
          <QueryCard
            query={issues}
            subject="issue distribution"
            title="Detected issues by rule"
            source="quality_issue_distribution"
            freshness={freshness}
            isDemo={isDemo}
          >
            {issueChart.length > 0 && (
              <BarChart
                data={issueChart}
                xKey="issue"
                yKey="issue_count"
                orientation="horizontal"
                colorPalette="categorical"
                height={360}
                ariaLabel="Detected data quality issues by rule"
              />
            )}
          </QueryCard>
          <QueryCard
            query={commerce}
            subject="commerce performance"
            title="Revenue by category"
            source="commerce_performance"
            freshness={freshness}
            isDemo={isDemo}
          >
            {commerceChart.length > 0 && (
              <BarChart
                data={commerceChart}
                xKey="category"
                yKey="revenue"
                colorPalette="categorical"
                height={360}
                ariaLabel="Revenue by category from cleaned records"
              />
            )}
          </QueryCard>
        </div>
      </DataSection>

      <DataSection
        id="prediction-risk"
        number="06"
        icon={<TrendingUp />}
        title="Current-run signals indicate transparent operational risk"
        description="A deterministic scenario combines quality gaps, quarantine exposure, and mapping review exposure."
      >
        <QueryBoundary query={kpis} subject="risk forecast inputs">
          <QueryBoundary query={mappings} subject="mapping risk inputs">
            {riskScore == null ? (
              <Empty className="dataone-empty">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <TrendingUp aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>Not enough inputs for the risk scenario</EmptyTitle>
                  <EmptyDescription>
                    Quality score, row counts, quarantine counts, and schema mappings are required before the heuristic
                    can be calculated.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <>
                <div className="dataone-risk-grid">
                  <Card className="dataone-panel dataone-risk-input-card">
                    <CardHeader>
                      <CardDescription>Actual inputs · current run</CardDescription>
                      <CardTitle>Observed processing signals</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div>
                        <span>Quality gap</span>
                        <strong>{formatPercent(qualityGap)}</strong>
                      </div>
                      <div>
                        <span>Quarantine exposure</span>
                        <strong>{formatPercent(quarantineRate)}</strong>
                      </div>
                      <div>
                        <span>Mapping review exposure</span>
                        <strong>{formatPercent(mappingReviewRate)}</strong>
                      </div>
                      <small>Source: quality_summary + schema_mapping · Freshness: {freshness}</small>
                    </CardContent>
                  </Card>

                  <Card className="dataone-panel dataone-risk-forecast-card">
                    <CardHeader>
                      <Badge variant="outline" className="dataone-demo-badge">
                        Heuristic demo forecast — not a trained ML model
                      </Badge>
                      <CardTitle>{riskLevel.toLowerCase()} operational attention risk</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="dataone-forecast-value">
                        <span className="dataone-forecast-mark" aria-hidden="true" />
                        <strong>{riskScore}</strong>
                        <small>/ 100 risk index</small>
                      </div>
                      <ToneBadge status={riskLevel} />
                      <p>
                        Higher means more manual attention is indicated. This is an explainable rule, not a probability
                        or learned prediction.
                      </p>
                      <small>
                        Formula: 50% quality gap + 30% quarantine exposure + 20% mapping review exposure · {freshness}
                      </small>
                    </CardContent>
                  </Card>
                </div>

                <Card className="dataone-panel dataone-risk-factors">
                  <CardHeader>
                    <CardTitle>Risk factor contribution</CardTitle>
                    <CardDescription>
                      Current run · deterministic weights · source analytics shown above
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {[
                      { label: 'Quality gap', value: qualityGap ?? 0, weight: '50%' },
                      { label: 'Quarantine exposure', value: quarantineRate ?? 0, weight: '30%' },
                      { label: 'Mapping review exposure', value: mappingReviewRate ?? 0, weight: '20%' },
                    ].map((factor) => (
                      <div key={factor.label}>
                        <span>
                          <strong>{factor.label}</strong>
                          <small>
                            {factor.weight} weight · {formatPercent(factor.value)}
                          </small>
                        </span>
                        <Progress
                          value={Math.min(100, factor.value)}
                          aria-label={`${factor.label}: ${factor.value}%`}
                        />
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {config.sourceMode === 'demo_database' && (
                  <Alert className="dataone-demo-export-note">
                    <Database aria-hidden="true" />
                    <AlertTitle>
                      {config.targetLive ? 'Transformed data stored in PostgreSQL' : 'Controlled export boundary'}
                    </AlertTitle>
                    <AlertDescription>
                      {config.targetLive
                        ? `${config.targetLabel} contains ${formatInteger(config.targetRowCount ?? 0)} verified rows across ${formatInteger(config.targetColumns.length)} transformed columns.`
                        : `${config.targetLabel} is an external PostgreSQL alias. It is represented as a post-governance export step, not as a native Spark Declarative Pipeline sink.`}
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </QueryBoundary>
        </QueryBoundary>
      </DataSection>

      <DataSection
        id="semantics"
        number="07"
        icon={<Scale />}
        title="Metrics stay consistent from dashboard to AskData"
        description="Definitions make the denominator, source, and interpretation explicit."
      >
        <div className="dataone-metric-definition-grid">
          <MetricDefinition
            name="Data Quality Index"
            value={formatPercent(qualityScore)}
            definition="Valid cells divided by all evaluated cells for this run. Higher is better."
            source="quality_summary"
          />
          <MetricDefinition
            name="Mapping Confidence"
            value={formatPercent(mappingConfidence)}
            definition="Average confidence of source-to-target column recommendations."
            source="schema_mapping"
          />
          <MetricDefinition
            name="Quarantine Rate"
            value={rowCount && quarantinedRows != null ? formatPercent((quarantinedRows / rowCount) * 100) : '—'}
            definition="Rows held from trusted output because at least one issue requires review."
            source="clean_cells"
          />
        </div>
        <QueryBoundary query={inventory} subject="database inventory">
          <DataTableShell label="Unity Catalog inventory">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Schema</TableHead>
                  <TableHead>Layer</TableHead>
                  <TableHead>Tables</TableHead>
                  <TableHead>Materialized views</TableHead>
                  <TableHead>Columns</TableHead>
                  <TableHead>Assets</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(inventory.data ?? []).map((row) => (
                  <TableRow key={`${textFrom(row, ['schema_name'])}-${textFrom(row, ['data_layer'])}`}>
                    <TableCell>
                      <strong>{textFrom(row, ['schema_name'])}</strong>
                    </TableCell>
                    <TableCell>{textFrom(row, ['data_layer'])}</TableCell>
                    <TableCell>{formatInteger(numberFrom(row, ['table_count']))}</TableCell>
                    <TableCell>{formatInteger(numberFrom(row, ['materialized_view_count']))}</TableCell>
                    <TableCell>{formatInteger(numberFrom(row, ['column_count']))}</TableCell>
                    <TableCell>{textFrom(row, ['assets'])}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTableShell>
        </QueryBoundary>
      </DataSection>

      <DataSection
        id="askdata"
        number="08"
        icon={<Bot />}
        title="AskData answers with inspectable SQL"
        description={
          isDemo
            ? 'Try deterministic natural-language examples and inspect the SQL that a production Genie agent would generate.'
            : 'Ask questions across governed DataOne quality, mapping, transformation, and run data using the dedicated Genie agent.'
        }
      >
        <AskDataExperience
          identity={identity}
          isDemo={isDemo}
          demoSummary={{
            projectName: config.projectName,
            runId: config.runId,
            rowCount,
            cleanedRows,
            qualityScore,
            mappingConfidence,
            quarantinedRows,
            transformedCells: numberFrom(newest, ['transformed_cells']),
            qualityRows,
            transformations: transformations.data ?? [],
            mappings: mappedRows,
            commerce: commerce.data ?? [],
            issues: issues.data ?? [],
            sourceMode: config.sourceMode,
            sourceLabel: config.sourceLabel,
            targetLabel: config.targetLabel,
            freshness,
            riskScore,
            riskLevel,
          }}
        />
      </DataSection>

      <DataSection
        id="governance-audit"
        number="09"
        icon={<ShieldCheck />}
        title="Every processing run appears in the governed audit trail"
        description={
          isDemo
            ? 'Recent activity is synthetic and remains in local demo memory only.'
            : 'Recent activity and review states are sourced from DataOne operations tables; job execution remains attributed to the app service principal.'
        }
      >
        <div className="dataone-governance-banner">
          <div>
            <ShieldCheck aria-hidden="true" />
            <span>
              <strong>Human-in-the-loop checkpoint</strong>
              Schema recommendations identify records that require human approval before a separate publish action.
            </span>
          </div>
          <Badge variant="outline">{isDemo ? 'Simulated governance state' : 'Governed by Unity Catalog'}</Badge>
        </div>
        <QueryBoundary query={recentRuns} subject="recent activity">
          <DataTableShell label="Recent DataOne activity">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project / run</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Rows</TableHead>
                  <TableHead>Quality</TableHead>
                  <TableHead>Mapping</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(recentRuns.data ?? []).slice(0, 12).map((row) => (
                  <TableRow key={textFrom(row, ['run_id'])}>
                    <TableCell>
                      <strong>{textFrom(row, ['project_name'])}</strong>
                      <span className="dataone-cell-meta">{textFrom(row, ['run_id'])}</span>
                    </TableCell>
                    <TableCell>
                      {textFrom(row, ['source_mode'])}
                      <span className="dataone-cell-meta">{textFrom(row, ['source_format'])}</span>
                    </TableCell>
                    <TableCell>{formatInteger(numberFrom(row, ['row_count']))}</TableCell>
                    <TableCell>{formatPercent(numberFrom(row, ['quality_score']))}</TableCell>
                    <TableCell>{formatPercent(numberFrom(row, ['mapping_confidence_pct']))}</TableCell>
                    <TableCell>
                      <ToneBadge status={textFrom(row, ['run_status'])} />
                    </TableCell>
                    <TableCell>{formatTimestamp(valueFrom(row, ['updated_at']))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTableShell>
        </QueryBoundary>
        <div className="dataone-execution-ledger">
          <ExecutionIdentity
            title={
              isDemo
                ? config.sourceMode === 'demo_database'
                  ? 'Database source alias'
                  : 'Sample file load'
                : 'File upload and governed landing'
            }
            identity={isDemo ? 'Local demo process' : 'DataOne app service principal'}
            component={
              isDemo
                ? config.sourceMode === 'demo_database'
                  ? 'Simulated MySQL source'
                  : `In-memory ${config.sourceFormat.toUpperCase()} fixture`
                : 'Unity Catalog Volume'
            }
          />
          <ExecutionIdentity
            title="Profiling, quality, and cleaning"
            identity={isDemo ? 'Local demo process' : 'DataOne app service principal'}
            component={isDemo ? 'Deterministic simulator' : 'Lakeflow Jobs & Pipelines'}
          />
          <ExecutionIdentity
            title="Manager analytics queries"
            identity={isDemo ? 'Local demo process' : 'DataOne app service principal'}
            component={isDemo ? 'Fixture query API' : 'Databricks SQL Warehouse'}
          />
          {isDemo && config.sourceMode === 'demo_database' && (
            <ExecutionIdentity
              title="Target delivery"
              identity="Local demo process"
              component={
                config.targetLive ? 'Verified local PostgreSQL publication' : 'Controlled PostgreSQL export simulation'
              }
            />
          )}
          <ExecutionIdentity
            title="AskData conversation"
            identity={isDemo ? 'Local demo process' : 'DataOne app service principal'}
            component={isDemo ? 'Simulated NL2SQL' : 'AI/BI Genie · dedicated DataOne space'}
          />
        </div>
      </DataSection>
    </div>
  );
}

function createDemoAnswer(question: string, summary: DemoAskDataSummary): Omit<DemoAnswer, 'id' | 'question'> {
  const normalized = question.toLowerCase();

  if (isDatasetRowCountQuestion(question)) {
    return {
      answer:
        summary.rowCount == null
          ? 'The current run does not have a dataset row count yet.'
          : `The current dataset contains ${formatInteger(summary.rowCount)} total rows.`,
      sql: `SELECT project_name, run_id, source_identifier, row_count, updated_at
FROM workspace.dataone_gold.quality_summary
WHERE run_id = :run_id
ORDER BY updated_at DESC
LIMIT 1;`,
    };
  }

  if (
    !normalized.includes('mapping') &&
    (normalized.includes('source') ||
      normalized.includes('target') ||
      normalized.includes('postgres') ||
      normalized.includes('pipeline sink'))
  ) {
    const databaseFlow = summary.sourceMode === 'demo_database';
    return {
      answer: databaseFlow
        ? `The simulated source is ${summary.sourceLabel}. ${summary.targetLabel} is represented as a separately controlled PostgreSQL export after governed processing; it is not a native Spark Declarative Pipeline sink.`
        : `The source is ${summary.sourceLabel}, and the governed processing target is ${summary.targetLabel}.`,
      sql: `SELECT source_mode, source_identifier\nFROM workspace.dataone_ops.project_runs\nWHERE run_id = :run_id;\n-- External export targets belong to controlled job configuration, not a native pipeline sink.`,
    };
  }

  if (normalized.includes('forecast') || normalized.includes('prediction') || normalized.includes('risk factor')) {
    const factorValues = [
      {
        label: 'quality gap',
        value: summary.qualityScore == null ? null : Math.max(0, 100 - summary.qualityScore),
      },
      {
        label: 'quarantine exposure',
        value:
          summary.rowCount != null && summary.rowCount > 0 && summary.quarantinedRows != null
            ? (summary.quarantinedRows / summary.rowCount) * 100
            : null,
      },
      {
        label: 'mapping review exposure',
        value:
          summary.mappings.length > 0
            ? (summary.mappings.filter((row) => textFrom(row, ['review_status']) === 'REVIEW_REQUIRED').length /
                summary.mappings.length) *
              100
            : null,
      },
    ]
      .filter((factor): factor is { label: string; value: number } => factor.value != null)
      .sort((left, right) => right.value - left.value);
    return {
      answer:
        summary.riskScore == null
          ? 'The analytics inputs are incomplete, so the demo cannot calculate a risk scenario yet.'
          : `The heuristic demo forecast is ${summary.riskScore}/100 (${summary.riskLevel}). ${factorValues[0] ? `The largest observed factor is ${factorValues[0].label} at ${formatPercent(factorValues[0].value)}.` : ''} This is a deterministic rule, not a trained ML model or probability.`,
      sql: `WITH quality AS (\n  SELECT quality_score, row_count, quarantined_rows\n  FROM workspace.dataone_gold.quality_summary\n  WHERE run_id = :run_id\n), mapping AS (\n  SELECT COUNT_IF(review_status = 'REVIEW_REQUIRED') / COUNT(*) * 100 AS review_exposure_pct\n  FROM workspace.dataone_gold.schema_mapping\n  WHERE run_id = :run_id\n)\nSELECT * FROM quality CROSS JOIN mapping;\n-- UI heuristic (not SQL-executed): 50% quality gap + 30% quarantine exposure + 20% mapping review exposure`,
    };
  }

  if (normalized.includes('mapping') || normalized.includes('schema')) {
    const reviewRows = summary.mappings.filter((row) => textFrom(row, ['review_status']) === 'REVIEW_REQUIRED');
    const columns = reviewRows
      .slice(0, 4)
      .map((row) => `${textFrom(row, ['source_column'])} → ${textFrom(row, ['target_column'])}`)
      .join(', ');
    return {
      answer: `${formatInteger(reviewRows.length)} mappings need human review${columns ? `: ${columns}` : ''}. Average mapping confidence is ${formatPercent(summary.mappingConfidence)}.`,
      sql: `SELECT source_column, target_column, confidence_pct, review_status\nFROM workspace.dataone_gold.schema_mapping\nWHERE run_id = :run_id\n  AND review_status = 'REVIEW_REQUIRED'\nORDER BY confidence_pct ASC;`,
    };
  }

  if (normalized.includes('category') || normalized.includes('revenue') || normalized.includes('business impact')) {
    const ranked = summary.commerce
      .map((row) => ({ category: textFrom(row, ['category']), revenue: numberFrom(row, ['revenue']) }))
      .filter((row): row is { category: string; revenue: number } => row.revenue != null && row.category !== '—')
      .sort((left, right) => right.revenue - left.revenue);
    const leader = ranked[0];
    return {
      answer: leader
        ? `${leader.category} has the highest sample revenue at ${new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(leader.revenue)}. The result is derived from cleaned demo records for this run.`
        : 'The commerce result is not available yet. Open Data Visualization and retry when revenue data appears.',
      sql: `SELECT category, SUM(revenue) AS revenue\nFROM workspace.dataone_gold.commerce_performance\nWHERE run_id = :run_id\nGROUP BY category\nORDER BY revenue DESC;`,
    };
  }

  if (normalized.includes('issue') || normalized.includes('detected')) {
    const issueSummary = summary.issues
      .slice(0, 4)
      .map(
        (row) =>
          `${textFrom(row, ['issue_label', 'quality_issue'])} (${formatInteger(numberFrom(row, ['issue_count']))})`
      )
      .join(', ');
    return {
      answer: issueSummary
        ? `The sample detected ${issueSummary}. Open Data Quality for column-level denominators and transformations.`
        : 'No issue distribution is available yet for this demo run.',
      sql: `SELECT issue_label, issue_count\nFROM workspace.dataone_gold.quality_issue_distribution\nWHERE run_id = :run_id\nORDER BY issue_count DESC;`,
    };
  }

  if (normalized.includes('column') || normalized.includes('lowest')) {
    const weakestColumns = summary.qualityRows
      .map((row) => ({
        name: textFrom(row, ['column_name']),
        score: numberFrom(row, ['quality_score']),
      }))
      .filter((column): column is { name: string; score: number } => column.score != null && column.name !== '—')
      .sort((left, right) => left.score - right.score)
      .slice(0, 3);
    const columnSummary = weakestColumns.map((column) => `${column.name} (${formatPercent(column.score)})`).join(', ');
    return {
      answer: weakestColumns.length
        ? `The lowest-scoring sample columns are ${columnSummary}. Open Data Quality to compare every column.`
        : 'The sample quality rows are still loading. Open Data Quality and retry when the chart is visible.',
      sql: `SELECT column_name, quality_score\nFROM workspace.dataone_gold.quality_by_column\nWHERE run_id = :run_id\nORDER BY quality_score ASC\nLIMIT 3;`,
    };
  }

  if (normalized.includes('transform') || normalized.includes('cleaning plan')) {
    const actions = summary.transformations
      .slice(0, 4)
      .map((row) => {
        const transformation = textFrom(row, ['transformation']);
        const changed = formatInteger(numberFrom(row, ['changed_cells']));
        return `${transformation} (${changed} cells)`;
      })
      .filter((action) => !action.startsWith('—'));
    return {
      answer: actions.length
        ? `The simulated cleaning plan applied ${actions.join(', ')}.`
        : 'The sample transformation summary is still loading. Open Data Quality and retry when the actions appear.',
      sql: `SELECT transformation, changed_cells, action_status\nFROM workspace.dataone_gold.transformation_summary\nWHERE run_id = :run_id\nORDER BY changed_cells DESC;`,
    };
  }

  if (normalized.includes('quarantin') || normalized.includes('row')) {
    return {
      answer: `${formatInteger(summary.cleanedRows)} of ${formatInteger(summary.rowCount)} sample rows were processed into the cleaned-record result set; ${formatInteger(summary.quarantinedRows)} of those rows are flagged as quarantined. ${formatInteger(summary.transformedCells)} cells were transformed.`,
      sql: `SELECT row_count, cleaned_rows, quarantined_rows, transformed_cells\nFROM workspace.dataone_gold.quality_summary\nWHERE run_id = :run_id;`,
    };
  }

  return {
    answer: `${summary.projectName} run ${summary.runId.slice(0, 8)} contains ${formatInteger(summary.rowCount)} sample rows with a ${formatPercent(summary.qualityScore)} quality score and ${formatInteger(summary.quarantinedRows)} quarantined rows. Results are fresh as of ${summary.freshness}.`,
    sql: `SELECT project_name, row_count, quality_score, cleaned_rows, quarantined_rows\nFROM workspace.dataone_gold.quality_summary\nWHERE run_id = :run_id\nORDER BY updated_at DESC\nLIMIT 1;`,
  };
}

function AskDataExperience({
  identity,
  isDemo,
  demoSummary,
}: {
  identity: Identity | null;
  isDemo: boolean;
  demoSummary: DemoAskDataSummary;
}) {
  return isDemo ? (
    <DemoAskDataExperience identity={identity} summary={demoSummary} />
  ) : (
    <LiveAskDataExperience
      identity={identity}
      context={{
        projectName: demoSummary.projectName,
        runId: demoSummary.runId,
        sourceIdentifier: demoSummary.sourceLabel,
      }}
    />
  );
}

function DemoAskDataExperience({ identity, summary }: { identity: Identity | null; summary: DemoAskDataSummary }) {
  const [answers, setAnswers] = useState<DemoAnswer[]>([]);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    },
    []
  );

  const askQuestion = (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || pendingQuestion) return;
    setPendingQuestion(trimmed);

    // [DEMO-NL2SQL] This branch never calls Genie. It renders a deterministic,
    // clearly-labelled example using the demo analytics already loaded above.
    timerRef.current = window.setTimeout(() => {
      const generated = createDemoAnswer(trimmed, summary);
      setAnswers((current) => [
        ...current,
        {
          id: Date.now(),
          question: trimmed,
          ...generated,
        },
      ]);
      setPendingQuestion(null);
      timerRef.current = null;
    }, 500);
  };

  const resetDemo = () => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    setPendingQuestion(null);
    setAnswers([]);
  };

  return (
    <>
      <div className="dataone-genie-disclosure dataone-demo-disclosure">
        <div>
          <Badge variant="outline" className="dataone-demo-badge">
            <Bot aria-hidden="true" />
            Simulated NL2SQL · no Genie call
          </Badge>
          <strong>{identity?.email ?? identity?.user ?? 'Local demo viewer'}</strong>
        </div>
        <p>
          This deterministic preview demonstrates the production interaction. It does not contact a Genie Agent, execute
          SQL, or access Unity Catalog.
        </p>
      </div>

      <div className="dataone-genie-frame">
        <div className="dataone-genie-toolbar">
          <div>
            <strong>DataOne AskData · Demo</strong>
            <span>Run health · quality · mapping · business impact · prediction · source/target</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={resetDemo}
            disabled={!answers.length && !pendingQuestion}
          >
            <RefreshCw aria-hidden="true" />
            New conversation
          </Button>
        </div>

        <div className="dataone-genie-messages" aria-live="polite">
          {answers.length === 0 && !pendingQuestion && (
            <Empty className="dataone-empty dataone-genie-empty">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Bot aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>Try the simulated AskData experience</EmptyTitle>
                <EmptyDescription>
                  Each example returns a deterministic answer and inspectable SQL. Nothing is executed.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent className="dataone-genie-prompts">
                {DATAONE_QUESTION_GROUPS.map((group) => (
                  <div className="dataone-question-group" key={group.label}>
                    <strong>{group.label}</strong>
                    <div>
                      {group.questions.map((question) => (
                        <Button key={question} type="button" variant="outline" onClick={() => askQuestion(question)}>
                          {question}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </EmptyContent>
            </Empty>
          )}

          {answers.map((answer) => (
            <div className="dataone-demo-conversation" key={answer.id}>
              <div className="dataone-demo-user-message">
                <span>You</span>
                <p>{answer.question}</p>
              </div>
              <Card className="dataone-panel dataone-demo-answer">
                <CardHeader>
                  <div>
                    <Bot aria-hidden="true" />
                    <CardTitle>Simulated answer</CardTitle>
                  </div>
                  <Badge variant="outline" className="dataone-demo-badge">
                    Demo only
                  </Badge>
                </CardHeader>
                <CardContent>
                  <p>{answer.answer}</p>
                  <div className="dataone-demo-generated-sql">
                    <strong>
                      <Code2 aria-hidden="true" /> Generated SQL · not executed
                    </strong>
                    <pre>
                      <code>{answer.sql}</code>
                    </pre>
                  </div>
                  <p className="dataone-genie-answer-note">
                    <Code2 aria-hidden="true" />
                    Deterministic demo response — validate the generated SQL against your governed production data.
                  </p>
                </CardContent>
              </Card>
            </div>
          ))}

          {pendingQuestion && (
            <div className="dataone-demo-conversation">
              <div className="dataone-demo-user-message">
                <span>You</span>
                <p>{pendingQuestion}</p>
              </div>
              <div className="dataone-genie-stream-status" role="status">
                <span className="dataone-genie-pulse" aria-hidden="true" />
                <div>
                  <strong>Preparing deterministic demo answer</strong>
                  <small>No Genie or SQL API request is being made.</small>
                </div>
              </div>
            </div>
          )}
        </div>

        <GenieChatInput
          onSend={askQuestion}
          disabled={Boolean(pendingQuestion)}
          placeholder="Ask about the synthetic file or database demo…"
          className="dataone-genie-input"
        />
      </div>

      <Alert className="dataone-ai-note">
        <Code2 aria-hidden="true" />
        <AlertTitle>Demo boundary</AlertTitle>
        <AlertDescription>
          Production mode uses the AppKit Genie hook and the bound dedicated space. This demo mode uses local sample
          results so it can be explored without a workspace credential.
        </AlertDescription>
      </Alert>
    </>
  );
}

function LiveAskDataExperience({ identity, context }: { identity: Identity | null; context: AskDataRunContext }) {
  // [DBX-GENIE-UI] AppKit manages conversation state and streams natural-language
  // answers, generated SQL, and query results from the bound Genie Agent.
  const {
    messages,
    status,
    conversationId,
    error,
    sendMessage,
    reset,
    hasPreviousPage,
    isFetchingPreviousPage,
    fetchPreviousPage,
  } = useGenieChat({ alias: 'default', basePath: '/api/askdata', persistInUrl: false });
  const messageListRef = useRef<HTMLDivElement>(null);
  const isBusy = status === 'streaming' || status === 'loading-history' || status === 'loading-older';
  const activeMessage = [...messages].reverse().find((message) => message.role === 'assistant');
  const sendRunScopedMessage = useCallback(
    (question: string) => sendMessage(buildRunScopedQuestion(question, context)),
    [context, sendMessage]
  );

  useEffect(() => {
    if (status === 'loading-older') return;
    const messageList = messageListRef.current;
    if (messageList) messageList.scrollTop = messageList.scrollHeight;
  }, [messages, status]);

  return (
    <>
      <div className="dataone-genie-disclosure">
        <div>
          <Badge variant="outline" className="dataone-tone dataone-tone--good">
            <Bot aria-hidden="true" />
            DataOne Genie connected
          </Badge>
          <strong>{identity?.email ?? identity?.user ?? 'Signed-in Databricks user'}</strong>
        </div>
        <p>
          Signed in as {identity?.email ?? identity?.user ?? 'a Databricks user'}. Questions run through the DataOne App
          service principal, restricted to its approved Unity Catalog tables and dedicated Genie Agent.
        </p>
      </div>

      <div className="dataone-genie-frame">
        <div className="dataone-genie-toolbar">
          <div>
            <strong>DataOne AskData</strong>
            <span>Run health · quality · mapping · business impact · prediction · source/target</span>
          </div>
          <div>
            {conversationId && (
              <Badge variant="outline" title={conversationId}>
                Conversation {conversationId.slice(-8)}
              </Badge>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={reset}
              disabled={isBusy || (!conversationId && messages.length === 0)}
            >
              <RefreshCw aria-hidden="true" />
              New conversation
            </Button>
          </div>
        </div>

        <div ref={messageListRef} className="dataone-genie-messages" aria-live="polite">
          {hasPreviousPage && messages.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="dataone-genie-history-button"
              onClick={fetchPreviousPage}
              disabled={isFetchingPreviousPage}
            >
              {isFetchingPreviousPage && <Loader2 className="dataone-spin" aria-hidden="true" />}
              {isFetchingPreviousPage ? 'Loading earlier messages…' : 'Load earlier messages'}
            </Button>
          )}

          {status === 'loading-history' && (
            <div className="dataone-genie-loading" aria-label="Loading AskData conversation history">
              <Skeleton className="h-20 w-3/5" />
              <Skeleton className="h-32 w-4/5" />
              <p>Restoring this Genie conversation…</p>
            </div>
          )}

          {status !== 'loading-history' && messages.length === 0 && !error && (
            <Empty className="dataone-empty dataone-genie-empty">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Bot aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>Ask a question about your DataOne results</EmptyTitle>
                <EmptyDescription>
                  Genie uses the dedicated governed space and returns the generated SQL with each data answer.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent className="dataone-genie-prompts">
                {DATAONE_QUESTION_GROUPS.map((group) => (
                  <div className="dataone-question-group" key={group.label}>
                    <strong>{group.label}</strong>
                    <div>
                      {group.questions.map((question) => (
                        <Button
                          key={question}
                          type="button"
                          variant="outline"
                          onClick={() => sendRunScopedMessage(question)}
                        >
                          {question}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </EmptyContent>
            </Empty>
          )}

          {messages.map((message, index) => {
            const isPendingAssistant =
              message.role === 'assistant' && !GENIE_TERMINAL_STATUSES.has(message.status) && !message.content;
            const isFinalAssistant = message.role === 'assistant' && message.status === 'COMPLETED';
            const displayedMessage: GenieMessageItem =
              message.role === 'user'
                ? { ...message, content: visibleQuestionFromRunScopedContent(message.content) }
                : message;

            return (
              <div className="dataone-genie-message-group" key={`${message.id || `pending-${index}`}-${message.role}`}>
                {isPendingAssistant ? (
                  <div className="dataone-genie-stream-status" role="status">
                    <span className="dataone-genie-pulse" aria-hidden="true" />
                    <div>
                      <strong>{genieStatusLabel(message.status)}</strong>
                      <small>Genie is working against governed DataOne tables.</small>
                    </div>
                  </div>
                ) : (
                  <GenieChatMessage message={displayedMessage} className="dataone-genie-message" />
                )}

                {isFinalAssistant && hasZeroRowQueryResult(message) && (
                  <Empty className="dataone-genie-zero-results">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <SearchCode aria-hidden="true" />
                      </EmptyMedia>
                      <EmptyTitle>No rows matched the generated query</EmptyTitle>
                      <EmptyDescription>
                        Genie completed the SQL, but the result set was empty. Adjust the date range or filters and ask
                        again.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}

                {isFinalAssistant && (
                  <p className="dataone-genie-answer-note">
                    <Code2 aria-hidden="true" />
                    AI-generated from governed DataOne data — review the generated SQL before trusting this answer.
                  </p>
                )}
              </div>
            );
          })}

          {status === 'streaming' && activeMessage?.content && (
            <div className="dataone-genie-inline-status" role="status">
              <span className="dataone-genie-pulse" aria-hidden="true" />
              {genieStatusLabel(activeMessage.status)}…
            </div>
          )}

          {status === 'error' && (
            <Alert variant="destructive" className="dataone-inline-alert">
              <CircleAlert aria-hidden="true" />
              <AlertTitle>AskData could not complete the question</AlertTitle>
              <AlertDescription>
                {error ?? 'Genie failed to return an answer. Rephrase the question or start a new conversation.'}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <GenieChatInput
          onSend={sendRunScopedMessage}
          disabled={isBusy}
          placeholder="Ask about quality, cleaning, schema mappings, or recent runs…"
          className="dataone-genie-input"
        />
      </div>

      <Alert className="dataone-ai-note">
        <Code2 aria-hidden="true" />
        <AlertTitle>Governed natural-language analysis</AlertTitle>
        <AlertDescription>
          Genie runs through the Databricks-managed DataOne App identity and its least-privilege Unity Catalog grants.
          Answers can be wrong; verify the expandable generated SQL and returned data before making a decision.
        </AlertDescription>
      </Alert>
    </>
  );
}

function DataSection({
  id,
  number,
  icon,
  title,
  description,
  children,
}: {
  id: string;
  number: string;
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="dataone-section">
      <header className="dataone-section-heading">
        <div className="dataone-section-number">{number}</div>
        <div className="dataone-section-icon" aria-hidden="true">
          {icon}
        </div>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </header>
      <div className="dataone-section-body">{children}</div>
    </section>
  );
}

function QueryBoundary({ query, subject, children }: { query: QueryState; subject: string; children: ReactNode }) {
  if (query.loading) {
    return (
      <div className="dataone-query-loading" aria-label={`Loading ${subject}`}>
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        {query.warehouseStatus?.state === 'STARTING' && (
          <p>The SQL warehouse is starting. Results will appear automatically.</p>
        )}
      </div>
    );
  }

  if (query.error) {
    return (
      <Alert variant="destructive">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>Unable to load {subject}</AlertTitle>
        <AlertDescription>{query.error}</AlertDescription>
      </Alert>
    );
  }

  if (!query.data || query.data.length === 0) {
    return (
      <Empty className="dataone-empty">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Database aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>No {subject} returned</EmptyTitle>
          <EmptyDescription>
            This run completed, but the analytics source returned no rows. Check the run ID and processing output.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <code>Results are filtered to the selected run.</code>
        </EmptyContent>
      </Empty>
    );
  }

  return children;
}

function QueryCard({
  query,
  subject,
  title,
  source,
  freshness,
  isDemo,
  children,
}: {
  query: QueryState;
  subject: string;
  title: string;
  source: string;
  freshness: string;
  isDemo: boolean;
  children: ReactNode;
}) {
  return (
    <Card className="dataone-panel dataone-chart-card">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {isDemo ? 'Synthetic · current demo run · local fixture API' : 'Actual · current run · Databricks SQL'}
        </CardDescription>
        <small className="dataone-query-meta">
          Source: {source} · Freshness: {freshness}
        </small>
      </CardHeader>
      <CardContent>
        <QueryBoundary query={query} subject={subject}>
          {children}
        </QueryBoundary>
      </CardContent>
    </Card>
  );
}

function MetricRing({ value, label }: { value: number | null; label: string }) {
  const normalizedValue = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div
      className="dataone-metric-ring"
      role="img"
      aria-label={`${label}: ${formatPercent(value)}`}
      style={{ background: `conic-gradient(#e9eef2 ${normalizedValue}%, #384149 ${normalizedValue}% 100%)` }}
    >
      <div>
        <strong>{formatPercent(value)}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

function MiniMetric({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="dataone-mini-metric">
      <span aria-hidden="true">{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function MetricDefinition({
  name,
  value,
  definition,
  source,
}: {
  name: string;
  value: string;
  definition: string;
  source: string;
}) {
  return (
    <Card className="dataone-panel dataone-metric-definition">
      <CardHeader>
        <CardDescription>{name}</CardDescription>
        <CardTitle>{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p>{definition}</p>
        <code>{source}</code>
      </CardContent>
    </Card>
  );
}

function DataTableShell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="dataone-table-shell" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}

function ExecutionIdentity({ title, identity, component }: { title: string; identity: string; component: string }) {
  return (
    <div>
      <span className="dataone-ledger-icon">
        <LockKeyhole aria-hidden="true" />
      </span>
      <div>
        <strong>{title}</strong>
        <small>{component}</small>
      </div>
      <Badge variant="outline">{identity}</Badge>
    </div>
  );
}
