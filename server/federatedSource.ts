import { createHash } from 'node:crypto';
import { z } from 'zod';

const AWS_RDS_HOST = /^(?=.{1,253}$)[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.rds\.amazonaws\.com$/i;
const EXTERNAL_NAMESPACE = /^[A-Za-z_][A-Za-z0-9_$#.-]{0,127}$/;

const commonAwsSourceFields = {
  host: z.string().trim().max(253).regex(AWS_RDS_HOST, 'Enter a valid AWS RDS endpoint.'),
  port: z.coerce.number().int().min(1).max(65_535),
  user: z.string().trim().min(1).max(128),
  password: z.string().min(1).max(512),
} as const;

const mysqlSourceInput = z
  .object({
    engine: z.literal('mysql'),
    ...commonAwsSourceFields,
    database: z.string().trim().regex(EXTERNAL_NAMESPACE, 'Enter a valid MySQL database name.'),
    ssl: z.literal(true),
  })
  .strict();

const postgresqlSourceInput = z
  .object({
    engine: z.literal('postgresql'),
    ...commonAwsSourceFields,
    database: z.string().trim().regex(EXTERNAL_NAMESPACE, 'Enter a valid PostgreSQL database name.'),
    ssl: z.literal(true),
  })
  .strict();

const oracleSourceInput = z
  .object({
    engine: z.literal('oracle'),
    ...commonAwsSourceFields,
    serviceName: z.string().trim().regex(EXTERNAL_NAMESPACE, 'Enter a valid Oracle service name.'),
    encryptionProtocol: z.literal('NATIVE_NETWORK_ENCRYPTION'),
  })
  .strict();

export const federatedSourceInput = z.discriminatedUnion('engine', [
  mysqlSourceInput,
  postgresqlSourceInput,
  oracleSourceInput,
]);

export type FederatedSourceInput = z.infer<typeof federatedSourceInput>;
export type UnityCatalogConnectionType = 'MYSQL' | 'POSTGRESQL' | 'ORACLE';

interface ExistingUnityCatalogConnection {
  connectionType?: string;
  options?: Record<string, string>;
}

export interface GovernedFederatedSourceNames {
  connectionName: string;
  catalogName: string;
}

function slug(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized.slice(0, 32) || 'database';
}

export function federatedSourceNamespace(input: FederatedSourceInput): string {
  return input.engine === 'oracle' ? input.serviceName : input.database;
}

export function governedFederatedSourceNames(input: FederatedSourceInput): GovernedFederatedSourceNames {
  const namespace = federatedSourceNamespace(input);
  const fingerprint = createHash('sha256')
    .update(`${input.engine}|${input.host.toLowerCase()}|${input.port}|${namespace.toLowerCase()}|${input.user}`)
    .digest('hex')
    .slice(0, 10);
  const prefix = `dataone_${input.engine}`;
  const suffix = `${slug(namespace)}_${fingerprint}`;
  return {
    connectionName: `${prefix}_${suffix}`,
    catalogName: `${prefix}_${suffix}`,
  };
}

export function unityCatalogConnectionType(input: FederatedSourceInput): UnityCatalogConnectionType {
  return input.engine.toUpperCase() as UnityCatalogConnectionType;
}

/**
 * Match only the non-secret fields returned by the Unity Catalog Connections API.
 * Databricks intentionally redacts credential fields such as `user` and `password`
 * when an existing connection is read back.
 */
export function matchesExistingFederatedConnection(
  input: FederatedSourceInput,
  existing: ExistingUnityCatalogConnection
): boolean {
  return (
    existing.connectionType === unityCatalogConnectionType(input) &&
    existing.options?.host?.toLowerCase() === input.host.toLowerCase() &&
    existing.options?.port === String(input.port)
  );
}

export function federatedConnectionOptions(input: FederatedSourceInput): Record<string, string> {
  const options: Record<string, string> = {
    host: input.host,
    port: String(input.port),
    user: input.user,
    password: input.password,
  };
  if (input.engine === 'oracle') options.encryption_protocol = input.encryptionProtocol;
  return options;
}

export function federatedCatalogOptions(input: FederatedSourceInput): Record<string, string> | undefined {
  if (input.engine === 'postgresql') return { database: input.database };
  if (input.engine === 'oracle') return { service_name: input.serviceName };
  return undefined;
}

export function federatedSourceProvider(input: FederatedSourceInput): string {
  if (input.engine === 'mysql') return 'AWS RDS MySQL';
  if (input.engine === 'postgresql') return 'AWS RDS PostgreSQL';
  return 'AWS RDS Oracle';
}
