# Databricks Schema Mapper Integration - Complete Flow

## Overview

This document describes the complete implementation of the Databricks-integrated schema mapper flow, where catalogs and schemas are fetched from authenticated Databricks workspaces, ingestion pipelines are triggered on Databricks infrastructure, and metadata is automatically captured and displayed in the DataOne schema mapper.

## Architecture

```
User Auth (Databricks) 
    ↓
Fetch Catalogs/Schemas (Unity Catalog API)
    ↓
Select Source + Target (catalog.schema)
    ↓
Trigger Databricks Ingestion Pipeline
    ↓
Pipeline Ingests Data to Delta Lake
    ↓
Auto-Discovery: Fetch Table Metadata (Unity Catalog)
    ↓
Store in DataOne Schema Catalog
    ↓
Display in Schema Mapper UI
```

## Implementation Details

### 1. Backend: Metadata Capture After Ingestion

**File**: `backend/app/services/databricks_ingestion_service.py`

**Key Changes**:
- Added `_capture_ingestion_metadata()` method that runs automatically after successful ingestion
- Uses `UnityCatalogService` to discover tables in the target catalog/schema
- Stores metadata in DataOne's schema catalog via `SchemaCatalogService.store_table_metadata()`
- Integrated into the status polling logic in `get_run_status()`

**Flow**:
```python
# In get_run_status() when status becomes "succeeded":
if new_status == "succeeded":
    try:
        DatabricksIngestionService._capture_ingestion_metadata(
            run_record, db, user_token
        )
    except Exception as meta_err:
        logger.warning("Metadata capture failed (non-fatal)")
```

**Metadata Capture Process**:
1. Extract target catalog/schema from run parameters
2. Initialize Unity Catalog service with user token
3. List all tables in target catalog.schema
4. Filter tables by source database prefix
5. For each table:
   - Fetch full metadata including columns
   - Store in DataOne catalog with connection association
6. Update run record with table count

### 2. Backend: New API Endpoint for Ingested Tables

**File**: `backend/app/api/routers/databricks_ingest.py`

**New Endpoint**: `GET /api/v1/databricks/ingest/runs/{ingestion_run_id}/tables`

**Purpose**: Fetch the list of tables ingested by a specific pipeline run

**Response**:
```json
{
  "run_id": 123,
  "status": "succeeded",
  "target_catalog": "main",
  "target_schema": "dataone_ingested",
  "source_type": "mysql",
  "tables": [
    {
      "id": 456,
      "table_name": "main.dataone_ingested.mydb_users",
      "short_name": "mydb_users",
      "column_count": 12,
      "columns": [
        {
          "id": 789,
          "column_name": "user_id",
          "data_type": "BIGINT",
          "nullable": false,
          "is_primary_key": false
        }
      ]
    }
  ],
  "total": 5
}
```

### 3. Frontend: Enhanced Connector Page

**File**: `frontend/src/app/dashboard/connectors/page.tsx`

**Key Enhancements**:

#### A. Dynamic Catalog/Schema Fetching
- Added loading states (`loadingCatalogs`, `loadingSchemas`)
- Dropdowns show spinner during fetch
- Cascade behavior: selecting catalog loads its schemas
- Clear error messaging when authentication is required

```typescript
// Catalogs load when dbType === "databricks"
useEffect(() => {
  if (form.dbType === "databricks") {
    setLoadingCatalogs(true);
    api.get("/api/v1/databricks/ingest/catalogs")
      .then((res: any) => setCatalogs(res.catalogs || []))
      .finally(() => setLoadingCatalogs(false));
  }
}, [form.dbType]);

// Schemas load when catalog is selected
useEffect(() => {
  if (form.dbType === "databricks" && form.catalog) {
    setLoadingSchemas(true);
    api.get(`/api/v1/databricks/ingest/catalogs/${form.catalog}/schemas`)
      .then((res: any) => setSchemas(res.schemas || []))
      .finally(() => setLoadingSchemas(false));
  }
}, [form.catalog]);
```

#### B. Ingested Tables Display
After pipeline succeeds:
- Automatically fetches ingested tables
- Shows table grid with names and column counts
- Provides "Open in Schema Mapper" button with direct link

```typescript
// In polling callback when status === "succeeded":
const tablesResponse = await api.get(
  `/api/v1/databricks/ingest/runs/${runId}/tables`
);
setIngestedTables(tablesResponse.tables || []);
setShowIngestedTables(true);
```

#### C. UI Improvements
- Loading spinners in dropdowns
- Disabled states with helpful messages ("Select catalog first...")
- Authentication warning when no catalogs available
- Visual feedback for each stage of the flow

### 4. Frontend: Schema Mapper Integration

**File**: `frontend/src/app/dashboard/schema-mapper/page.tsx`

**Key Changes**:
- Added support for `run` query parameter (in addition to existing `conn` parameter)
- When `run` is provided, fetches tables from the ingestion run endpoint
- Automatically selects first table and displays its columns
- Seamless integration with existing mapper UI

```typescript
const runId = searchParams.get("run");

useEffect(() => {
  if (runId) {
    api.get(`/api/v1/databricks/ingest/runs/${runId}/tables`)
      .then(res => {
        // Format and display tables
        setTables(formattedTables);
        setSelectedTable(formattedTables[0]);
      });
  }
}, [runId]);
```

## Complete User Flow

### Step 1: Authentication
User authenticates with Databricks (OAuth token stored in `user.databricks_access_token`)

### Step 2: Navigate to Connectors Page
`/dashboard/connectors` → "New Connection" tab

### Step 3: Select Databricks as Target
- Choose "Database Connection" option
- In Target panel, select "Databricks Delta Lake"
- Catalogs dropdown automatically populates from authenticated workspace

### Step 4: Select Catalog and Schema
- Select catalog from dropdown (e.g., "main", "dev", custom catalog)
- Schemas dropdown populates based on selected catalog
- Select target schema (e.g., "dataone_ingested", "bronze", "silver")

### Step 5: Configure Source
- Select source database type (MySQL, PostgreSQL, etc.)
- Enter source credentials (host, port, database, username, password)

### Step 6: Trigger Ingestion
- Click "Establish Connection & Trigger Ingestion"
- System creates:
  1. Source connection in DataOne
  2. Databricks job (if not exists for this source type)
  3. Job run with parameters

### Step 7: Monitor Pipeline
- Status updates every 5 seconds
- Shows "pending" → "running" → "succeeded" or "failed"
- Databricks run URL provided for debugging

### Step 8: View Ingested Tables
- After success, tables automatically appear below status
- Shows table names and column counts
- "Open in Schema Mapper →" button available

### Step 9: Schema Mapper
- Click button or manually navigate with `?run={run_id}`
- Schema mapper loads all ingested tables
- Each table shows full column metadata
- Ready for mapping, transformation, and AI suggestions

## API Endpoints

### Existing Endpoints (Used)
- `GET /api/v1/databricks/ingest/catalogs` - List Unity Catalogs
- `GET /api/v1/databricks/ingest/catalogs/{catalog}/schemas` - List Schemas
- `POST /api/v1/databricks/ingest/trigger` - Trigger ingestion pipeline
- `GET /api/v1/databricks/ingest/runs/{id}` - Get run status

### New Endpoints
- `GET /api/v1/databricks/ingest/runs/{id}/tables` - Get ingested tables

### Supporting Endpoints
- `GET /api/v1/catalog/{connection_id}/tables` - Get catalog tables
- `POST /api/v1/catalog/scan/{connection_id}` - Trigger catalog scan

## Configuration Requirements

### Environment Variables
```bash
# Databricks Workspace
DATABRICKS_HOST=your-workspace.cloud.databricks.com
DATABRICKS_WORKSPACE_URL=https://your-workspace.cloud.databricks.com

# Authentication (choose one)
DATABRICKS_ACCESS_TOKEN=dapi...  # Personal Access Token
# OR
DATABRICKS_CLIENT_ID=...         # OAuth M2M
DATABRICKS_CLIENT_SECRET=...     # OAuth M2M
```

### User Requirements
- User must have Databricks OAuth token stored in database
- Token must have permissions:
  - Read Unity Catalog metadata
  - Create/run Databricks jobs
  - Write to target catalog/schema

## Testing Checklist

### Backend Tests
- [ ] Verify `_capture_ingestion_metadata()` runs after successful ingestion
- [ ] Check Unity Catalog tables are discovered correctly
- [ ] Confirm metadata stored in schema catalog with correct connection
- [ ] Test `/runs/{id}/tables` endpoint returns filtered tables
- [ ] Verify error handling when Unity Catalog is unavailable

### Frontend Tests
- [ ] Verify catalogs load when "Databricks" selected as target
- [ ] Confirm schemas populate after catalog selection
- [ ] Test loading states and spinners appear correctly
- [ ] Verify dropdowns are disabled appropriately
- [ ] Check authentication warning appears when no catalogs
- [ ] Confirm ingested tables display after pipeline success
- [ ] Test "Open in Schema Mapper" navigation
- [ ] Verify schema mapper loads tables from `?run=` parameter

### Integration Tests
- [ ] End-to-end: MySQL → Databricks → Schema Mapper
- [ ] Verify metadata persists across sessions
- [ ] Test with multiple source types
- [ ] Confirm catalog/schema from different Databricks workspaces
- [ ] Test error recovery when pipeline fails

## Troubleshooting

### Catalogs Not Loading
**Issue**: Dropdown shows "No catalogs available"
**Solutions**:
1. Check user has valid `databricks_access_token`
2. Verify `DATABRICKS_HOST` is configured
3. Check network connectivity to Databricks
4. Confirm Unity Catalog is enabled in workspace

### Metadata Not Captured
**Issue**: Pipeline succeeds but no tables in schema mapper
**Solutions**:
1. Check backend logs for metadata capture errors
2. Verify Unity Catalog service has correct credentials
3. Confirm target catalog/schema exists and is accessible
4. Check table naming matches expected pattern

### Schema Mapper Empty
**Issue**: Schema mapper loads but shows no tables
**Solutions**:
1. Verify `?run={id}` parameter is in URL
2. Check `/runs/{id}/tables` endpoint returns data
3. Confirm tables were written to target catalog/schema
4. Check connection association in database

## Future Enhancements

1. **Real-time Progress**: Stream ingestion progress from Databricks
2. **Table Preview**: Show sample data in connector page
3. **Schema Validation**: Pre-flight check before triggering pipeline
4. **Cost Estimation**: Estimate Databricks compute costs
5. **Multi-table Selection**: Choose specific tables to ingest
6. **Incremental Sync**: Support delta/incremental loads
7. **Lineage Visualization**: Show data flow from source to target

## Related Documentation

- [Databricks Deployment Guide](./DATABRICKS_DEPLOYMENT.md)
- [Unity Catalog Integration](./DATABRICKS_IMPLEMENTATION_SUMMARY.md)
- [Schema Mapper Documentation](./README.md#schema-mapper)
- [Testing Guide](./DATABRICKS_TESTING_GUIDE.md)

---

**Last Updated**: Current session  
**Branch**: `dataone`  
**Status**: ✅ Implementation Complete
