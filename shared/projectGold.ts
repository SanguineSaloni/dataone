export const PROJECT_GOLD_CATALOG = 'workspace';
export const PROJECT_GOLD_SCHEMA = 'dataone_gold';

export function projectGoldTableLeaf(projectName: string): string {
  const normalized = projectName
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const withSafePrefix = /^[0-9]/.test(normalized) ? `project_${normalized}` : normalized;
  return (withSafePrefix || 'dataone_project').slice(0, 120).replace(/_+$/g, '');
}

export function projectGoldTableName(projectName: string): string {
  return `${PROJECT_GOLD_CATALOG}.${PROJECT_GOLD_SCHEMA}.${projectGoldTableLeaf(projectName)}`;
}

export function projectPostgresTableLeaf(projectName: string): string {
  return projectGoldTableLeaf(projectName).slice(0, 63).replace(/_+$/g, '');
}
