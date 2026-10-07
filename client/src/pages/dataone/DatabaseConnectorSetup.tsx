import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@databricks/appkit-ui/react';
import { CheckCircle2, CircleAlert, Database, Eye, EyeOff, Loader2, LockKeyhole } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  connectorForEngine,
  DATABASE_ENGINE_OPTIONS,
  databaseConnectorLabel,
  databaseEngineLabel,
  type DatabaseConnectorConfig,
  type DatabaseConnectorRole,
  isDatabaseEngine,
  validateDatabaseConnector,
} from './databaseConnectorModel.js';

interface DatabaseConnectorSetupProps {
  role: DatabaseConnectorRole;
  value: DatabaseConnectorConfig;
  onChange: (value: DatabaseConnectorConfig) => void;
  onTestConnection?: (value: DatabaseConnectorConfig) => Promise<DatabaseConnectionTestResult>;
  tableReadOnly?: boolean;
}

export interface DatabaseConnectionTestResult {
  rowCount: number;
  columns: string[];
  table: string;
  tableExists: boolean;
}

export function DatabaseConnectorSetup({
  role,
  value,
  onChange,
  onTestConnection,
  tableReadOnly = false,
}: DatabaseConnectorSetupProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<DatabaseConnectionTestResult | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const validation = useMemo(() => validateDatabaseConnector(value), [value]);
  const title = role === 'source' ? 'Source Database' : 'Target Database';
  const engineLabel = databaseEngineLabel(value.engine);

  const update = <Key extends keyof DatabaseConnectorConfig>(key: Key, nextValue: DatabaseConnectorConfig[Key]) => {
    setValidationAttempted(false);
    setConnectionResult(null);
    setConnectionError(null);
    onChange({ ...value, [key]: nextValue });
  };

  const validateOrTest = async () => {
    setValidationAttempted(true);
    setConnectionResult(null);
    setConnectionError(null);
    if (!validation.valid || !onTestConnection) return;

    setTestingConnection(true);
    try {
      setConnectionResult(await onTestConnection(value));
    } catch (error: unknown) {
      setConnectionError(error instanceof Error ? error.message : 'Unable to test the database connection.');
    } finally {
      setTestingConnection(false);
    }
  };

  const networkDatabase = value.engine === 'mysql' || value.engine === 'postgresql' || value.engine === 'oracle';
  const credentialDatabase = networkDatabase;

  return (
    <section className="dataone-database-connector" aria-label={`${title} configuration`}>
      <header className="dataone-database-connector-heading">
        <div>
          <span className="dataone-database-connector-icon">
            <Database aria-hidden="true" />
          </span>
          <span>
            <strong>{title}</strong>
            <small>{role === 'source' ? 'Read table or query' : 'Write transformed records'}</small>
          </span>
        </div>
        <Badge variant={validation.valid ? 'secondary' : 'outline'}>
          {validation.valid ? 'Configuration ready' : 'Needs details'}
        </Badge>
      </header>

      <div className="dataone-database-field dataone-database-field--wide">
        <Label htmlFor={`${role}-database-engine`}>Database type</Label>
        <Select
          value={value.engine}
          onValueChange={(engine) => {
            if (!isDatabaseEngine(engine)) return;
            setValidationAttempted(false);
            setShowPassword(false);
            setConnectionResult(null);
            setConnectionError(null);
            onChange(connectorForEngine(engine, role));
          }}
        >
          <SelectTrigger id={`${role}-database-engine`} aria-label={`${title} type`}>
            <SelectValue placeholder="Select a database" />
          </SelectTrigger>
          <SelectContent>
            {DATABASE_ENGINE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {networkDatabase && (
        <div className="dataone-database-fields">
          <div className="dataone-database-field dataone-database-field--host">
            <Label htmlFor={`${role}-database-host`}>Host</Label>
            <Input
              id={`${role}-database-host`}
              value={value.host}
              onChange={(event) => update('host', event.target.value)}
              placeholder="database.company.internal"
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="dataone-database-field dataone-database-field--port">
            <Label htmlFor={`${role}-database-port`}>Port</Label>
            <Input
              id={`${role}-database-port`}
              value={value.port}
              onChange={(event) => update('port', event.target.value)}
              inputMode="numeric"
              placeholder="3306"
              autoComplete="off"
            />
          </div>
          <div className="dataone-database-field">
            <Label htmlFor={`${role}-database-name`}>
              {value.engine === 'oracle' ? 'Service name' : 'Database name'}
            </Label>
            <Input
              id={`${role}-database-name`}
              value={value.engine === 'oracle' ? value.serviceName : value.database}
              onChange={(event) =>
                value.engine === 'oracle'
                  ? update('serviceName', event.target.value)
                  : update('database', event.target.value)
              }
              placeholder={value.engine === 'oracle' ? 'ORCLPDB1' : 'mydb'}
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          {value.engine !== 'mysql' && (
            <div className="dataone-database-field">
              <Label htmlFor={`${role}-database-schema`}>Schema</Label>
              <Input
                id={`${role}-database-schema`}
                value={value.schema}
                onChange={(event) => update('schema', event.target.value)}
                placeholder={value.engine === 'oracle' ? 'DATAONE' : 'public'}
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          )}
        </div>
      )}

      {value.engine === 'databricks' && (
        <div className="dataone-database-fields dataone-database-fields--three">
          <div className="dataone-database-field">
            <Label htmlFor={`${role}-database-catalog`}>Catalog</Label>
            <Input
              id={`${role}-database-catalog`}
              value={value.catalog}
              onChange={(event) => update('catalog', event.target.value)}
              placeholder="workspace"
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="dataone-database-field">
            <Label htmlFor={`${role}-database-schema`}>Schema</Label>
            <Input
              id={`${role}-database-schema`}
              value={value.schema}
              onChange={(event) => update('schema', event.target.value)}
              placeholder="default"
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="dataone-database-field">
            <Label htmlFor={`${role}-database-table`}>Table</Label>
            <Input
              id={`${role}-database-table`}
              value={value.table}
              onChange={(event) => update('table', event.target.value)}
              placeholder="customers"
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>
      )}

      {value.engine === 'sqlite' && (
        <div className="dataone-database-fields">
          <div className="dataone-database-field dataone-database-field--host">
            <Label htmlFor={`${role}-sqlite-path`}>SQLite file path</Label>
            <Input
              id={`${role}-sqlite-path`}
              value={value.filePath}
              onChange={(event) => update('filePath', event.target.value)}
              placeholder="/Volumes/catalog/schema/volume/source.sqlite"
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="dataone-database-field">
            <Label htmlFor={`${role}-sqlite-table`}>Table</Label>
            <Input
              id={`${role}-sqlite-table`}
              value={value.table}
              onChange={(event) => update('table', event.target.value)}
              placeholder="customers"
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>
      )}

      {networkDatabase && (
        <div className="dataone-database-field dataone-database-field--wide">
          <Label htmlFor={`${role}-database-table`}>Table</Label>
          <Input
            id={`${role}-database-table`}
            value={value.table}
            onChange={(event) => update('table', event.target.value)}
            placeholder={role === 'source' ? 'customers' : 'customers_gold'}
            readOnly={tableReadOnly}
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
          />
          {tableReadOnly && <small>Derived from the DataOne project name.</small>}
        </div>
      )}

      {credentialDatabase && (
        <>
          <div className="dataone-database-field dataone-database-field--wide">
            <Label htmlFor={`${role}-connection-alias`}>Unity Catalog connection alias</Label>
            <Input
              id={`${role}-connection-alias`}
              value={value.connectionAlias}
              onChange={(event) => update('connectionAlias', event.target.value)}
              placeholder={`dataone-${role}-connection`}
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
            />
            <small>Production uses this governed alias so raw credentials never enter a Job parameter.</small>
          </div>

          <div className="dataone-database-fields">
            <div className="dataone-database-field">
              <Label htmlFor={`${role}-database-user`}>Username</Label>
              <Input
                id={`${role}-database-user`}
                value={value.user}
                onChange={(event) => update('user', event.target.value)}
                placeholder="dataone_reader"
                autoCapitalize="none"
                autoComplete="username"
                spellCheck={false}
              />
            </div>
            <div className="dataone-database-field">
              <Label htmlFor={`${role}-database-password`}>Password</Label>
              <div className="dataone-password-field">
                <Input
                  id={`${role}-database-password`}
                  type={showPassword ? 'text' : 'password'}
                  value={value.password}
                  onChange={(event) => update('password', event.target.value)}
                  placeholder="Optional in this local demo"
                  autoComplete="new-password"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`${showPassword ? 'Hide' : 'Show'} ${role} password`}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </Button>
              </div>
            </div>
          </div>

          {networkDatabase && (
            <label className="dataone-database-checkbox">
              <input type="checkbox" checked={value.ssl} onChange={(event) => update('ssl', event.target.checked)} />
              <span>Require SSL/TLS</span>
            </label>
          )}
        </>
      )}

      {networkDatabase && value.host.trim().toLowerCase() === 'localhost' && (
        <p className="dataone-database-localhost-note">
          <CircleAlert aria-hidden="true" /> `localhost` works only when the database runs beside this local backend. A
          deployed Databricks App needs a reachable DNS name or private address.
        </p>
      )}

      <div className="dataone-database-summary">
        <span>Configuration preview</span>
        <code>{databaseConnectorLabel(value)}</code>
      </div>

      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={testingConnection}
        onClick={() => void validateOrTest()}
      >
        {testingConnection ? (
          <Loader2 className="dataone-spin" aria-hidden="true" />
        ) : (
          <CheckCircle2 aria-hidden="true" />
        )}{' '}
        {onTestConnection ? `Test live ${engineLabel} connection` : 'Validate configuration'}
      </Button>

      {validationAttempted && validation.valid && !onTestConnection && (
        <Alert className="dataone-database-validation">
          <CheckCircle2 aria-hidden="true" />
          <AlertTitle>Configuration fields are valid</AlertTitle>
          <AlertDescription>
            No live database was contacted. The local demo will simulate the run without sending the password.
          </AlertDescription>
        </Alert>
      )}

      {connectionResult && (
        <Alert className="dataone-database-validation">
          <CheckCircle2 aria-hidden="true" />
          <AlertTitle>Connected to live local {engineLabel}</AlertTitle>
          <AlertDescription>
            {connectionResult.tableExists
              ? `Found ${connectionResult.rowCount.toLocaleString()} rows and ${connectionResult.columns.length} columns in ${connectionResult.table}: ${connectionResult.columns.join(', ')}.`
              : `${connectionResult.table} does not exist yet. DataOne will create it after transformation and verify the stored row count.`}
          </AlertDescription>
        </Alert>
      )}

      {connectionError && (
        <Alert variant="destructive" className="dataone-database-validation">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>{engineLabel} connection failed</AlertTitle>
          <AlertDescription>{connectionError}</AlertDescription>
        </Alert>
      )}

      {validationAttempted && !validation.valid && (
        <Alert variant="destructive" className="dataone-database-validation">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Complete the required fields</AlertTitle>
          <AlertDescription>
            <ul>
              {validation.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <p className="dataone-database-secret-note">
        <LockKeyhole aria-hidden="true" />{' '}
        {onTestConnection
          ? 'The password is sent only to this localhost backend for the connection attempt. It is never returned, logged, or stored.'
          : 'Passwords remain in page memory only and are not included in simulated requests, labels, logs, or results.'}
      </p>
    </section>
  );
}
