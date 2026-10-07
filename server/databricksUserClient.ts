import { WorkspaceClient } from '@databricks/sdk-experimental';

interface ForwardedTokenRequest {
  header(name: string): string | undefined;
}

export class DatabricksUserAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabricksUserAuthorizationError';
  }
}

/**
 * Build a workspace client that acts as the signed-in Databricks user.
 *
 * This client is intentionally used only for administrator-owned Unity Catalog
 * setup. Normal DataOne queries, Genie requests, file operations, and Job runs
 * continue to use AppKit resource bindings and the app service principal.
 */
export function createForwardedUserWorkspaceClient(request: ForwardedTokenRequest): WorkspaceClient {
  const token = request.header('x-forwarded-access-token')?.trim();
  if (!token) {
    const localProfile = process.env.DATABRICKS_CONFIG_PROFILE?.trim();
    if (process.env.NODE_ENV !== 'production' && localProfile) {
      return new WorkspaceClient({ profile: localProfile });
    }
    throw new DatabricksUserAuthorizationError(
      'Databricks user authorization is required to create the Unity Catalog connection and foreign catalog.'
    );
  }

  const host = process.env.DATABRICKS_HOST?.trim();
  if (!host) {
    throw new DatabricksUserAuthorizationError('The Databricks workspace host is unavailable to the app backend.');
  }

  return new WorkspaceClient({ host, token });
}
