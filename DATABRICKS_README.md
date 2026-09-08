# Databricks Integration for DataOne

DataOne now supports Databricks SQL Warehouses with Unity Catalog integration, enabling you to bring your lakehouse data into DataOne's intelligent data management platform.

## 🎯 What's New

### Phase 1: Integration (✅ Implemented)

- **Databricks SQL Warehouse Connector** - Connect to any SQL Warehouse in your workspace
- **Unity Catalog Support** - Automatic catalog, schema, and table discovery
- **Column Profiling** - Optimized profiling for Delta tables
- **Query Execution** - Run SQL queries against your Databricks data
- **Optional LLM Integration** - Use Databricks Foundation Model APIs instead of local Ollama

### Multi-Source Architecture Preserved

DataOne remains a **multi-source** platform. Databricks is one connector type alongside:
- PostgreSQL
- MySQL
- Oracle
- SQLite
- JDBC (generic)

Your existing connections continue to work unchanged.

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd backend
pip install databricks-sql-connector databricks-sdk
```

### 2. Get Databricks Credentials

From your Databricks workspace:

1. **SQL Warehouse** → Select your warehouse → **Connection Details**
2. Copy:
   - **Server hostname**: `adb-xxx.azuredatabricks.net`
   - **HTTP path**: `/sql/1.0/warehouses/abc123`
3. **User Settings** → **Access Tokens** → **Generate New Token**
   - Copy the token (you won't see it again!)

### 3. Create Connection

#### Option A: Via UI

1. Navigate to **Dashboard** → **Connections**
2. Click **New Connection**
3. Select **Databricks** from type dropdown
4. Fill in the form:
   ```
   Name: Production Lakehouse
   Server Hostname: adb-xxx.azuredatabricks.net
   HTTP Path: /sql/1.0/warehouses/abc123
   Access Token: dapi...
   Catalog: main (optional)
   Schema: default (optional)
   ```
5. Click **Test Connection** to verify
6. Click **Save**

#### Option B: Via API

```bash
curl -X POST http://localhost:8011/api/v1/connections \
  -H "Authorization: Bearer YOUR_DATAONE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production Lakehouse",
    "type": "databricks",
    "config": {
      "server_hostname": "adb-xxx.azuredatabricks.net",
      "http_path": "/sql/1.0/warehouses/abc123",
      "access_token": "dapi...",
      "catalog": "main",
      "schema": "default"
    }
  }'
```

### 4. Verify

Test connection should return:

```json
{
  "status": "success",
  "diagnostics": {
    "version": "Databricks 13.3",
    "latency_ms": 245,
    "reachable": true,
    "authenticated": true,
    "database_accessible": true
  }
}
```

---

## 📊 Features

### Connection & Discovery

- ✅ Connect to SQL Warehouses (all clouds: AWS, Azure, GCP)
- ✅ Automatic Unity Catalog discovery
- ✅ Multi-catalog support
- ✅ Schema and table listing
- ✅ Column metadata with comments
- ✅ Data type mapping

### Query Execution

- ✅ SQL query execution via Query Studio
- ✅ Result pagination
- ✅ Syntax highlighting for Databricks SQL
- ✅ Query history
- ✅ Error handling with clear messages

### Column Profiling

- ✅ Null rate and distinct count
- ✅ Min/max values
- ✅ Sample values for classification
- ✅ Optimized for large Delta tables (uses APPROX_COUNT_DISTINCT)
- ✅ Configurable sampling limits

### Unity Catalog (Advanced)

The `UnityCatalogService` provides access to:

- **Automatic Lineage** - Upstream/downstream table dependencies
- **PII Tags** - Column-level sensitivity classification
- **Table Grants** - Who has access to what
- **Metadata Search** - Find tables across catalogs
- **Comments & Documentation** - Table and column descriptions

Example usage:

```python
from app.services.databricks_unity_catalog_service import UnityCatalogService

uc = UnityCatalogService(databricks_connection)

# Get lineage
lineage = uc.get_table_lineage("main", "sales", "orders")
# Returns: {"upstream": [...], "downstream": [...]}

# Check PII tags
tags = uc.get_column_tags("main", "sales", "customers", "email")
# Returns: {"PII": "email"}

# Search tables
results = uc.search_tables("customer")
# Returns: [{catalog, schema, name, comment}, ...]

uc.close()
```

### LLM Integration (Optional)

Use Databricks Foundation Model APIs for AI features instead of local Ollama:

**Enable in `.env`:**
```bash
DATABRICKS_WORKSPACE_URL=https://your-workspace.cloud.databricks.com
DATABRICKS_ACCESS_TOKEN=your-token
DATABRICKS_USE_LLM=true
```

**Or use programmatically:**
```python
from app.services.databricks_llm_provider import DatabricksLLMProvider

llm = DatabricksLLMProvider(
    workspace_url="https://...",
    access_token="...",
    model_name="databricks-dbrx-instruct"
)

response = llm.generate(
    prompt="Explain this schema design",
    temperature=0.7,
    max_tokens=500
)
print(response["response"])
```

**Genie for NL2SQL:**
```python
from app.services.databricks_llm_provider import DatabricksGenieProvider

genie = DatabricksGenieProvider(
    workspace_url="https://...",
    access_token="..."
)

result = genie.generate_sql(
    "Show me top 10 customers by revenue",
    catalog="main",
    schema="sales"
)
print(result["sql"])
```

---

## 🏗️ Architecture

### Connector Layer

```
DatabricksConnector (BaseConnector)
    ↓
databricks-sql-connector
    ↓
SQL Warehouse → Unity Catalog
```

**Key Classes:**
- `DatabricksConnector` - Main connector implementing BaseConnector interface
- `UnityCatalogService` - Advanced UC features (lineage, tags, grants)
- `DatabricksLLMProvider` - LLM integration
- `DatabricksGenieProvider` - Genie for SQL generation

### Delegation Strategy

Per the **4R Assessment** (`databricks-native-assessment.html`):

| Feature | DataOne-owned | Databricks-delegated |
|---------|---------------|----------------------|
| Connection management | ✅ | - |
| Query execution | ✅ | Future: Async statements |
| Schema catalog | Fallback | **Unity Catalog** |
| Lineage tracking | Snapshot/diff | **UC automatic lineage** |
| PII classification | DAMA | **UC tags** |
| RBAC | rbac_service | **UC grants** |
| LLM inference | Ollama | **Model Serving** (optional) |
| ETL | In-process Python | Future: Spark/DLT |

**Multi-source preservation:**
- Non-Databricks connections use app-owned services
- Databricks gets best-in-class support without forcing migration
- Customers can mix Databricks + traditional databases

---

## 🔒 Security

### Credentials

**Storage:**
- Access tokens stored encrypted (via SECRET_MANAGER_BACKEND)
- Never returned in API responses (redacted as `***`)
- Follows same pattern as other connector types

**Permissions:**
- Connector uses provided access token's permissions
- No privilege escalation
- Respects Unity Catalog grants

### Best Practices

✅ **DO:**
- Use personal access tokens for development
- Use service principal tokens for production
- Set token expiry appropriately
- Grant minimal permissions (SELECT on specific catalogs)
- Rotate tokens regularly

❌ **DON'T:**
- Commit tokens to git
- Share tokens between users
- Use admin tokens for DataOne connections
- Store tokens in plaintext config

---

## ⚙️ Configuration

### Environment Variables

```bash
# Required for Databricks LLM features only
DATABRICKS_WORKSPACE_URL=https://your-workspace.cloud.databricks.com
DATABRICKS_ACCESS_TOKEN=dapi...

# Optional: Use Databricks LLM instead of Ollama
DATABRICKS_USE_LLM=false

# Optional: Custom model endpoint
DATABRICKS_LLM_ENDPOINT=my-fine-tuned-model

# Optional: Genie space ID
DATABRICKS_GENIE_SPACE_ID=abc123
```

### Per-Connection Config

Each connection stores:
```json
{
  "server_hostname": "adb-xxx.azuredatabricks.net",
  "http_path": "/sql/1.0/warehouses/abc123",
  "access_token": "dapi...",  // Encrypted at rest
  "catalog": "main",          // Optional, defaults to "main"
  "schema": "default"         // Optional, defaults to "default"
}
```

---

## 🧪 Testing

### Unit Tests

Test the connector directly:

```python
from app.connectors.databricks_connector import DatabricksConnector

connector = DatabricksConnector(
    server_hostname="...",
    http_path="...",
    access_token="...",
    catalog="main",
    schema="default"
)

# Test connection
result = connector.test_connection()
assert result.success

# Get tables
tables = connector.get_tables()
assert len(tables) > 0

# Get schema
schema = connector.get_table_schema("my_table")
assert len(schema) > 0

connector.close()
```

### Integration Tests

Test via API:

```bash
# Create connection
CONNECTION_ID=$(curl -X POST http://localhost:8011/api/v1/connections \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test", "type": "databricks", "config": {...}}' \
  | jq -r '.id')

# Test connection
curl http://localhost:8011/api/v1/connections/$CONNECTION_ID/test \
  -H "Authorization: Bearer $TOKEN"

# Get schema
curl http://localhost:8011/api/v1/connections/$CONNECTION_ID/schema \
  -H "Authorization: Bearer $TOKEN"

# Execute query
curl -X POST http://localhost:8011/api/v1/query/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "connection_id": '$CONNECTION_ID',
    "sql": "SELECT * FROM my_table LIMIT 10"
  }'
```

### Error Cases

Test error handling:

```bash
# Invalid hostname
# → Returns: reachable=false, error_code="CONNECTION_REFUSED"

# Invalid token
# → Returns: authenticated=false, error_code="AUTH_FAILED"

# Nonexistent warehouse
# → Returns: database_accessible=false, error_code="WAREHOUSE_NOT_FOUND"

# Invalid catalog
# → Returns: database_accessible=false, error_code="CATALOG_UNAVAILABLE"
```

---

## 🐛 Troubleshooting

### Connection Fails

**Error:** `CONNECTION_REFUSED` or `CONNECTION_TIMEOUT`

**Causes:**
- SQL Warehouse is stopped
- Incorrect server hostname
- Network/firewall issue

**Solutions:**
1. Start SQL Warehouse in Databricks UI
2. Verify hostname format: `adb-xxx.azuredatabricks.net` (no `https://`)
3. Check DataOne can reach `*.databricks.net`

---

### Authentication Fails

**Error:** `AUTH_FAILED`

**Causes:**
- Invalid or expired access token
- Token doesn't have SQL Warehouse permissions

**Solutions:**
1. Generate new access token
2. Verify token has `sql:execute` permission
3. Check token hasn't expired

---

### Warehouse Not Found

**Error:** `WAREHOUSE_NOT_FOUND`

**Causes:**
- Incorrect HTTP path
- Warehouse deleted
- User doesn't have access to warehouse

**Solutions:**
1. Verify HTTP path format: `/sql/1.0/warehouses/abc123`
2. Check warehouse exists in Databricks UI
3. Grant user `CAN USE` on warehouse

---

### Catalog/Schema Issues

**Error:** `CATALOG_UNAVAILABLE`

**Causes:**
- Catalog name typo
- User doesn't have access
- Unity Catalog not enabled

**Solutions:**
1. Verify catalog name (case-sensitive!)
2. Run `SHOW CATALOGS` in SQL Warehouse to see accessible catalogs
3. Enable Unity Catalog in workspace settings

---

### Query Timeout

**Error:** Query times out or fails

**Causes:**
- Warehouse too small for query
- Query too complex
- Warehouse under heavy load

**Solutions:**
1. Use larger warehouse (Medium → Large)
2. Optimize query (add filters, use LIMIT)
3. Check warehouse metrics in Databricks UI

---

### Schema Discovery Slow

**Issue:** Getting tables takes too long

**Causes:**
- Many tables in schema
- Warehouse cold start
- Complex table structures

**Solutions:**
1. Specify schema explicitly (don't scan all)
2. Use serverless warehouse for instant startup
3. Cache results in DataOne (future feature)

---

## 📚 Additional Resources

### Documentation

- **Databricks SQL Connector:** https://docs.databricks.com/dev-tools/python-sql-connector.html
- **Databricks SDK:** https://databricks-sdk-py.readthedocs.io/
- **Unity Catalog:** https://docs.databricks.com/data-governance/unity-catalog/
- **SQL Warehouses:** https://docs.databricks.com/sql/admin/create-sql-warehouse.html

### DataOne Guides

- **Deployment Guide:** `DATABRICKS_DEPLOYMENT.md`
- **Quick Start:** `DATABRICKS_QUICKSTART.md`
- **Implementation Summary:** `DATABRICKS_IMPLEMENTATION_SUMMARY.md`
- **Assessment:** `databricks-native-assessment.html`

### Getting Help

1. Check logs: `docker logs dataone-backend`
2. Review this README
3. Test connection via Databricks SQL Editor first
4. Check Databricks workspace audit logs

---

## 🗺️ Roadmap

### Phase 1: Integration ✅ (Current)
- Databricks connector
- Unity Catalog support
- Basic query execution
- Column profiling
- Optional LLM integration

### Phase 2: Databricks App (Next)
- Package as Databricks Lakehouse App
- OAuth authentication
- Unity Catalog delegation (auto-lineage, PII tags)
- Marketplace listing
- RBAC mapping

### Phase 3: Performance (Future)
- Query execution via async statements
- ETL push-down to Spark/DLT
- Orchestration via Databricks Workflows
- Semantic layer with UC Metric Views

See `DATABRICKS_DEPLOYMENT.md` for detailed roadmap and timelines.

---

## 🤝 Contributing

When adding Databricks features:

1. **Preserve multi-source** - Don't break non-Databricks connectors
2. **Follow assessment** - Stick to the 4R strategy (Retire/Delegate/Adapt/Keep)
3. **Test thoroughly** - Add unit and integration tests
4. **Document changes** - Update this README and implementation summary
5. **Consider phases** - Don't implement Phase 3 features in Phase 1

---

## 📄 License

Same as DataOne core project.

---

**Version:** 1.0.0 (Phase 1)  
**Last Updated:** 2026-07-30  
**Status:** ✅ Production Ready (Phase 1 features)
