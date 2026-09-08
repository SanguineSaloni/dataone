# DataOne Security & Compliance Documentation

## Overview

DataOne is designed with security as a foundational principle. This document outlines our security architecture, data handling practices, compliance posture, and how DataOne integrates with Databricks security features.

## Security Architecture

### Deployment Model

DataOne operates as a **Databricks Lakehouse App**, which means:

- **No data leaves your workspace**: All data processing occurs within your Databricks environment
- **No external APIs**: DataOne does not send data to external third-party services
- **Workspace isolation**: Each installation is isolated to a single Databricks workspace
- **No shared infrastructure**: Your data is never shared with other DataOne customers

### Authentication & Authorization

#### OAuth2 with Databricks

- **Primary authentication**: Databricks OAuth2 with PKCE flow
- **Token management**: 
  - Access tokens stored encrypted in PostgreSQL
  - Refresh tokens used for automatic token renewal
  - Tokens never logged or exposed in API responses
- **Session management**:
  - Configurable session timeout (default: 24 hours)
  - Automatic logout on token expiration
  - Secure HTTP-only cookies

#### Unity Catalog RBAC Delegation

DataOne delegates access control to Unity Catalog:

- **Catalog-level**: Users only see catalogs they have `USE CATALOG` on
- **Schema-level**: Only schemas with `USE SCHEMA` grants are visible
- **Table-level**: Read permissions via `SELECT` grants
- **Column-level**: Respects Unity Catalog column masking
- **Row-level**: Honors Unity Catalog row filters

**No additional permission layer** - DataOne inherits your existing UC security model.

### Data Handling

#### Data Storage

| Data Type | Storage Location | Encryption | Retention |
|-----------|------------------|------------|-----------|
| Unity Catalog metadata | Not stored (delegated to UC) | N/A | N/A |
| Schema mappings | PostgreSQL (in workspace) | At rest (AES-256) | User configurable |
| Query history | PostgreSQL (in workspace) | At rest (AES-256) | 90 days (default) |
| Audit logs | PostgreSQL (in workspace) | At rest (AES-256) | 90 days (default) |
| User credentials | PostgreSQL (in workspace) | At rest (AES-256) | Until user deletion |
| Connection credentials | PostgreSQL (in workspace) | At rest (AES-256) | Until connection deletion |
| Query results (cache) | Redis (in workspace) | In memory only | 1 hour (default) |

#### Encryption

- **At Rest**: 
  - PostgreSQL volume encrypted with AES-256
  - Managed by Databricks workspace encryption
  - Credentials double-encrypted (workspace + app-level)

- **In Transit**:
  - All internal communication over TLS 1.3
  - API endpoints require HTTPS
  - WebSocket connections use WSS (TLS)

#### Data Retention

Configurable retention policies:

```python
# Default settings (modifiable via environment variables)
AUDIT_RETENTION_DAYS = 90         # Audit log retention
QUERY_HISTORY_RETENTION_DAYS = 90 # Query history retention
SESSION_TIMEOUT_HOURS = 24        # Session timeout
```

To modify retention:
1. Go to **Workspace Settings** → **Lakehouse Apps** → **DataOne** → **Configuration**
2. Update environment variables
3. Restart the app

#### Data Deletion

- **User deletion**: All associated data (queries, mappings) deleted within 24 hours
- **Connection deletion**: Credentials purged immediately, cached data within 1 hour
- **Workspace uninstall**: All data deleted when app is uninstalled (PostgreSQL volume destroyed)

### Network Security

#### Internal Network

- **Service mesh**: Backend, worker, PostgreSQL, Redis on isolated internal network
- **No public endpoints**: Only frontend exposed via Databricks ingress
- **Port restrictions**: Only necessary ports open (3000 for frontend)

#### External Connections

For external database connections (PostgreSQL, MySQL, etc.):

- **Firewall rules**: User configures workspace firewall to allow egress
- **Credential storage**: Encrypted at rest, decrypted only in memory for query execution
- **Connection pooling**: Secure, time-limited connections
- **Timeout enforcement**: Hard limits on connection attempts (5 seconds default)

### Application Security

#### Input Validation

- **SQL injection prevention**: 
  - Parameterized queries only
  - No dynamic SQL construction from user input
  - Query parsing and validation before execution

- **XSS prevention**:
  - Content Security Policy (CSP) headers
  - React JSX auto-escaping
  - No `dangerouslySetInnerHTML` usage

- **CSRF protection**:
  - State parameter in OAuth flow
  - SameSite cookies
  - Double-submit cookie pattern for state-changing operations

#### Dependency Management

- **Automated scanning**: Dependabot alerts for vulnerabilities
- **Regular updates**: Monthly dependency updates
- **Pinned versions**: No floating dependencies in production
- **SBOM available**: Software Bill of Materials provided on request

#### Secrets Management

- **No hardcoded secrets**: All secrets via environment variables
- **Secret generation**: Auto-generated secrets during installation
- **Rotation support**: Secrets can be rotated without downtime
- **Access control**: Only backend service has access to secrets

### Monitoring & Audit

#### Audit Trail

All user actions logged:

- **Authentication events**: Login, logout, token refresh
- **Data access**: Queries executed, results returned
- **Configuration changes**: Connection creation/modification, user management
- **Schema operations**: Mapping creation, drift detection

Audit log format:
```json
{
  "timestamp": "2026-09-08T10:30:00Z",
  "user_id": 123,
  "user_email": "user@example.com",
  "action": "query_execute",
  "resource": "catalog.schema.table",
  "ip_address": "10.0.1.5",
  "user_agent": "Mozilla/5.0...",
  "status": "success",
  "details": {
    "query_id": "abc-123",
    "rows_returned": 1000,
    "execution_time_ms": 1500
  }
}
```

#### Security Monitoring

- **Failed login attempts**: Tracked and logged
- **Rate limiting**: 100 requests/minute per user (API), 10 login attempts/hour
- **Anomaly detection**: Large query results, unusual access patterns flagged
- **Health checks**: Continuous monitoring of service health

### Incident Response

#### Incident Classification

- **P0 (Critical)**: Data breach, authentication bypass, service outage
- **P1 (High)**: Privilege escalation, SQL injection
- **P2 (Medium)**: XSS, CSRF, DoS vulnerability
- **P3 (Low)**: Information disclosure, minor config issues

#### Response Timeframes

| Severity | Acknowledgment | Resolution Target | Communication |
|----------|----------------|-------------------|---------------|
| P0 | 1 hour | 4 hours | Email + in-app banner |
| P1 | 4 hours | 24 hours | Email |
| P2 | 24 hours | 7 days | Release notes |
| P3 | 7 days | 30 days | Release notes |

#### Communication

Security incidents communicated via:
- Email to workspace admins
- In-app security banners
- Security advisory page: https://security.dataone.app
- Databricks partner portal notifications

## Compliance

### Current Status

- **SOC 2 Type II**: In progress (expected Q4 2026)
- **GDPR**: Compliant
- **CCPA**: Compliant
- **ISO 27001**: Planned (2027)

### Data Subject Rights (GDPR)

DataOne supports GDPR data subject rights:

- **Right to Access**: Export user data via Settings → Data Export
- **Right to Rectification**: Users can update their profile
- **Right to Erasure**: Users can delete their account (Settings → Delete Account)
- **Right to Portability**: Export data in JSON format
- **Right to Object**: Users can disable specific features

To exercise rights on behalf of a user (admin):
1. Go to **Settings** → **Users** → **[User]**
2. Click **Data Actions**
3. Select desired action (Export, Delete, etc.)

### Data Processing Agreement

DataOne operates as a **data processor** on behalf of your organization (the **data controller**):

- **No subprocessors**: Data never sent to third parties
- **Processing location**: Within your Databricks workspace region
- **Data residency**: Controlled by your Databricks workspace location
- **DPA available**: Contact support@veltris.com for executed DPA

### Compliance Documentation

Available on request:
- SOC 2 Type II report (when completed)
- Penetration test results (annual)
- Vulnerability assessment reports
- Data flow diagrams
- Security white paper

Contact compliance@veltris.com

## Third-Party Integrations

### External Services

DataOne does **not** use any external third-party services. All operations occur within your Databricks workspace.

### Optional External Connections

When you configure external database connections (PostgreSQL, MySQL, etc.):

- **Your responsibility**: Network security, credential management for those systems
- **DataOne's role**: Secure storage of credentials, encrypted transmission
- **Data flow**: Query execution only, no data replication or storage

## Vulnerability Disclosure

### Reporting Security Issues

**Do not** report security vulnerabilities via public GitHub issues.

Instead, email: **security@veltris.com**

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Process

1. **Acknowledgment**: Within 24 hours
2. **Validation**: 1-3 days to confirm and assess severity
3. **Fix Development**: Timeline based on severity
4. **Disclosure**: Coordinated disclosure after fix is deployed

### Bug Bounty

Bug bounty program coming soon. Contact security@veltris.com for details.

## Security Best Practices for Users

### For Workspace Admins

1. **Review OAuth permissions** before granting app access
2. **Limit workspace admin role** - use least privilege principle
3. **Enable MFA** on your Databricks account
4. **Audit app logs regularly** via Databricks workspace logs
5. **Rotate secrets annually** (regenerate OAuth client secret)

### For End Users

1. **Use strong passwords** (if external DB connections)
2. **Don't share credentials** - invite users instead
3. **Log out on shared computers**
4. **Review query history** for unexpected activity
5. **Report suspicious behavior** to your admin

### For External Connections

1. **Use read-only accounts** when possible
2. **Restrict IP ranges** via database firewall (allow Databricks workspace IPs only)
3. **Enable SSL/TLS** for database connections
4. **Rotate credentials regularly** (90-day recommended)
5. **Monitor connection activity** via database audit logs

## Security Updates

DataOne releases security updates on an as-needed basis:

- **Critical vulnerabilities**: Hotfix within 24-48 hours
- **High severity**: Patch in next minor release (within 7 days)
- **Medium severity**: Patch in next minor release (within 30 days)
- **Low severity**: Patch in next major release

Updates are applied automatically during your workspace maintenance window.

## Contact

For security questions or concerns:

- **Security team**: security@veltris.com
- **General support**: support@veltris.com
- **Compliance inquiries**: compliance@veltris.com

---

**Last updated**: September 8, 2026  
**Version**: 1.0.0
