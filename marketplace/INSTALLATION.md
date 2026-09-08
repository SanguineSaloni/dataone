# DataOne Installation Guide

## Prerequisites

Before installing DataOne from the Databricks Marketplace, ensure you have:

1. **Databricks Workspace**
   - Databricks Runtime 13.0 or later
   - Unity Catalog enabled
   - At least one SQL Warehouse (Serverless or Pro)

2. **Permissions**
   - Workspace Admin role (for initial installation)
   - Unity Catalog `USE CATALOG` and `USE SCHEMA` permissions
   - SQL Warehouse `CAN_USE` permission

3. **Resources**
   - Minimum: 4 CPU cores, 8GB RAM, 20GB storage
   - Recommended: 8 CPU cores, 16GB RAM, 50GB storage

## Installation Steps

### Step 1: Install from Marketplace

1. Navigate to the Databricks Marketplace
2. Search for "DataOne"
3. Click **Install** on the DataOne listing
4. Review the required permissions and click **Accept**
5. Choose your installation workspace
6. Configure the installation settings:
   - **App Name**: Default is "DataOne" (customize if needed)
   - **Log Level**: INFO (DEBUG for troubleshooting)
   - **Session Timeout**: 24 hours (adjust as needed)
   - **Max Query Rows**: 10,000 (adjust based on your use case)

7. Click **Install** and wait 5-10 minutes for deployment

### Step 2: Complete OAuth Setup

After installation, you'll be redirected to the DataOne app. The first time you access it:

1. Click **Sign in with Databricks**
2. Review the OAuth permissions:
   - **SQL**: Execute queries on SQL warehouses
   - **Unity Catalog**: Read metadata (catalogs, schemas, tables)
3. Click **Allow** to grant permissions
4. You'll be redirected to the DataOne dashboard

### Step 3: Configure External Data Sources (Optional)

If you want to connect to databases outside of Databricks:

1. Go to **Connections** in the sidebar
2. Click **New Connection**
3. Select your database type:
   - PostgreSQL
   - MySQL
   - Snowflake
   - Oracle
   - SQL Server
   - And more...
4. Enter connection details:
   - Host and port
   - Database name
   - Credentials (stored encrypted)
5. Click **Test Connection** to verify
6. Click **Save**

### Step 4: Set Up Your First Schema Mapping

1. Go to **Schema Mapper** in the sidebar
2. Select a **Source** schema:
   - Choose from Unity Catalog catalogs/schemas
   - Or select an external database connection
3. Select a **Target** schema (same options)
4. Click **Generate Mapping Suggestions**
5. Review AI-powered suggestions with confidence scores
6. Accept, modify, or reject individual mappings
7. Click **Save Mapping**

### Step 5: Execute Your First Query

1. Go to **Query Studio**
2. Select a data source from the dropdown
3. Write a SQL query (syntax highlighting included)
4. Click **Execute** (⌘/Ctrl + Enter)
5. View results in the table below
6. Export results as CSV or JSON if needed

## Post-Installation Configuration

### User Management

As an admin, you can invite team members:

1. Go to **Settings** → **Users**
2. Click **Invite User**
3. Enter their email address
4. Select a role:
   - **Admin**: Full access, can manage users and settings
   - **Editor**: Can create connections, mappings, and queries
   - **Viewer**: Read-only access
5. Click **Send Invitation**

Users will receive an email with a link to authenticate via Databricks OAuth.

### Unity Catalog Permissions

DataOne respects your existing Unity Catalog permissions:

- Users can only see catalogs, schemas, and tables they have access to
- Query execution honors row-level filters and column masking
- Lineage and classification data comes directly from Unity Catalog

No additional permission configuration is needed in DataOne.

### Resource Scaling

For production workloads, adjust resource allocation:

1. Go to **Workspace Settings** → **Lakehouse Apps**
2. Find DataOne in the list
3. Click **Configure** → **Resources**
4. Adjust CPU, memory, and storage limits
5. Click **Save** and restart the app

Recommended production settings:
- **Backend**: 2 CPUs, 4GB RAM (scales up to 5 replicas)
- **Worker**: 2 CPUs, 4GB RAM (scales up to 10 replicas based on queue depth)
- **Frontend**: 1 CPU, 1GB RAM (scales up to 3 replicas)
- **PostgreSQL**: 1 CPU, 2GB RAM, 10GB storage
- **Redis**: 0.5 CPU, 512MB RAM, 1GB storage

## Verification

To verify your installation:

### 1. Check Health Status

```bash
# Access the health endpoint
curl https://<your-workspace>.cloud.databricks.com/apps/<app-id>/api/v1/health
```

Expected response:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "database": "connected",
  "redis": "connected",
  "services": {
    "backend": "running",
    "worker": "running",
    "beat": "running"
  }
}
```

### 2. Verify OAuth

1. Log out and log back in
2. Ensure you're redirected to Databricks OAuth
3. After authorization, you should land on the dashboard

### 3. Test Unity Catalog Integration

1. Go to **Connections**
2. Look for "Unity Catalog" in the list (auto-created)
3. Click **Test Connection**
4. Status should be "Connected"
5. Browse catalogs/schemas to verify metadata access

### 4. Test External Connection (if configured)

1. Go to **Connections**
2. Select your external database
3. Click **Test Connection**
4. Status should show "Connected" with latency

## Troubleshooting

### App Won't Start

**Symptoms**: Installation hangs or shows error

**Solutions**:
1. Check resource quotas in your workspace
2. Verify Unity Catalog is enabled
3. Review app logs:
   ```bash
   databricks apps logs <app-id>
   ```

### OAuth Errors

**Symptoms**: "Failed to authenticate" or redirect loops

**Solutions**:
1. Verify OAuth client ID and secret are correct
2. Check callback URL matches: `https://<workspace-url>/apps/<app-id>/api/v1/auth/databricks/callback`
3. Ensure user has Unity Catalog permissions
4. Clear browser cookies and retry

### Connection Timeouts

**Symptoms**: "Connection test timed out"

**Solutions**:
1. Verify SQL Warehouse is running
2. Check network connectivity from app to external databases
3. Increase `CONNECTOR_TEST_TIMEOUT_SECONDS` in app config (default: 5s)
4. For Databricks connections:
   - Start the SQL Warehouse manually
   - Free tier warehouses may have cold start delays

### Missing Tables/Schemas

**Symptoms**: Unity Catalog objects don't appear

**Solutions**:
1. Verify user has `USE CATALOG` and `USE SCHEMA` grants
2. Check Unity Catalog permissions via SQL:
   ```sql
   SHOW GRANTS ON CATALOG <catalog_name>;
   SHOW GRANTS ON SCHEMA <catalog>.<schema>;
   ```
3. Refresh the page to reload metadata cache

### Performance Issues

**Symptoms**: Slow queries or UI lag

**Solutions**:
1. Scale up worker replicas (Settings → Resources)
2. Enable Redis caching (enabled by default)
3. Reduce `MAX_QUERY_ROWS` for large result sets
4. Use Serverless SQL Warehouses for faster cold starts

## Getting Help

- **Documentation**: https://docs.dataone.app
- **Email Support**: support@veltris.com
- **Community Forum**: https://community.dataone.app
- **Response Time**: 
  - Professional plan: 24 hours
  - Enterprise plan: 4 hours

## Next Steps

Now that DataOne is installed:

1. **Connect Your Data**: Add all relevant data sources
2. **Map Schemas**: Create mappings between related schemas
3. **Build Queries**: Start querying across sources
4. **Enable Monitoring**: Set up drift detection alerts
5. **Invite Team**: Add collaborators with appropriate roles

Refer to the [User Guide](https://docs.dataone.app/user-guide) for detailed feature documentation.

---

**Need help?** Contact us at support@veltris.com or visit our documentation at https://docs.dataone.app
