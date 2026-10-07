interface IdentityRequest {
  header(name: string): string | undefined;
}

interface IdentityResponse {
  status(code: number): IdentityResponse;
  json(body: unknown): unknown;
}

export interface DatabricksRequestIdentity {
  userId: string;
  email: string | null;
}

export function resolveRequestIdentity(request: IdentityRequest): DatabricksRequestIdentity | null {
  const userId = request.header('x-forwarded-user')?.trim();
  const email = request.header('x-forwarded-email')?.trim();

  if (process.env.NODE_ENV === 'production' && !userId) return null;
  const localEmail =
    process.env.NODE_ENV === 'production' ? null : process.env.DATAONE_LOCAL_USER_EMAIL?.trim() || null;
  return {
    userId: userId ?? 'local-development-user',
    email: email ?? localEmail,
  };
}

export function handleWhoAmI(request: IdentityRequest, response: IdentityResponse): void {
  const identity = resolveRequestIdentity(request);
  if (!identity) {
    response.status(401).json({ error: 'Databricks user identity is required.' });
    return;
  }

  response.json({
    ...identity,
    executionIdentity: 'Veltirs DataOne Databricks App service principal',
  });
}
