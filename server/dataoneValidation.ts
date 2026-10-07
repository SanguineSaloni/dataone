import type { FilePolicy } from '@databricks/appkit';
import { z } from 'zod';
import { projectGoldTableLeaf } from '../shared/projectGold.js';

export const MAX_UPLOAD_SIZE = 500 * 1024 * 1024;

const SAFE_STRUCTURED_UPLOAD_PATH = /^(csv|json|parquet)\/[A-Za-z0-9._/-]+\.\1$/i;
const SAFE_SQLITE_UPLOAD_PATH = /^sqlite\/[A-Za-z0-9._/-]+\.(db|sqlite|sqlite3)$/i;
const DYNAMIC_FEDERATED_CATALOG = /^dataone_(mysql|postgresql|oracle)_[a-z0-9_]+_[a-f0-9]{10}$/;

export const uploadPolicy: FilePolicy = (action, resource, user) => {
  if (action === 'delete') return false;
  if (action === 'upload') {
    const isAuthenticatedUser = user.isServicePrincipal !== true;
    const isLocalDevelopment = process.env.NODE_ENV === 'development';
    return (
      (isAuthenticatedUser || isLocalDevelopment) &&
      (SAFE_STRUCTURED_UPLOAD_PATH.test(resource.path) || SAFE_SQLITE_UPLOAD_PATH.test(resource.path)) &&
      !resource.path.includes('..') &&
      (resource.size ?? 0) <= MAX_UPLOAD_SIZE
    );
  }
  if (action === 'mkdir') {
    return user.isServicePrincipal !== true || process.env.NODE_ENV === 'development';
  }
  return true;
};

export const jobParameters = z
  .object({
    project_name: z.string().trim().min(3).max(120),
    run_id: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/),
    source_mode: z.enum(['volume_file', 'uc_table']),
    source_path: z.string().max(500),
    source_format: z.enum(['csv', 'json', 'parquet', 'sqlite']),
    json_mode: z.enum(['lines', 'multiline']),
    source_table: z.string().max(500),
    output_table: z.string().regex(/^[a-z][a-z0-9_]{0,119}$/),
    target_engine: z.enum(['postgresql', 'mysql']),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.source_mode === 'volume_file') {
      const normalizedPath = value.source_path.toLowerCase();
      const isSqlite = value.source_format === 'sqlite';
      const hasExpectedExtension = isSqlite
        ? /\.(db|sqlite|sqlite3)$/.test(normalizedPath)
        : normalizedPath.endsWith(`.${value.source_format}`);
      if (
        !normalizedPath.startsWith(`${value.source_format}/`) ||
        !hasExpectedExtension ||
        normalizedPath.includes('..')
      ) {
        context.addIssue({
          code: 'custom',
          message: 'The uploaded file path must stay inside its matching format folder.',
          path: ['source_path'],
        });
      }
      if (isSqlite && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(value.source_table)) {
        context.addIssue({
          code: 'custom',
          message: 'The SQLite source table must use a safe identifier.',
          path: ['source_table'],
        });
      }
    }
    if (value.source_mode === 'uc_table') {
      if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.source_table)) {
        context.addIssue({
          code: 'custom',
          message: 'The Unity Catalog source must use catalog.schema.table.',
          path: ['source_table'],
        });
      }

      const sourceCatalog = process.env.DATAONE_SOURCE_FOREIGN_CATALOG?.trim();
      const sourceSchema = process.env.DATAONE_SOURCE_DEFAULT_SCHEMA?.trim();
      const [requestedCatalog] = value.source_table.split('.');
      const hasConfiguredBoundary = Boolean(sourceCatalog && sourceSchema);
      const isConfiguredSource =
        hasConfiguredBoundary && value.source_table.startsWith(`${sourceCatalog}.${sourceSchema}.`);
      const isOnboardedFederatedSource = DYNAMIC_FEDERATED_CATALOG.test(requestedCatalog ?? '');
      if (hasConfiguredBoundary && !isConfiguredSource && !isOnboardedFederatedSource) {
        context.addIssue({
          code: 'custom',
          message: 'The table must belong to a configured or DataOne-onboarded AWS foreign catalog.',
          path: ['source_table'],
        });
      }
    }
    if (value.output_table !== projectGoldTableLeaf(value.project_name)) {
      context.addIssue({
        code: 'custom',
        message: 'The Gold table name must be derived from the project name.',
        path: ['output_table'],
      });
    }
  });
