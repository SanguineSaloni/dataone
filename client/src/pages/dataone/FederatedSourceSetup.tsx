import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@databricks/appkit-ui/react';
import {
  CheckCircle2,
  CircleAlert,
  Database,
  Eye,
  EyeOff,
  FileArchive,
  Loader2,
  LockKeyhole,
  Server,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import initSqlJs from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

type SourceEngine = 'mysql' | 'postgresql' | 'oracle' | 'sqlite';
type FederatedEngine = Extract<SourceEngine, 'mysql' | 'postgresql' | 'oracle'>;
type ConfiguredFederatedEngine = Extract<FederatedEngine, 'mysql' | 'postgresql'>;

export interface SqliteSourceSelection {
  file: File;
  table: string;
  columnCount: number;
}

interface SqliteTable {
  name: string;
  columnCount: number;
}

interface FederatedTable {
  catalog: string;
  schema: string;
  name: string;
  type: 'TABLE' | 'VIEW';
  columnCount: number;
}

interface FederatedOnboardingResult {
  connected: true;
  engine: FederatedEngine;
  provider: string;
  namespace: string;
  connectionName: string;
  catalogName: string;
  tables: FederatedTable[];
}

interface FederatedForm {
  host: string;
  port: string;
  namespace: string;
  user: string;
  password: string;
}

const ENGINE_OPTIONS: ReadonlyArray<{ value: SourceEngine; label: string; detail: string }> = [
  { value: 'mysql', label: 'AWS RDS MySQL', detail: 'Lakehouse Federation' },
  { value: 'postgresql', label: 'AWS RDS PostgreSQL', detail: 'Lakehouse Federation' },
  { value: 'oracle', label: 'AWS RDS Oracle', detail: 'Lakehouse Federation' },
  { value: 'sqlite', label: 'Local SQLite', detail: 'Unity Catalog Volume' },
];

const MAX_SQLITE_BROWSER_SIZE = 100 * 1024 * 1024;
const SQLITE_TABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

const INITIAL_FORMS: Record<FederatedEngine, FederatedForm> = {
  mysql: { host: '', port: '3306', namespace: 'dataone_source', user: '', password: '' },
  postgresql: { host: '', port: '5432', namespace: 'dataone_target', user: '', password: '' },
  oracle: { host: '', port: '1521', namespace: 'ORCLPDB1', user: '', password: '' },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSourceEngine(value: string): value is SourceEngine {
  return ENGINE_OPTIONS.some((option) => option.value === value);
}

function isFederatedEngine(value: SourceEngine): value is FederatedEngine {
  return value === 'mysql' || value === 'postgresql' || value === 'oracle';
}

function isPipelineCompatibleIdentifier(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

function parseResult(value: unknown): FederatedOnboardingResult {
  if (
    !isRecord(value) ||
    value.connected !== true ||
    (value.engine !== 'mysql' && value.engine !== 'postgresql' && value.engine !== 'oracle') ||
    typeof value.provider !== 'string' ||
    typeof value.namespace !== 'string' ||
    typeof value.connectionName !== 'string' ||
    typeof value.catalogName !== 'string' ||
    !Array.isArray(value.tables)
  ) {
    throw new Error('The AWS database returned an unexpected response.');
  }

  const tables: FederatedTable[] = value.tables.map((table) => {
    if (
      !isRecord(table) ||
      typeof table.catalog !== 'string' ||
      typeof table.schema !== 'string' ||
      typeof table.name !== 'string' ||
      (table.type !== 'TABLE' && table.type !== 'VIEW') ||
      typeof table.columnCount !== 'number'
    ) {
      throw new Error('The AWS database returned invalid table metadata.');
    }
    return {
      catalog: table.catalog,
      schema: table.schema,
      name: table.name,
      type: table.type,
      columnCount: table.columnCount,
    };
  });

  return {
    connected: true,
    engine: value.engine,
    provider: value.provider,
    namespace: value.namespace,
    connectionName: value.connectionName,
    catalogName: value.catalogName,
    tables,
  };
}

async function responseError(response: Response): Promise<string> {
  const body: unknown = await response
    .clone()
    .json()
    .catch(() => null);
  if (isRecord(body) && typeof body.error === 'string') {
    const code = typeof body.code === 'string' ? ` (${body.code})` : '';
    return `${body.error}${code}`;
  }
  return 'Unable to connect to the AWS database.';
}

export function FederatedSourceSetup({
  value,
  sqliteValue,
  onChange,
  onSqliteChange,
  onEngineChange,
}: {
  value: string;
  sqliteValue: SqliteSourceSelection | null;
  onChange: (value: string) => void;
  onSqliteChange: (value: SqliteSourceSelection | null) => void;
  onEngineChange: (engine: SourceEngine) => void;
}) {
  const [engine, setEngine] = useState<SourceEngine>('mysql');
  const [forms, setForms] = useState(INITIAL_FORMS);
  const [showPassword, setShowPassword] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connection, setConnection] = useState<FederatedOnboardingResult | null>(null);
  const [sqliteFile, setSqliteFile] = useState<File | null>(null);
  const [sqliteTables, setSqliteTables] = useState<SqliteTable[]>([]);
  const [readingSqlite, setReadingSqlite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configuredMysqlLoadStarted = useRef(false);

  const form = isFederatedEngine(engine) ? forms[engine] : null;
  const valid = useMemo(
    () =>
      form !== null &&
      /\.rds\.amazonaws\.com$/i.test(form.host.trim()) &&
      Number.isInteger(Number(form.port)) &&
      Number(form.port) >= 1 &&
      Number(form.port) <= 65_535 &&
      /^[A-Za-z_][A-Za-z0-9_$#.-]{0,127}$/.test(form.namespace.trim()) &&
      form.user.trim().length > 0 &&
      form.password.length > 0,
    [form]
  );

  const selectedTable = connection?.tables.find((table) => `${table.catalog}.${table.schema}.${table.name}` === value);

  const resetConnection = () => {
    setConnection(null);
    setError(null);
    onChange('');
  };

  const update = (key: keyof FederatedForm, next: string) => {
    if (!isFederatedEngine(engine)) return;
    setForms((current) => ({ ...current, [engine]: { ...current[engine], [key]: next } }));
    resetConnection();
  };

  const selectEngine = (next: string) => {
    if (!isSourceEngine(next)) return;
    setEngine(next);
    setShowPassword(false);
    resetConnection();
    setSqliteFile(null);
    setSqliteTables([]);
    onSqliteChange(null);
    onEngineChange(next);
  };

  const inspectSqlite = async (file: File | null) => {
    setError(null);
    setSqliteFile(file);
    setSqliteTables([]);
    onSqliteChange(null);
    if (!file) return;
    if (!/\.(db|sqlite|sqlite3)$/i.test(file.name)) {
      setError('Choose a SQLite file ending in .db, .sqlite, or .sqlite3.');
      return;
    }
    if (file.size > MAX_SQLITE_BROWSER_SIZE) {
      setError('SQLite files inspected in the browser must be 100 MB or smaller.');
      return;
    }

    setReadingSqlite(true);
    try {
      const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });
      const database = new SQL.Database(new Uint8Array(await file.arrayBuffer()));
      try {
        const result = database.exec(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )[0];
        const tableNames = (result?.values ?? [])
          .map((row) => row[0])
          .filter((name): name is string => typeof name === 'string');
        const tables = tableNames.map((name) => {
          const escapedName = name.replace(/"/g, '""');
          const columns = database.exec(`PRAGMA table_info("${escapedName}")`)[0];
          return { name, columnCount: columns?.values.length ?? 0 };
        });
        setSqliteTables(tables);
        if (tables.length === 0) setError('The SQLite file does not contain any user tables.');
      } finally {
        database.close();
      }
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to read the SQLite file.');
    } finally {
      setReadingSqlite(false);
    }
  };

  const connect = async () => {
    setError(null);
    if (!form || !isFederatedEngine(engine) || !valid) {
      setError('Enter a valid AWS RDS endpoint, port, database or service, username, and password.');
      return;
    }

    setConnecting(true);
    try {
      const body =
        engine === 'oracle'
          ? {
              engine,
              host: form.host.trim(),
              port: Number(form.port),
              serviceName: form.namespace.trim(),
              user: form.user.trim(),
              password: form.password,
              encryptionProtocol: 'NATIVE_NETWORK_ENCRYPTION',
            }
          : {
              engine,
              host: form.host.trim(),
              port: Number(form.port),
              database: form.namespace.trim(),
              user: form.user.trim(),
              password: form.password,
              ssl: true,
            };
      const response = await fetch('/api/source/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(await responseError(response));

      const result = parseResult(await response.json());
      setConnection(result);
      setForms((current) => ({ ...current, [engine]: { ...current[engine], password: '' } }));
      setShowPassword(false);
      onChange('');
    } catch (reason: unknown) {
      setConnection(null);
      setError(reason instanceof Error ? reason.message : 'Unable to connect to the AWS database.');
    } finally {
      setConnecting(false);
    }
  };

  const loadConfiguredSource = useCallback(
    async (sourceEngine: ConfiguredFederatedEngine) => {
      setConnecting(true);
      setError(null);
      try {
        const response = await fetch(`/api/source/${sourceEngine}/refresh`, { method: 'POST' });
        if (!response.ok) throw new Error(await responseError(response));
        const result = parseResult(await response.json());
        setEngine(sourceEngine);
        setConnection(result);
        onChange('');
        onEngineChange(sourceEngine);
      } catch (reason: unknown) {
        setConnection(null);
        setError(
          reason instanceof Error
            ? reason.message
            : `Unable to refresh the configured AWS ${sourceEngine === 'mysql' ? 'MySQL' : 'PostgreSQL'} source.`
        );
      } finally {
        setConnecting(false);
      }
    },
    [onChange, onEngineChange]
  );

  useEffect(() => {
    if (configuredMysqlLoadStarted.current) return;
    configuredMysqlLoadStarted.current = true;
    void loadConfiguredSource('mysql');
  }, [loadConfiguredSource]);

  const selectTable = (fullName: string) => onChange(fullName);

  return (
    <div className="dataone-aws-mysql-setup">
      <div className="dataone-aws-heading">
        <strong>Connect source database</strong>
      </div>

      <div>
        <Label htmlFor="source-database-engine">Source database type</Label>
        <Select value={engine} onValueChange={selectEngine}>
          <SelectTrigger id="source-database-engine" aria-label="Source database type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ENGINE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label} · {option.detail}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {engine === 'sqlite' && (
        <>
          <Alert className="dataone-inline-alert">
            <FileArchive aria-hidden="true" />
            <AlertTitle>Local SQLite → Unity Catalog Volume</AlertTitle>
            <AlertDescription>
              DataOne inspects the local file in your browser, uploads it to the bound Unity Catalog Volume, and sends
              only the selected table name to the Databricks Job. SQLite has no host, port, username, or password.
            </AlertDescription>
          </Alert>

          <div>
            <Label htmlFor="sqlite-source-file">SQLite database file</Label>
            <Input
              id="sqlite-source-file"
              type="file"
              accept=".db,.sqlite,.sqlite3,application/vnd.sqlite3,application/x-sqlite3"
              disabled={readingSqlite}
              onChange={(event) => void inspectSqlite(event.target.files?.[0] ?? null)}
            />
            <small>The file stays local until you start the governed workflow.</small>
          </div>

          {readingSqlite && (
            <div className="dataone-demo-connections-loading">
              <Loader2 className="dataone-spin" aria-hidden="true" /> Reading SQLite schema…
            </div>
          )}

          {sqliteTables.length > 0 && (
            <>
              <div>
                <Label htmlFor="sqlite-source-table">SQLite table</Label>
                <Select
                  value={sqliteValue?.table}
                  onValueChange={(tableName) => {
                    const table = sqliteTables.find((candidate) => candidate.name === tableName);
                    if (!table || !sqliteFile) return;
                    onChange('');
                    onSqliteChange({ file: sqliteFile, table: table.name, columnCount: table.columnCount });
                  }}
                >
                  <SelectTrigger id="sqlite-source-table" aria-label="SQLite source table">
                    <SelectValue placeholder="Select a table" />
                  </SelectTrigger>
                  <SelectContent>
                    {sqliteTables.map((table) => (
                      <SelectItem key={table.name} value={table.name} disabled={!SQLITE_TABLE_NAME.test(table.name)}>
                        {table.name} · {table.columnCount} columns
                        {!SQLITE_TABLE_NAME.test(table.name) ? ' · unsupported name' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="dataone-aws-table-list" aria-label="Tables available in the local SQLite database">
                {sqliteTables.map((table) => {
                  const compatible = SQLITE_TABLE_NAME.test(table.name);
                  return (
                    <button
                      type="button"
                      key={table.name}
                      className={sqliteValue?.table === table.name ? 'is-selected' : undefined}
                      disabled={!compatible}
                      onClick={() => {
                        if (!sqliteFile) return;
                        onChange('');
                        onSqliteChange({ file: sqliteFile, table: table.name, columnCount: table.columnCount });
                      }}
                    >
                      <Database aria-hidden="true" />
                      <span>
                        <strong>{table.name}</strong>
                        <small>
                          {table.columnCount} columns{!compatible ? ' · unsupported name' : ''}
                        </small>
                      </span>
                      {sqliteValue?.table === table.name && <CheckCircle2 aria-label="Selected" />}
                    </button>
                  );
                })}
              </div>

              {sqliteValue && (
                <div className="dataone-selected-dataset">
                  <span>Selected local SQLite dataset</span>
                  <strong>{sqliteValue.table}</strong>
                  <small>
                    {sqliteValue.file.name} · {sqliteValue.columnCount} columns · uploaded to the governed Volume at run
                    time
                  </small>
                </div>
              )}
            </>
          )}
        </>
      )}

      {form && isFederatedEngine(engine) && (
        <>
          <Alert className="dataone-inline-alert">
            <LockKeyhole aria-hidden="true" />
            <AlertTitle>Connection administrator required</AlertTitle>
            <AlertDescription>
              Databricks creates the Unity Catalog connection and foreign catalog as the signed-in administrator. The
              user needs CREATE CONNECTION and CREATE CATALOG privileges.
            </AlertDescription>
          </Alert>

          <div className="dataone-aws-fields dataone-aws-fields--endpoint">
            <div>
              <Label htmlFor="aws-source-host">RDS endpoint</Label>
              <Input
                id="aws-source-host"
                value={form.host}
                onChange={(event) => update('host', event.target.value)}
                placeholder="database.abc123.eu-north-1.rds.amazonaws.com"
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div>
              <Label htmlFor="aws-source-port">Port</Label>
              <Input
                id="aws-source-port"
                value={form.port}
                onChange={(event) => update('port', event.target.value)}
                inputMode="numeric"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="dataone-aws-fields">
            <div>
              <Label htmlFor="aws-source-namespace">{engine === 'oracle' ? 'Service name' : 'Database name'}</Label>
              <Input
                id="aws-source-namespace"
                value={form.namespace}
                onChange={(event) => update('namespace', event.target.value)}
                placeholder={engine === 'oracle' ? 'ORCLPDB1' : 'dataone_source'}
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div>
              <Label htmlFor="aws-source-user">Username</Label>
              <Input
                id="aws-source-user"
                value={form.user}
                onChange={(event) => update('user', event.target.value)}
                placeholder="dataone_reader"
                autoCapitalize="none"
                autoComplete="username"
                spellCheck={false}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="aws-source-password">Password</Label>
            <div className="dataone-aws-password">
              <Input
                id="aws-source-password"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(event) => update('password', event.target.value)}
                placeholder={connection ? 'Re-enter to reconnect' : 'Enter the database password'}
                autoComplete="new-password"
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={showPassword ? 'Hide database password' : 'Show database password'}
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              </Button>
            </div>
          </div>

          <Button type="button" variant="secondary" disabled={connecting || !valid} onClick={() => void connect()}>
            {connecting ? <Loader2 className="dataone-spin" aria-hidden="true" /> : <Server aria-hidden="true" />}
            {connecting ? 'Connecting and discovering…' : 'Connect & list tables'}
          </Button>
          {(engine === 'mysql' || engine === 'postgresql') && (
            <Button
              type="button"
              variant="outline"
              disabled={connecting}
              onClick={() => void loadConfiguredSource(engine)}
            >
              {connecting ? <Loader2 className="dataone-spin" aria-hidden="true" /> : <Database aria-hidden="true" />}
              Refresh configured AWS {engine === 'mysql' ? 'MySQL' : 'PostgreSQL'} tables
            </Button>
          )}
        </>
      )}

      {error && (
        <Alert variant="destructive" className="dataone-inline-alert">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>
            {engine === 'sqlite' ? 'SQLite file could not be opened' : 'AWS database connection failed'}
          </AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {connection && (
        <>
          <Alert className="dataone-inline-alert">
            <CheckCircle2 aria-hidden="true" />
            <AlertTitle>Connected through Lakehouse Federation</AlertTitle>
            <AlertDescription>
              Found {connection.tables.length.toLocaleString()} tables and views. Select the dataset DataOne should
              transform.
            </AlertDescription>
          </Alert>

          {connection.tables.length === 0 ? (
            <Empty className="dataone-demo-connections-empty">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Database aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>No tables found</EmptyTitle>
                <EmptyDescription>
                  The connection was registered, but the database user cannot see any supported tables.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <div>
                <Label htmlFor="aws-source-table">Table or view</Label>
                <Select
                  value={
                    selectedTable ? `${selectedTable.catalog}.${selectedTable.schema}.${selectedTable.name}` : undefined
                  }
                  onValueChange={selectTable}
                >
                  <SelectTrigger id="aws-source-table" aria-label="AWS source table">
                    <SelectValue placeholder="Select a table" />
                  </SelectTrigger>
                  <SelectContent>
                    {connection.tables.map((table) => {
                      const fullName = `${table.catalog}.${table.schema}.${table.name}`;
                      const compatible = [table.catalog, table.schema, table.name].every(
                        isPipelineCompatibleIdentifier
                      );
                      return (
                        <SelectItem key={fullName} value={fullName} disabled={!compatible}>
                          {table.schema}.{table.name} · {table.columnCount} columns · {table.type}
                          {!compatible ? ' · unsupported name' : ''}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="dataone-aws-table-list" aria-label="Tables available in the AWS source database">
                {connection.tables.map((table) => {
                  const fullName = `${table.catalog}.${table.schema}.${table.name}`;
                  const compatible = [table.catalog, table.schema, table.name].every(isPipelineCompatibleIdentifier);
                  return (
                    <button
                      type="button"
                      key={fullName}
                      className={value === fullName ? 'is-selected' : undefined}
                      disabled={!compatible}
                      onClick={() => selectTable(fullName)}
                    >
                      <Database aria-hidden="true" />
                      <span>
                        <strong>
                          {table.schema}.{table.name}
                        </strong>
                        <small>
                          {table.columnCount} columns · {table.type}
                          {!compatible ? ' · unsupported name' : ''}
                        </small>
                      </span>
                      {value === fullName && <CheckCircle2 aria-label="Selected" />}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div className="dataone-selected-dataset">
            <span>Governed Unity Catalog connection</span>
            <strong>{connection.connectionName}</strong>
            <small>
              Foreign catalog: {connection.catalogName} · Source: {connection.provider} · Namespace:{' '}
              {connection.namespace}
            </small>
          </div>
        </>
      )}
    </div>
  );
}
