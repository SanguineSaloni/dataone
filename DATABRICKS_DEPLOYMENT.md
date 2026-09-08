# DataOne → Databricks Marketplace Deployment Guide

## Overview
This guide implements the 4R strategy from `databricks-native-assessment.html`:
- **Retire 15%:** Delete redundant features Databricks does better
- **Delegate 45%:** Call Databricks primitives instead of owning
- **Adapt 25%:** Rewrite to push down to native compute
- **Keep 15%:** Invest in our differentiation

## Phase 1: Integration (Rung A)
**Timeline:** 1.5-3 months | **Risk:** Low | **Reversibility:** Full

### Deliverables
1. Databricks connector (`databricks-sql-connector`)
2. LLM → Model Serving integration
3. Query execution via SQL Warehouses
4. DataOne can read/write Databricks data

### Implementation Steps

#### 1.1 Install Databricks SDK
```bash
cd backend
pip install databricks-sql-connector databricks-sdk
pip freeze > requirements.txt
```

#### 1.2 Create Databricks Connector
**File:** `backend/app/connectors/databricks_connector.py`

```python
from databricks import sql
from typing import Optional, Dict, Any
import logging

logger = logging.getLogger(__name__)

class DatabricksConnector:
    """Connector for Databricks SQL Warehouses"""
    
    def __init__(self, config: Dict[str, Any]):
        self.server_hostname = config.get("server_hostname")
        self.http_path = config.get("http_path")
        self.access_token = config.get("access_token")
        self.connection = None
    
    def connect(self) -> bool:
        try:
            self.connection = sql.connect(
                server_hostname=self.server_hostname,
                http_path=self.http_path,
                access_token=self.access_token
            )
            logger.info("Connected to Databricks SQL Warehouse")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to Databricks: {e}")
            return False
    
    def execute_query(self, query: str, params: Optional[Dict] = None):
        """Execute query with async support"""
        cursor = self.connection.cursor()
        cursor.execute(query, params or {})
        return cursor.fetchall_arrow()  # Returns PyArrow table
    
    def get_catalog_metadata(self, catalog: str, schema: str):
        """Read Unity Catalog information_schema"""
        query = """
        SELECT table_name, column_name, data_type, comment
        FROM system.information_schema.columns
        WHERE table_catalog = :catalog AND table_schema = :schema
        ORDER BY table_name, ordinal_position
        """
        return self.execute_query(query, {"catalog": catalog, "schema": schema})
    
    def close(self):
        if self.connection:
            self.connection.close()
```

#### 1.3 Register Connector
**File:** `backend/app/services/connector_catalog.py`

Add:
```python
from app.connectors.databricks_connector import DatabricksConnector

CONNECTOR_TYPES = {
    # ... existing connectors ...
    "databricks": {
        "class": DatabricksConnector,
        "display_name": "Databricks SQL Warehouse",
        "icon": "databricks",
        "config_schema": {
            "server_hostname": {"type": "string", "required": True},
            "http_path": {"type": "string", "required": True},
            "access_token": {"type": "password", "required": True}
        }
    }
}
```

#### 1.4 Frontend Connection Form
**File:** `frontend/src/types/connections.ts`

Add:
```typescript
export interface DatabricksConnection extends BaseConnection {
  type: 'databricks';
  config: {
    server_hostname: string;
    http_path: string;
    access_token: string;
  };
}
```

**File:** `frontend/src/components/connections/DatabricksForm.tsx`

```tsx
import React from 'react';
import { FormField } from '../forms';

export const DatabricksConnectionForm: React.FC = () => {
  return (
    <div className="space-y-4">
      <FormField
        label="Server Hostname"
        name="server_hostname"
        placeholder="adb-1234567890123456.7.azuredatabricks.net"
        helpText="Find in SQL Warehouse → Connection Details"
      />
      <FormField
        label="HTTP Path"
        name="http_path"
        placeholder="/sql/1.0/warehouses/abc123def456"
        helpText="Warehouse HTTP path from connection details"
      />
      <FormField
        label="Access Token"
        name="access_token"
        type="password"
        helpText="Personal access token or service principal token"
      />
    </div>
  );
};
```

### Testing Phase 1

With Databricks Community Edition:
1. Create personal access token
2. Start SQL Warehouse (if available)
3. Test connection through DataOne UI
4. Run schema discovery
5. Execute sample queries

---

## Phase 2: Databricks App (Rung B)
**Timeline:** +2.5-4 months | **Risk:** Medium | **Reversibility:** Mostly

### Deliverables
1. Packaged as Databricks Lakehouse App
2. OAuth authentication
3. Unity Catalog delegation
4. Marketplace listing submitted

### Implementation Steps

#### 2.1 Create App Manifest

**File:** `databricks/app.yml`

```yaml
name: dataone
display_name: DataOne - Agentic DBA
version: 1.0.0
description: |
  AI-powered database management with human-in-the-loop governance.
  Intelligent schema design, migrations, and cross-source mapping.

runtime:
  framework: custom
  language: python
  version: "3.11"

deployment:
  type: web_app
  port: 8000
  health_check:
    path: /health
    interval: 30s
    timeout: 10s
    retries: 3

services:
  backend:
    container:
      image: ${REGISTRY}/dataone-backend:${VERSION}
      port: 8000
    environment:
      - DATABRICKS_WORKSPACE_URL
      - DATABRICKS_HOST
      - DATABASE_URL=${secret:dataone-postgres-url}
      - REDIS_URL=${secret:dataone-redis-url}
    resources:
      cpu: 2
      memory: 4Gi
  
  frontend:
    container:
      image: ${REGISTRY}/dataone-frontend:${VERSION}
      port: 3000
    environment:
      - VITE_API_URL=/api

  postgres:
    container:
      image: postgres:15-alpine
      port: 5432
    environment:
      - POSTGRES_DB=dataone
      - POSTGRES_PASSWORD=${secret:postgres-password}
    volumes:
      - dataone-db:/var/lib/postgresql/data
  
  redis:
    container:
      image: redis:7-alpine
      port: 6379
    volumes:
      - dataone-redis:/data

auth:
  oauth:
    enabled: true
    scopes:
      - sql:execute         # Run queries on SQL Warehouses
      - catalog:read        # Read Unity Catalog metadata
      - catalog:write       # Create/modify catalog objects
      - workspace:access    # Access workspace resources
  
  rbac:
    enabled: true
    default_role: viewer

secrets:
  - postgres-password
  - redis-password
  - dataone-admin-key

permissions:
  - resource: sql_warehouse
    level: can_use
  - resource: unity_catalog
    level: can_read

volumes:
  - name: dataone-db
    size: 10Gi
  - name: dataone-redis
    size: 5Gi

networking:
  ingress:
    enabled: true
    path: /
  egress:
    allowed_endpoints:
      - "*.databricks.com"
      - "pypi.org"
```

#### 2.2 Implement OAuth

**File:** `backend/app/services/databricks_auth_service.py`

```python
from databricks.sdk import WorkspaceClient
from databricks.sdk.core import ApiClient, Config
from typing import Optional, Dict
import logging

logger = logging.getLogger(__name__)

class DatabricksAuthService:
    """Handle Databricks OAuth and on-behalf-of identity"""
    
    def __init__(self):
        self.workspace_client: Optional[WorkspaceClient] = None
    
    def authenticate_user(self, access_token: str) -> Dict:
        """
        Authenticate user via Databricks OAuth
        Returns user info and mapped permissions
        """
        try:
            # Create workspace client with user's token
            config = Config(
                host=os.getenv("DATABRICKS_HOST"),
                token=access_token
            )
            self.workspace_client = WorkspaceClient(config=config)
            
            # Get current user
            user = self.workspace_client.current_user.me()
            
            # Map UC permissions to DataOne roles
            role = self.map_to_dataone_role(user, access_token)
            
            return {
                "user_id": user.id,
                "email": user.user_name,
                "display_name": user.display_name,
                "role": role,
                "groups": user.groups or []
            }
        
        except Exception as e:
            logger.error(f"Authentication failed: {e}")
            raise
    
    def map_to_dataone_role(self, user, access_token: str) -> str:
        """
        Map Unity Catalog grants to DataOne roles
        Query UC system tables for user permissions
        """
        query = """
        SELECT privilege_type, object_type
        FROM system.information_schema.table_privileges
        WHERE grantee = :user_name
        """
        
        try:
            privileges = self.execute_query(query, {"user_name": user.user_name}, access_token)
            
            # Role mapping logic
            if any(p['privilege_type'] == 'ALL' for p in privileges):
                return 'admin'
            elif any(p['privilege_type'] in ['SELECT', 'MODIFY'] for p in privileges):
                return 'analyst'
            else:
                return 'viewer'
        
        except Exception as e:
            logger.warning(f"Could not map permissions, defaulting to viewer: {e}")
            return 'viewer'
    
    def execute_query(self, query: str, params: Dict, access_token: str):
        """Execute query with user's permissions"""
        # Use databricks-sql-connector with user token
        from databricks import sql
        
        conn = sql.connect(
            server_hostname=os.getenv("DATABRICKS_HOST"),
            http_path=os.getenv("DATABRICKS_HTTP_PATH"),
            access_token=access_token
        )
        
        cursor = conn.cursor()
        cursor.execute(query, params)
        results = cursor.fetchall()
        conn.close()
        
        return results
```

**File:** `backend/app/api/middleware/databricks_auth.py`

```python
from fastapi import Request, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.services.databricks_auth_service import DatabricksAuthService

security = HTTPBearer()
auth_service = DatabricksAuthService()

async def verify_databricks_token(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> Dict:
    """Middleware to verify Databricks OAuth token"""
    
    token = credentials.credentials
    
    try:
        user_info = auth_service.authenticate_user(token)
        return user_info
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Databricks token"
        )
```

#### 2.3 Delegate to Unity Catalog

**File:** `backend/app/services/unity_catalog_service.py`

```python
from databricks.sdk import WorkspaceClient
from typing import List, Dict, Optional
import logging

logger = logging.getLogger(__name__)

class UnityCatalogService:
    """
    Delegate catalog, lineage, and governance to Unity Catalog
    Per assessment: DELEGATE column (~45% of features)
    """
    
    def __init__(self, workspace_client: WorkspaceClient):
        self.wc = workspace_client
    
    def get_catalogs(self) -> List[Dict]:
        """Get all catalogs user has access to"""
        catalogs = self.wc.catalogs.list()
        return [{"name": c.name, "comment": c.comment} for c in catalogs]
    
    def get_schemas(self, catalog: str) -> List[Dict]:
        """Get schemas in catalog"""
        schemas = self.wc.schemas.list(catalog_name=catalog)
        return [{"name": s.name, "comment": s.comment} for s in schemas]
    
    def get_tables(self, catalog: str, schema: str) -> List[Dict]:
        """Get tables in schema"""
        tables = self.wc.tables.list(catalog_name=catalog, schema_name=schema)
        return [{
            "name": t.name,
            "table_type": t.table_type,
            "comment": t.comment,
            "owner": t.owner
        } for t in tables]
    
    def get_table_metadata(self, catalog: str, schema: str, table: str) -> Dict:
        """Get detailed table metadata from UC"""
        table_info = self.wc.tables.get(f"{catalog}.{schema}.{table}")
        
        return {
            "full_name": table_info.full_name,
            "columns": [
                {
                    "name": col.name,
                    "type": col.type_name,
                    "comment": col.comment,
                    "nullable": col.nullable
                }
                for col in table_info.columns
            ],
            "owner": table_info.owner,
            "created_at": table_info.created_at,
            "updated_at": table_info.updated_at,
            "storage_location": table_info.storage_location,
            "table_type": table_info.table_type
        }
    
    def get_lineage(self, table_fqn: str) -> Dict:
        """
        Get automatic lineage from Unity Catalog
        DELEGATE: Replaces app-owned lineage tracking
        """
        try:
            lineage = self.wc.table_lineage.get(table_fqn)
            
            return {
                "upstream": [
                    {"table": rel.table_name, "type": "direct"}
                    for rel in lineage.upstreams or []
                ],
                "downstream": [
                    {"table": rel.table_name, "type": "direct"}
                    for rel in lineage.downstreams or []
                ]
            }
        except Exception as e:
            logger.warning(f"Lineage not available for {table_fqn}: {e}")
            return {"upstream": [], "downstream": []}
    
    def get_table_tags(self, table_fqn: str) -> Dict[str, str]:
        """
        Get UC tags (includes auto-classified PII)
        DELEGATE: Replaces DAMA classifier
        """
        table_info = self.wc.tables.get(table_fqn)
        return table_info.tags or {}
    
    def get_grants(self, table_fqn: str) -> List[Dict]:
        """Get access grants for table"""
        grants = self.wc.grants.get(securable_type="TABLE", full_name=table_fqn)
        
        return [
            {
                "principal": g.principal,
                "privileges": g.privileges
            }
            for g in grants.privilege_assignments or []
        ]
```

**Integration point:**

**File:** `backend/app/services/schema_catalog_service.py`

```python
# Modify existing service to delegate to UC for Databricks sources

class SchemaCatalogService:
    def __init__(self):
        self.uc_service: Optional[UnityCatalogService] = None
        self.app_catalog = AppCatalogService()  # Fallback for non-Databricks
    
    def get_catalog_for_connection(self, connection_id: str):
        """Route to UC or app catalog based on connection type"""
        
        connection = self.get_connection(connection_id)
        
        if connection.type == "databricks":
            # DELEGATE to Unity Catalog
            if not self.uc_service:
                self.uc_service = UnityCatalogService(workspace_client)
            return self.uc_service.get_catalogs()
        else:
            # KEEP app-owned catalog for multi-source support
            return self.app_catalog.get_catalogs(connection_id)
```

#### 2.4 Build Container Images

**File:** `databricks/backend.Dockerfile`

```dockerfile
FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Databricks-specific
RUN pip install --no-cache-dir \
    databricks-sql-connector \
    databricks-sdk

# Copy application
COPY backend/app ./app

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD python -c "import requests; requests.get('http://localhost:8000/health')"

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**File:** `databricks/frontend.Dockerfile`

```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ .

# Build with Databricks-specific config
ENV VITE_API_URL="/api"
ENV VITE_DATABRICKS_MODE="true"

RUN npm run build

# Production image
FROM node:18-alpine

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

RUN npm ci --production

EXPOSE 3000

CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "3000"]
```

Build and push:
```bash
# Set your container registry
REGISTRY="your-registry.azurecr.io"  # or GCR, ECR
VERSION="1.0.0"

# Build
docker build -f databricks/backend.Dockerfile -t $REGISTRY/dataone-backend:$VERSION .
docker build -f databricks/frontend.Dockerfile -t $REGISTRY/dataone-frontend:$VERSION .

# Push
docker push $REGISTRY/dataone-backend:$VERSION
docker push $REGISTRY/dataone-frontend:$VERSION
```

#### 2.5 Marketplace Submission

**File:** `marketplace/listing.json`

```json
{
  "name": "dataone",
  "display_name": "DataOne - Agentic DBA",
  "provider": "Your Company Name",
  "short_description": "AI-powered database management with human-in-the-loop governance for Databricks",
  "long_description": "DataOne brings intelligent schema design, automated migrations, and cross-source data mapping to your Databricks lakehouse. With agentic AI assistance and governed workflows, DataOne accelerates data engineering while maintaining compliance and quality.\n\n**Key Features:**\n- Agentic DBA: AI assistant for schema design and optimization\n- Schema Mapper: Visual tool for cross-source data mapping\n- Governed Migrations: Human-in-the-loop approval workflows\n- Unity Catalog Integration: Automatic lineage and classification\n- Multi-source: Connect Databricks with external OLTP databases",
  "category": "Data Management",
  "sub_category": "Data Engineering",
  "tags": [
    "AI",
    "Database",
    "Data Engineering",
    "Governance",
    "Migration",
    "Unity Catalog"
  ],
  "pricing_model": "free_trial",
  "pricing_details": {
    "trial_days": 14,
    "plans": [
      {
        "name": "Starter",
        "price_per_month": 0,
        "description": "Up to 5 data sources"
      },
      {
        "name": "Professional",
        "price_per_month": 499,
        "description": "Unlimited sources, full governance"
      }
    ]
  },
  "support": {
    "email": "support@dataone.io",
    "documentation": "https://docs.dataone.io/databricks",
    "sla": "Business hours (9-5 PT)"
  },
  "requirements": {
    "databricks_runtime": ">=13.0",
    "unity_catalog": "recommended",
    "sql_warehouse": "required"
  },
  "permissions": [
    "sql:execute",
    "catalog:read",
    "catalog:write",
    "workspace:access"
  ],
  "assets": {
    "logo": "assets/logo-512.png",
    "icon": "assets/icon-128.png",
    "screenshots": [
      "assets/screenshot-dashboard.png",
      "assets/screenshot-mapper.png",
      "assets/screenshot-agentic-dba.png"
    ],
    "demo_video": "https://youtube.com/watch?v=..."
  }
}
```

**File:** `marketplace/INSTALLATION.md`

```markdown
# DataOne Installation Guide

## Prerequisites

- Databricks workspace (AWS, Azure, or GCP)
- SQL Warehouse (any size)
- Unity Catalog (recommended, not required)
- Workspace Admin or Can Manage Apps permission

## Installation

### Step 1: Install from Marketplace

1. Navigate to **Marketplace** in your Databricks workspace
2. Search for "DataOne"
3. Click **Install**
4. Review permissions:
   - SQL execute (to run queries)
   - Catalog read/write (for metadata)
   - Workspace access (for OAuth)
5. Click **Confirm & Install**

Installation takes 2-3 minutes.

### Step 2: Launch DataOne

1. Once installed, click **Open App**
2. You'll be redirected to the DataOne UI
3. Grant OAuth consent on first launch
4. You're ready!

## First Steps

### Connect Your First Data Source

1. Click **Connections** → **New Connection**
2. Choose connection type:
   - **Databricks** (current workspace)
   - **PostgreSQL** (external database)
   - **MySQL, Oracle, SQL Server** (coming soon)
3. Enter connection details
4. Click **Test Connection** → **Save**

### Run Schema Discovery

1. Select your connection
2. Click **Discover Schemas**
3. DataOne will catalog all tables, columns, and relationships
4. View in the **Catalog** tab

### Try the Agentic DBA

1. Click **Ask DBA** in the sidebar
2. Try: "What indexes should I add to improve query performance?"
3. The AI assistant will analyze your schema and suggest optimizations
4. Review and approve suggestions

## Configuration

### Unity Catalog Integration

If Unity Catalog is enabled:
- DataOne automatically uses UC for lineage and governance
- PII classification from UC tags
- Row-level security from UC grants

### Multi-Tenancy

For workspace-level isolation:
1. Go to **Settings** → **Tenancy**
2. Choose isolation level:
   - **Catalog** (each team gets a UC catalog)
   - **Schema** (teams share catalog, separate schemas)

### Scheduled Pipelines

Use Databricks Workflows for orchestration:
1. Create a pipeline in DataOne
2. Click **Schedule** → **Create Workflow**
3. DataOne generates a Databricks Job
4. Manage in **Workflows** UI

## Troubleshooting

### Connection Failed

- Verify SQL Warehouse is running
- Check access token hasn't expired
- Ensure network connectivity

### Permission Denied

- Check Unity Catalog grants for your user
- Verify OAuth scopes in app settings

### Support

Email: support@dataone.io
Docs: https://docs.dataone.io/databricks
```

**File:** `marketplace/SECURITY.md`

```markdown
# Security & Compliance

## Data Security

### Data Residency
- **All data stays in your Databricks workspace**
- No data is transmitted to external servers
- Query results remain in your SQL Warehouse

### Encryption
- **At rest:** Leverages Databricks encryption (customer-managed keys supported)
- **In transit:** TLS 1.2+ for all connections
- **Secrets:** Stored in Databricks Secrets or workspace-managed secrets

### Authentication
- **Databricks OAuth only** - no separate login system
- **On-behalf-of execution** - all queries run with user's permissions
- **No stored credentials** - uses workspace identity

## Governance

### Unity Catalog Integration
- Inherits all UC grants and permissions
- Respects row-level security and column masks
- Honors data classification tags

### Audit Logging
- All user actions logged to workspace audit logs
- Query history viewable in SQL Warehouse history
- Lineage tracked in Unity Catalog

### RBAC
DataOne maps Unity Catalog permissions to three roles:
- **Admin:** ALL privileges on catalog
- **Analyst:** SELECT + MODIFY on tables
- **Viewer:** SELECT only

## Compliance

### Certifications
- SOC 2 Type II (in progress)
- GDPR compliant
- HIPAA ready (with BAA)

### Data Access
DataOne application components access:
- Unity Catalog metadata (read)
- SQL Warehouse (execute queries)
- Workspace APIs (user info, jobs)

**DataOne does NOT access:**
- Your source data directly
- Other workspaces
- External networks (unless explicitly configured)

## Network Security

### Egress
DataOne only requires:
- `*.databricks.com` (workspace APIs)
- `pypi.org` (Python packages, during install)

### Ingress
- Accessible only within your workspace
- No public internet exposure
- VPC/VNet isolation supported

## Incident Response

Security issues: security@dataone.io
Response SLA: 24 hours
```

### Submit to Marketplace

```bash
# Package all marketplace assets
tar -czf dataone-marketplace-submission.tar.gz \
  marketplace/ \
  databricks/app.yml \
  README.md

# Upload via Databricks Partner Portal
# https://partner.databricks.com/marketplace-submit
```

---

## Phase 3: Selective Native (Rung C)
**Timeline:** +3-5 months | **Risk:** High | **Reversibility:** Hard

**Only proceed if Phase 2 shows:**
- ETL pipelines > 10GB failing or timing out
- Query execution hitting 5k row limit frequently
- Customer demand for Spark-scale processing

### Implementation: ETL Push-down

**File:** `backend/app/services/databricks_pipeline_executor.py`

```python
from databricks.sdk import WorkspaceClient
from databricks.sdk.service.jobs import JobTaskSettings, SqlTask
import json

class DatabricksNativePipeline:
    """
    Generate Spark SQL / DLT pipelines instead of in-process Python
    ADAPT: Rewrite for native compute
    """
    
    def generate_spark_pipeline(self, mapping):
        """
        Convert DataOne mapping to Spark SQL
        Replaces LIMIT/OFFSET batching with set-based operations
        """
        
        # Generate column transformations
        select_clause = []
        for target_col, transform in mapping.column_mappings.items():
            if transform.type == "direct":
                select_clause.append(f"{transform.source_col} AS {target_col}")
            elif transform.type == "cast":
                select_clause.append(f"CAST({transform.source_col} AS {transform.target_type}) AS {target_col}")
            elif transform.type == "expression":
                select_clause.append(f"{transform.expression} AS {target_col}")
        
        sql = f"""
        CREATE OR REPLACE TABLE {mapping.target_catalog}.{mapping.target_schema}.{mapping.target_table} AS
        SELECT
          {', '.join(select_clause)}
        FROM {mapping.source_catalog}.{mapping.source_schema}.{mapping.source_table}
        """
        
        if mapping.filters:
            sql += f"\nWHERE {mapping.filters}"
        
        return sql
    
    def submit_as_job(self, pipeline_name: str, sql: str, schedule: Optional[str] = None):
        """Submit as Databricks Workflow"""
        
        task = JobTaskSettings(
            task_key="execute_pipeline",
            sql_task=SqlTask(
                warehouse_id=os.getenv("DATABRICKS_WAREHOUSE_ID"),
                query=sql
            )
        )
        
        job_config = {
            "name": f"DataOne: {pipeline_name}",
            "tasks": [task],
            "email_notifications": {
                "on_failure": [os.getenv("ADMIN_EMAIL")]
            }
        }
        
        if schedule:
            job_config["schedule"] = {
                "quartz_cron_expression": schedule,
                "timezone_id": "UTC"
            }
        
        wc = WorkspaceClient()
        job = wc.jobs.create(**job_config)
        
        return job.job_id
```

---

## Testing Strategy

### Local Development
```bash
# Use Community Edition
DATABRICKS_HOST="https://community.cloud.databricks.com"
DATABRICKS_TOKEN="your-token"

# Start locally
docker-compose up
# Test connector
curl http://localhost:8000/api/connections/databricks/test
```

### Staging (Partner Workspace)
- Request trial workspace from Databricks
- Deploy app.yml
- Test OAuth flow
- Validate Unity Catalog integration

### Production
- Submit to Marketplace
- Beta testing with select customers
- Monitor telemetry
- Iterate based on feedback

---

## Success Metrics

### Phase 1
- [ ] Databricks connection type available
- [ ] Query execution via SQL Warehouse working
- [ ] LLM using Model Serving
- [ ] 5+ internal test scenarios passed

### Phase 2
- [ ] App deploys successfully in test workspace
- [ ] OAuth authentication working
- [ ] Unity Catalog metadata visible in DataOne
- [ ] Marketplace submission accepted
- [ ] 3+ beta customers onboarded

### Phase 3 (if pursued)
- [ ] ETL pipelines 10x faster than Python
- [ ] Query performance improved measurably
- [ ] Customer adoption of native features > 50%

---

## Rollback Plan

### Phase 1: Full rollback
- Remove Databricks connector type
- Revert LLM to Ollama
- No customer impact (new feature only)

### Phase 2: Partial rollback
- Can demote from App to standalone + connector
- OAuth → JWT auth transition
- UC delegation → app-owned catalog
- Marketplace listing can be unlisted

### Phase 3: Hard rollback
- Spark SQL → Python executor migration
- Databricks Jobs → Celery migration
- Requires customer coordination

---

## Open Questions (From Assessment)

Before proceeding, answer:

1. **Target cloud:** AWS, Azure, or GCP Databricks?
2. **Tenancy model:** Single SaaS vs. per-customer app instances?
3. **Which DELEGATE features are non-negotiable** (vs. multi-source fallback)?
4. **Data residency:** Can LLM inference happen in Databricks (vs. local)?
5. **Marketplace terms:** Revenue share acceptable?

---

## Next Steps

1. **Week 1-2:** Set up Community Edition, test connector locally
2. **Week 3-4:** Implement OAuth skeleton, request partner workspace
3. **Month 2:** Complete Unity Catalog delegation
4. **Month 3:** Build container images, create app.yml
5. **Month 4:** Marketplace submission, beta program
6. **Month 5+:** Iterate based on customer feedback

---

## Resources

- **Databricks Partner Portal:** https://partner.databricks.com
- **App Framework Docs:** https://docs.databricks.com/lakehouse-apps/
- **Unity Catalog API:** https://docs.databricks.com/api/workspace/catalogs
- **Marketplace Guide:** https://docs.databricks.com/marketplace/

---

*This deployment plan implements the phased strategy from `databricks-native-assessment.html`. Focus on Phase 1 first—it's low-risk, fully reversible, and delivers immediate customer value.*
