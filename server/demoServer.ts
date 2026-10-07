import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TextDecoder } from 'node:util';
import {
  createDemoAnalytics,
  createDemoJobRun,
  DEMO_QUERY_KEYS,
  parseDemoSource,
  transformDemoRecords,
  type DemoAnalyticsSnapshot,
  type DemoFileFormat,
  type DemoQueryKey,
  type ParsedRecords,
} from './demoData.js';
import { jobParameters } from './dataoneValidation.js';
import {
  localMysqlSourceLabel,
  parseLocalMysqlSource,
  readLocalMysqlTable,
  testLocalMysqlConnection,
} from './localMysql.js';
import {
  localPostgresTargetLabel,
  parseLocalPostgresTarget,
  publishLocalPostgresTable,
  testLocalPostgresConnection,
  type LocalPostgresPublishResult,
} from './localPostgres.js';
import { projectPostgresTableLeaf } from '../shared/projectGold.js';

const DEFAULT_PORT = 4173;
const JSON_BODY_LIMIT = 128 * 1024;
const DEMO_UPLOAD_LIMIT = 10 * 1024 * 1024;
const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const CLIENT_DIST = resolve(PROJECT_ROOT, 'client/dist');
const SAMPLE_BASE_NAME = 'customer_revenue_quality_demo';
const SAMPLE_FILES: Record<DemoFileFormat, { filename: string; path: string; mediaType: string }> = {
  csv: {
    filename: `${SAMPLE_BASE_NAME}.csv`,
    path: resolve(PROJECT_ROOT, `samples/${SAMPLE_BASE_NAME}.csv`),
    mediaType: 'text/csv; charset=utf-8',
  },
  json: {
    filename: `${SAMPLE_BASE_NAME}.json`,
    path: resolve(PROJECT_ROOT, `samples/${SAMPLE_BASE_NAME}.json`),
    mediaType: 'application/json; charset=utf-8',
  },
  parquet: {
    filename: `${SAMPLE_BASE_NAME}.parquet`,
    path: resolve(PROJECT_ROOT, `samples/${SAMPLE_BASE_NAME}.parquet`),
    mediaType: 'application/vnd.apache.parquet',
  },
};
const DEMO_SOURCE_CONNECTION = {
  alias: 'demo-mysql-commerce',
  label: 'MySQL Commerce (simulated)',
  engine: 'MySQL',
  role: 'source',
  credentialMode: 'governed-alias-only',
  status: 'READY',
  simulated: true,
} as const;
const DEMO_TARGET_CONNECTION = {
  alias: 'demo-postgres-analytics',
  label: 'PostgreSQL Analytics (simulated)',
  engine: 'PostgreSQL',
  role: 'target',
  credentialMode: 'governed-alias-only',
  status: 'READY',
  simulated: true,
} as const;
const SAFE_DIRECTORY = /^(csv|json|parquet)(\/[A-Za-z0-9._-]+)+$/i;
const SAFE_FILE = /^(csv|json|parquet)(\/[A-Za-z0-9._-]+)+\.(csv|json|parquet)$/i;

type JsonObject = Record<string, unknown>;

interface ActiveRun {
  numericRunId: number;
  pollCount: number;
  startedAtMs: number;
  workflowLabel: string;
  includePublishTask: boolean;
  targetLive: boolean;
  targetPublication: LocalPostgresPublishResult | null;
}

interface UploadedSource {
  format: DemoFileFormat;
  path: string;
  records: ParsedRecords;
}

class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

if (process.env.DATAONE_DEMO_MODE !== 'true') {
  throw new Error(
    'The local demo server is disabled. Start it with `npm run demo`; use `npm run dev` for live Databricks resources.'
  );
}

const textDecoder = new TextDecoder('utf-8', { fatal: true });
const sampleBytes = {
  csv: await readFile(SAMPLE_FILES.csv.path),
  json: await readFile(SAMPLE_FILES.json.path),
  parquet: await readFile(SAMPLE_FILES.parquet.path),
};
const sampleRecords = await parseDemoSource('csv', textDecoder.decode(sampleBytes.csv));
const sampleJsonRecords = await parseDemoSource('json', textDecoder.decode(sampleBytes.json));
const sampleParquetRecords = await parseDemoSource('parquet', sampleBytes.parquet);
if (
  JSON.stringify(sampleRecords) !== JSON.stringify(sampleJsonRecords) ||
  JSON.stringify(sampleRecords) !== JSON.stringify(sampleParquetRecords)
) {
  throw new Error('Local demo sample CSV, JSON, and Parquet files must contain equivalent normalized records.');
}

let uploadedSource: UploadedSource | null = null;
let analyticsSnapshot: DemoAnalyticsSnapshot = createDemoAnalytics(sampleRecords, {
  projectName: 'Customer 360 CSV Demo',
  runId: 'sample_preview',
  sourceIdentifier: SAMPLE_FILES.csv.filename,
  sourceFormat: 'csv',
});
let activeRun: ActiveRun | null = null;
let nextNumericRunId = 810_001;

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload),
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(payload);
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readBody(request: IncomingMessage, limit: number): Promise<Buffer> {
  const contentLength = request.headers['content-length'];
  if (contentLength !== undefined) {
    const declaredSize = Number(contentLength);
    if (!Number.isSafeInteger(declaredSize) || declaredSize < 0) {
      throw new HttpError(400, 'Invalid Content-Length header.');
    }
    if (declaredSize > limit) {
      throw new HttpError(413, `Request body exceeds the local demo limit of ${limit} bytes.`);
    }
  }

  const chunks: Buffer[] = [];
  let totalSize = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    totalSize += buffer.length;
    if (totalSize > limit) {
      throw new HttpError(413, `Request body exceeds the local demo limit of ${limit} bytes.`);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, totalSize);
}

async function readJson(request: IncomingMessage, limit = JSON_BODY_LIMIT): Promise<JsonObject> {
  const body = await readBody(request, limit);
  if (body.length === 0) throw new HttpError(400, 'A JSON request body is required.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString('utf8')) as unknown;
  } catch {
    throw new HttpError(400, 'Request body must contain valid JSON.');
  }
  if (!isObject(parsed)) throw new HttpError(400, 'Request body must be a JSON object.');
  return parsed;
}

function validateDemoPath(value: unknown, kind: 'directory' | 'file'): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 500) {
    throw new HttpError(400, `A valid demo ${kind} path is required.`);
  }
  if (value.startsWith('/') || value.includes('\\') || value.split('/').some((part) => part === '.' || part === '..')) {
    throw new HttpError(400, `The demo ${kind} path must remain inside its format directory.`);
  }

  const pattern = kind === 'directory' ? SAFE_DIRECTORY : SAFE_FILE;
  const match = pattern.exec(value);
  if (!match) throw new HttpError(400, `The demo ${kind} path contains unsupported characters or structure.`);
  if (kind === 'file' && match[1]?.toLowerCase() !== match[3]?.toLowerCase()) {
    throw new HttpError(400, 'The file extension must match its format directory.');
  }
  return value;
}

function validateConnectorLabel(value: unknown, role: 'source' | 'target'): string {
  if (typeof value !== 'string') throw new HttpError(400, `A ${role} connector label is required.`);
  const normalized = value.trim();
  const containsControlCharacter = Array.from(normalized).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint < 32 || codePoint === 127);
  });
  if (normalized.length < 3 || normalized.length > 500 || containsControlCharacter) {
    throw new HttpError(400, `The ${role} connector label is invalid.`);
  }
  return normalized;
}

function formatFromDemoPath(path: string): DemoFileFormat {
  const format = path.split('/')[0]?.toLowerCase();
  if (format === 'csv' || format === 'json' || format === 'parquet') return format;
  throw new HttpError(400, `Unsupported local demo format directory: ${format ?? '(missing)'}.`);
}

function decodeTextPayload(body: Buffer, format: 'csv' | 'json'): string {
  try {
    return textDecoder.decode(body);
  } catch (error) {
    throw new HttpError(400, `The uploaded ${format.toUpperCase()} file is not valid UTF-8: ${errorMessage(error)}`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Unknown local demo error';
}

function isDemoQueryKey(value: string): value is DemoQueryKey {
  return (DEMO_QUERY_KEYS as readonly string[]).includes(value);
}

function contentTypeFor(pathname: string): string {
  const mimeTypes: Record<string, string> = {
    '.css': 'text/css; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.parquet': 'application/vnd.apache.parquet',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
  };
  return mimeTypes[extname(pathname).toLowerCase()] ?? 'application/octet-stream';
}

function resolveStaticFile(pathname: string): string {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    throw new HttpError(400, 'URL path contains invalid encoding.');
  }
  if (decodedPath.includes('\0') || decodedPath.includes('\\')) {
    throw new HttpError(400, 'URL path is invalid.');
  }

  const relativePath = decodedPath.replace(/^\/+/, '');
  const candidate = resolve(CLIENT_DIST, relativePath);
  if (candidate !== CLIENT_DIST && !candidate.startsWith(`${CLIENT_DIST}${sep}`)) {
    throw new HttpError(403, 'Static path is outside the demo application.');
  }
  return candidate;
}

async function sendFile(response: ServerResponse, filePath: string, method: string): Promise<void> {
  const fileStats = await stat(filePath);
  if (!fileStats.isFile()) throw new HttpError(404, 'File not found.');

  response.writeHead(200, {
    'Cache-Control': filePath.endsWith('index.html') ? 'no-store' : 'public, max-age=3600',
    'Content-Length': fileStats.size,
    'Content-Type': contentTypeFor(filePath),
  });
  if (method === 'HEAD') {
    response.end();
    return;
  }

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const stream = createReadStream(filePath);
    stream.once('error', rejectPromise);
    response.once('error', rejectPromise);
    response.once('finish', resolvePromise);
    stream.pipe(response);
  });
}

function sendAnalyticsResult(response: ServerResponse, rows: unknown[]): void {
  response.writeHead(200, {
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream; charset=utf-8',
    'X-Accel-Buffering': 'no',
  });
  response.write(
    `id: ${randomUUID()}\ndata: ${JSON.stringify({
      type: 'warehouse_status',
      status: { state: 'RUNNING', elapsedMs: 0 },
    })}\n\n`
  );
  response.end(`id: ${randomUUID()}\ndata: ${JSON.stringify({ type: 'result', data: rows })}\n\n`);
}

async function handleApi(request: IncomingMessage, response: ServerResponse, url: URL): Promise<boolean> {
  const method = request.method ?? 'GET';

  if (method === 'GET' && url.pathname === '/api/whoami') {
    sendJson(response, 200, {
      user: 'demo.user',
      email: 'demo.user@dataone.local',
      executionIdentity: 'Local deterministic demo (no Databricks calls)',
      demo: true,
    });
    return true;
  }

  if (method === 'GET' && url.pathname === '/api/demo/samples') {
    const descriptors = await Promise.all(
      (Object.keys(SAMPLE_FILES) as DemoFileFormat[]).map(async (format) => {
        const sample = SAMPLE_FILES[format];
        const sampleStats = await stat(sample.path);
        return {
          format,
          filename: sample.filename,
          url: `/api/demo/sample.${format}`,
          mediaType: sample.mediaType,
          sizeBytes: sampleStats.size,
          rowCount: sampleRecords.rows.length,
          description: `Equivalent ${format.toUpperCase()} customer-order sample with intentional quality issues.`,
        };
      })
    );
    sendJson(response, 200, { samples: descriptors, simulated: true });
    return true;
  }

  if (method === 'GET' && url.pathname === '/api/demo/connections') {
    sendJson(response, 200, {
      source: DEMO_SOURCE_CONNECTION,
      target: DEMO_TARGET_CONNECTION,
      simulated: true,
      acceptsCredentials: true,
      liveLocalSource: 'mysql',
      liveLocalTarget: 'postgresql',
    });
    return true;
  }

  if (method === 'POST' && url.pathname === '/api/demo/database/test') {
    const body = await readJson(request);
    const allowedKeys = new Set(['sourceDatabase', 'targetDatabase']);
    const unexpectedKeys = Object.keys(body).filter((key) => !allowedKeys.has(key));
    if (unexpectedKeys.length > 0) {
      throw new HttpError(400, `Connection test contains unsupported fields: ${unexpectedKeys.join(', ')}.`);
    }

    const hasSource = body.sourceDatabase !== undefined;
    const hasTarget = body.targetDatabase !== undefined;
    if (hasSource === hasTarget) {
      throw new HttpError(400, 'Connection test requires exactly one sourceDatabase or targetDatabase object.');
    }

    try {
      if (hasSource) {
        const source = parseLocalMysqlSource(body.sourceDatabase);
        const result = await testLocalMysqlConnection(source);
        sendJson(response, 200, {
          connected: result.connected,
          engine: 'mysql',
          database: result.database,
          table: result.table,
          rowCount: result.rowCount,
          columns: result.columns,
          tableExists: true,
          credentialStored: false,
        });
      } else {
        const target = parseLocalPostgresTarget(body.targetDatabase);
        const result = await testLocalPostgresConnection(target);
        sendJson(response, 200, {
          connected: result.connected,
          engine: 'postgresql',
          database: result.database,
          schema: result.schema,
          table: result.table,
          rowCount: result.rowCount,
          columns: result.columns,
          tableExists: result.tableExists,
          credentialStored: false,
        });
      }
    } catch (error) {
      const engine = hasSource ? 'MySQL' : 'PostgreSQL';
      throw new HttpError(400, `Unable to connect to local ${engine}: ${errorMessage(error)}`);
    }
    return true;
  }

  const sampleMatch = /^\/api\/demo\/sample\.(csv|json|parquet)$/.exec(url.pathname);
  if (method === 'GET' && sampleMatch) {
    const format = sampleMatch[1] as DemoFileFormat;
    const sample = SAMPLE_FILES[format];
    const sampleStats = await stat(sample.path);
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Disposition': `inline; filename="${sample.filename}"`,
      'Content-Length': sampleStats.size,
      'Content-Type': sample.mediaType,
    });
    createReadStream(sample.path).pipe(response);
    return true;
  }

  if (method === 'POST' && url.pathname === '/api/files/files/mkdir') {
    const body = await readJson(request);
    const directory = validateDemoPath(body.path, 'directory');
    sendJson(response, 200, { path: directory, created: true, demo: true });
    return true;
  }

  if (method === 'POST' && url.pathname === '/api/files/files/upload') {
    const sourcePath = validateDemoPath(url.searchParams.get('path'), 'file');
    const format = formatFromDemoPath(sourcePath);
    const body = await readBody(request, DEMO_UPLOAD_LIMIT);
    if (body.length === 0) throw new HttpError(400, `The uploaded ${format.toUpperCase()} file is empty.`);

    let records: ParsedRecords;
    try {
      const payload = format === 'parquet' ? body : decodeTextPayload(body, format);
      records = await parseDemoSource(format, payload);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(400, `The uploaded file is not valid ${format.toUpperCase()}: ${errorMessage(error)}`);
    }

    uploadedSource = { format, path: sourcePath, records };
    analyticsSnapshot = createDemoAnalytics(records, {
      projectName: `Uploaded ${format.toUpperCase()} Preview`,
      runId: 'upload_preview',
      sourceIdentifier: sourcePath,
      sourceFormat: format,
    });
    sendJson(response, 200, {
      path: sourcePath,
      format,
      size: body.length,
      rowCount: records.rows.length,
      columnCount: records.headers.length,
      uploaded: true,
      demo: true,
    });
    return true;
  }

  if (method === 'POST' && url.pathname === '/api/demo/database/run') {
    const body = await readJson(request);
    const allowedKeys = new Set([
      'sourceConnection',
      'targetConnection',
      'sourceLabel',
      'targetLabel',
      'projectName',
      'workflowRunId',
      'sourceDatabase',
      'targetDatabase',
    ]);
    const unexpectedKeys = Object.keys(body).filter((key) => !allowedKeys.has(key));
    if (unexpectedKeys.length > 0) {
      throw new HttpError(
        400,
        `Database demo accepts governed aliases only; unsupported fields: ${unexpectedKeys.join(', ')}.`
      );
    }
    if (body.sourceConnection !== DEMO_SOURCE_CONNECTION.alias) {
      throw new HttpError(400, `sourceConnection must be ${DEMO_SOURCE_CONNECTION.alias}.`);
    }
    if (body.targetConnection !== DEMO_TARGET_CONNECTION.alias) {
      throw new HttpError(400, `targetConnection must be ${DEMO_TARGET_CONNECTION.alias}.`);
    }
    if (
      typeof body.projectName !== 'string' ||
      body.projectName.trim().length < 3 ||
      body.projectName.trim().length > 120
    ) {
      throw new HttpError(400, 'projectName must contain 3–120 characters.');
    }
    if (typeof body.workflowRunId !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(body.workflowRunId)) {
      throw new HttpError(400, 'workflowRunId must be an 8–80 character identifier using letters, digits, _ or -.');
    }

    const projectName = body.projectName.trim();
    const workflowRunId = body.workflowRunId;
    let sourceLabel = validateConnectorLabel(body.sourceLabel, 'source');
    let targetLabel = validateConnectorLabel(body.targetLabel, 'target');
    let databaseRecords = sampleRecords;
    let liveRowCount: number | null = null;
    let liveRowsTruncated = false;
    let sourceLive = false;
    let targetLive = false;
    let targetPublication: LocalPostgresPublishResult | null = null;

    if (body.sourceDatabase !== undefined) {
      try {
        const source = parseLocalMysqlSource(body.sourceDatabase);
        const readResult = await readLocalMysqlTable(source);
        if (readResult.records.rows.length === 0) {
          throw new Error(`Table ${readResult.database}.${readResult.table} contains no rows.`);
        }
        databaseRecords = readResult.records;
        liveRowCount = readResult.rowCount;
        liveRowsTruncated = readResult.truncated;
        sourceLabel = localMysqlSourceLabel(source);
        sourceLive = true;
      } catch (error) {
        throw new HttpError(400, `Unable to read local MySQL source: ${errorMessage(error)}`);
      }
    }

    if (body.targetDatabase !== undefined) {
      try {
        if (!isObject(body.targetDatabase)) throw new Error('targetDatabase must be an object.');
        const target = parseLocalPostgresTarget({
          ...body.targetDatabase,
          table: projectPostgresTableLeaf(projectName),
        });
        targetPublication = await publishLocalPostgresTable(target, transformDemoRecords(databaseRecords));
        targetLabel = localPostgresTargetLabel(target);
        targetLive = true;
      } catch (error) {
        throw new HttpError(400, `Unable to publish to local PostgreSQL: ${errorMessage(error)}`);
      }
    }

    analyticsSnapshot = createDemoAnalytics(databaseRecords, {
      projectName,
      runId: workflowRunId,
      sourceIdentifier: sourceLabel,
      sourceMode: 'database_connection',
      sourceFormat: 'database',
      targetIdentifier: targetLabel,
      startedAt: new Date().toISOString(),
      sourceConnectionLive: sourceLive,
      targetConnectionLive: targetLive,
    });
    activeRun = {
      numericRunId: nextNumericRunId,
      pollCount: 0,
      startedAtMs: Date.now(),
      workflowLabel:
        sourceLive && targetLive
          ? 'DataOne live MySQL transformation and PostgreSQL publication'
          : sourceLive
            ? 'DataOne live local MySQL read with simulated Databricks processing and target publication'
            : 'DataOne simulated database migration',
      includePublishTask: true,
      targetLive,
      targetPublication,
    };
    nextNumericRunId += 1;
    sendJson(response, 200, {
      runId: activeRun.numericRunId,
      run_id: activeRun.numericRunId,
      workflowRunId,
      source: sourceLive
        ? {
            ...DEMO_SOURCE_CONNECTION,
            label: sourceLabel,
            credentialMode: 'request-memory-only',
            status: 'CONNECTED',
            simulated: false,
          }
        : DEMO_SOURCE_CONNECTION,
      target: targetLive
        ? {
            ...DEMO_TARGET_CONNECTION,
            label: targetLabel,
            credentialMode: 'request-memory-only',
            status: 'PUBLISHED',
            simulated: false,
          }
        : DEMO_TARGET_CONNECTION,
      sourceLive,
      liveRowCount,
      loadedRowCount: databaseRecords.rows.length,
      liveRowsTruncated,
      targetLive,
      targetSimulated: !targetLive,
      targetPublication,
      simulated: !sourceLive && !targetLive,
    });
    return true;
  }

  if (method === 'POST' && url.pathname === '/api/jobs/default/run') {
    const body = await readJson(request);
    const paramsContainer = isObject(body.params) ? body.params : null;
    const parsedParams = jobParameters.safeParse(paramsContainer?.job_parameters);
    if (!parsedParams.success) {
      sendJson(response, 400, {
        error: 'Invalid DataOne demo Job parameters.',
        issues: parsedParams.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      });
      return true;
    }

    const parameters = parsedParams.data;
    const sourceIdentifier = parameters.source_mode === 'uc_table' ? parameters.source_table : parameters.source_path;
    let records = sampleRecords;
    let sourceFormat: DemoAnalyticsSnapshot['sourceFormat'] = 'unity_catalog';
    if (parameters.source_mode === 'volume_file') {
      if (!uploadedSource) {
        throw new HttpError(409, 'Upload the selected demo file before starting its Job run.');
      }
      if (uploadedSource.path !== parameters.source_path) {
        throw new HttpError(409, 'The Job source path does not match the most recently validated demo upload.');
      }
      if (uploadedSource.format !== parameters.source_format) {
        throw new HttpError(409, 'The Job source format does not match the validated demo upload.');
      }
      records = uploadedSource.records;
      sourceFormat = uploadedSource.format;
    }

    analyticsSnapshot = createDemoAnalytics(records, {
      projectName: parameters.project_name,
      runId: parameters.run_id,
      sourceIdentifier,
      sourceMode: parameters.source_mode,
      sourceFormat,
      startedAt: new Date().toISOString(),
    });

    activeRun = {
      numericRunId: nextNumericRunId,
      pollCount: 0,
      startedAtMs: Date.now(),
      workflowLabel: 'DataOne local file demo',
      includePublishTask: false,
      targetLive: false,
      targetPublication: null,
    };
    nextNumericRunId += 1;
    sendJson(response, 200, { runId: activeRun.numericRunId, run_id: activeRun.numericRunId, demo: true });
    return true;
  }

  const runMatch = /^\/api\/jobs\/default\/runs\/(\d+)$/.exec(url.pathname);
  if (method === 'GET' && runMatch) {
    const requestedRunId = Number(runMatch[1]);
    if (!activeRun || activeRun.numericRunId !== requestedRunId) {
      throw new HttpError(404, `Demo Job run ${requestedRunId} was not found.`);
    }

    activeRun.pollCount += 1;
    const stage =
      activeRun.pollCount === 1
        ? 'PROFILING'
        : activeRun.pollCount === 2
          ? 'PIPELINE'
          : activeRun.includePublishTask && activeRun.pollCount === 3
            ? 'PUBLISHING'
            : 'SUCCEEDED';
    sendJson(
      response,
      200,
      createDemoJobRun(activeRun.numericRunId, stage, {
        startedAtMs: activeRun.startedAtMs,
        workflowLabel: activeRun.workflowLabel,
        includePublishTask: activeRun.includePublishTask,
        targetLive: activeRun.targetLive,
      })
    );
    return true;
  }

  const analyticsMatch = /^\/api\/analytics\/query\/([^/]+)$/.exec(url.pathname);
  if (method === 'POST' && analyticsMatch) {
    let queryKey: string;
    try {
      queryKey = decodeURIComponent(analyticsMatch[1] ?? '');
    } catch {
      throw new HttpError(400, 'Analytics query key contains invalid encoding.');
    }
    if (!isDemoQueryKey(queryKey)) throw new HttpError(404, `Unknown demo analytics query: ${queryKey}`);

    const body = await readJson(request);
    if (body.format !== undefined && body.format !== 'JSON_ARRAY' && body.format !== 'JSON') {
      throw new HttpError(400, 'The local demo supports the JSON_ARRAY analytics format only.');
    }
    if (body.parameters !== undefined && body.parameters !== null && !isObject(body.parameters)) {
      throw new HttpError(400, 'Analytics parameters must be a JSON object.');
    }

    const parameters = isObject(body.parameters) ? body.parameters : null;
    const requestedWorkflowRunId = parameters?.run_id;
    const currentWorkflowRunId = analyticsSnapshot.runId;
    const rows =
      typeof requestedWorkflowRunId === 'string' && requestedWorkflowRunId !== currentWorkflowRunId
        ? []
        : analyticsSnapshot.queries[queryKey];
    sendAnalyticsResult(response, rows);
    return true;
  }

  if (url.pathname.startsWith('/api/')) {
    throw new HttpError(404, `Unknown local demo endpoint: ${method} ${url.pathname}`);
  }
  return false;
}

async function handleStatic(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
  const method = request.method ?? 'GET';
  if (method !== 'GET' && method !== 'HEAD') throw new HttpError(405, 'Static files support GET and HEAD only.');

  if (url.pathname === '/' && url.searchParams.get('demo') !== '1') {
    response.writeHead(302, { Location: '/?demo=1' });
    response.end();
    return;
  }

  const requestedFile = url.pathname === '/' ? resolve(CLIENT_DIST, 'index.html') : resolveStaticFile(url.pathname);
  try {
    await sendFile(response, requestedFile, method);
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    await sendFile(response, resolve(CLIENT_DIST, 'index.html'), method);
  }
}

const configuredPort = Number(process.env.DATAONE_DEMO_PORT ?? DEFAULT_PORT);
if (!Number.isInteger(configuredPort) || configuredPort < 1 || configuredPort > 65_535) {
  throw new Error('DATAONE_DEMO_PORT must be an integer from 1 through 65535.');
}

const httpServer = createServer((request, response) => {
  void (async () => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
    const handled = await handleApi(request, response, url);
    if (!handled) await handleStatic(request, response, url);
  })().catch((error: unknown) => {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    const message = error instanceof Error ? error.message : 'Unknown local demo server error';
    if (statusCode >= 500) console.error('[DataOne demo only] Request failed:', error);
    if (!response.headersSent) {
      sendJson(response, statusCode, { error: message, demo: true });
    } else if (!response.writableEnded) {
      response.end();
    }
  });
});

httpServer.on('clientError', (_error, socket) => {
  socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
});

httpServer.listen(configuredPort, '127.0.0.1', () => {
  console.log(`[DataOne demo only] Open http://127.0.0.1:${configuredPort}/?demo=1`);
  console.log(
    '[DataOne demo only] Local execution is active. Loopback MySQL may be read and loopback PostgreSQL may be published; no Databricks APIs or resources are called.'
  );
});

function closeServer(signal: string): void {
  console.log(`[DataOne demo only] Received ${signal}; stopping.`);
  httpServer.close((error) => {
    if (error) {
      console.error('[DataOne demo only] Failed to stop cleanly:', error);
      process.exitCode = 1;
    }
  });
}

process.once('SIGINT', () => closeServer('SIGINT'));
process.once('SIGTERM', () => closeServer('SIGTERM'));
