import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { handleWhoAmI } from './databricksIdentity.js';

const originalNodeEnv = process.env.NODE_ENV;
const originalLocalUserEmail = process.env.DATAONE_LOCAL_USER_EMAIL;

function requestWithHeaders(headers: Record<string, string | undefined>) {
  return {
    header(name: string) {
      return headers[name.toLowerCase()];
    },
  };
}

function responseRecorder() {
  const status = vi.fn();
  const json = vi.fn();
  const response = { status, json };
  status.mockReturnValue(response);
  json.mockReturnValue(response);
  return { response, status, json };
}

beforeEach(() => {
  process.env.NODE_ENV = 'production';
});

afterAll(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalLocalUserEmail === undefined) delete process.env.DATAONE_LOCAL_USER_EMAIL;
  else process.env.DATAONE_LOCAL_USER_EMAIL = originalLocalUserEmail;
});

describe('Databricks identity handler', () => {
  it('returns the real Databricks forwarded identity and disclosed execution identity', () => {
    const { response, status, json } = responseRecorder();

    handleWhoAmI(
      requestWithHeaders({
        'x-forwarded-user': ' 2480175593312345 ',
        'x-forwarded-email': ' analyst@example.com ',
      }),
      response
    );

    expect(status).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith({
      userId: '2480175593312345',
      email: 'analyst@example.com',
      executionIdentity: 'Veltirs DataOne Databricks App service principal',
    });
  });

  it('rejects a production request that has no Databricks forwarded user', () => {
    const { response, status, json } = responseRecorder();

    handleWhoAmI(requestWithHeaders({ 'x-forwarded-email': 'analyst@example.com' }), response);

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: 'Databricks user identity is required.' });
  });

  it('uses an explicit local identity only outside production', () => {
    process.env.NODE_ENV = 'development';
    process.env.DATAONE_LOCAL_USER_EMAIL = 'local.admin@example.com';
    const { response, json } = responseRecorder();

    handleWhoAmI(requestWithHeaders({}), response);

    expect(json).toHaveBeenCalledWith({
      userId: 'local-development-user',
      email: 'local.admin@example.com',
      executionIdentity: 'Veltirs DataOne Databricks App service principal',
    });
  });
});
