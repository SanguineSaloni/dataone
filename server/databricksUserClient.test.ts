import { afterEach, describe, expect, it } from 'vitest';

import { createForwardedUserWorkspaceClient, DatabricksUserAuthorizationError } from './databricksUserClient.js';

const originalHost = process.env.DATABRICKS_HOST;
const originalNodeEnv = process.env.NODE_ENV;
const originalProfile = process.env.DATABRICKS_CONFIG_PROFILE;

afterEach(() => {
  if (originalHost === undefined) delete process.env.DATABRICKS_HOST;
  else process.env.DATABRICKS_HOST = originalHost;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalProfile === undefined) delete process.env.DATABRICKS_CONFIG_PROFILE;
  else process.env.DATABRICKS_CONFIG_PROFILE = originalProfile;
});

describe('Databricks forwarded-user workspace client', () => {
  it('requires the forwarded user access token', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABRICKS_HOST = 'https://workspace.example.com';

    expect(() => createForwardedUserWorkspaceClient({ header: () => undefined })).toThrow(
      DatabricksUserAuthorizationError
    );
  });

  it('uses the configured CLI profile only during local development', () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABRICKS_CONFIG_PROFILE = 'local-profile';

    const client = createForwardedUserWorkspaceClient({ header: () => undefined });

    expect(client.config.profile).toBe('local-profile');
  });

  it('requires the workspace host', () => {
    delete process.env.DATABRICKS_HOST;

    expect(() =>
      createForwardedUserWorkspaceClient({
        header: (name) => (name === 'x-forwarded-access-token' ? 'forwarded-token' : undefined),
      })
    ).toThrow('workspace host is unavailable');
  });

  it('creates a user-scoped client without exposing the token', () => {
    process.env.DATABRICKS_HOST = 'https://workspace.example.com';
    const client = createForwardedUserWorkspaceClient({
      header: (name) => (name === 'x-forwarded-access-token' ? 'forwarded-token' : undefined),
    });

    expect(client.config.host).toBe('https://workspace.example.com');
  });
});
