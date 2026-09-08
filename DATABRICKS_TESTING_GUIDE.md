# Databricks Integration - Testing Guide

**Phase 1 Testing Instructions**

Follow these steps to test the Databricks integration locally.

---

## Prerequisites

### 1. Docker Setup

**Start Docker Desktop:**
```bash
# Open Docker Desktop application on macOS
# Or start via command line (if configured)
open -a Docker
```

**Verify Docker is running:**
```bash
docker ps
# Should show running containers or empty list (not an error)
```

### 2. Databricks Credentials (Optional for Basic Testing)

For full testing, you'll need:
- **Databricks workspace** (free Community Edition: https://community.cloud.databricks.com)
- **SQL Warehouse** (create one in Compute → SQL Warehouses)
- **Access Token** (User Settings → Access Tokens → Generate New Token)

**Get Connection Details:**
1. Go to SQL Warehouses
2. Click your warehouse
3. Click "Connection details" tab
4. Copy:
   - Server hostname: `adb-xxx.azuredatabricks.net`
   - HTTP path: `/sql/1.0/warehouses/abc123`

---

## Testing Steps

### Step 1: Rebuild Docker Images

The new Databricks dependencies need to be installed in the Docker containers.

```bash
cd "/Users/salonisidheshwar/Desktop/dataone/DataOne-main 2"

# Stop existing containers (if running)
docker compose down

# Rebuild backend with new dependencies
docker compose build backend backend-worker

# Start all services
docker compose up -d
```

**Verify services started:**
```bash
docker compose ps
```

You should see:
- `backend` (port 8011)
- `frontend` (port 3011)
- `postgres` (port 5432)
- `broker` (Redis)
- `backend-worker` (Celery)

**Check backend logs for import errors:**
```bash
docker compose logs backend | grep -i "databricks\|error\|failed"
```

If you see import errors, the dependencies didn't install. Try:
```bash
docker compose build --no-cache backend backend-worker
docker compose up -d
```

---

### Step 2: Test Backend API

**Check connector catalog includes Databricks:**

```bash
# Get API token (default admin credentials)
TOKEN=$(curl -s -X POST http://localhost:8011/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}' \
  | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

echo "Token: $TOKEN"

# List connector types
curl -s http://localhost:8011/api/v1/connectors/types \
  -H "Authorization: Bearer $TOKEN" | jq
```

**Expected output should include:**
```json
{
  "databricks": {
    "name": "Databricks",
    "type": "databricks",
    "category": "warehouse",
    "icon": "databricks",
    "description": "Databricks SQL Warehouse with Unity Catalog support",
    "fields": [
      {
        "key": "server_hostname",
        "label": "Server Hostname",
        "type": "text",
        "required": true,
        ...
      }
    ]
  }
}
```

**✅ Success Criteria:** Databricks appears in connector types list

---

### Step 3: Test Connector Validation

**Test with invalid config (should fail gracefully):**

```bash
curl -X POST http://localhost:8011/api/v1/connections \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Invalid Databricks",
    "type": "databricks",
    "config": {
      "server_hostname": "test"
    }
  }'
```

**Expected:** Validation error saying `http_path` and `access_token` are required

**✅ Success Criteria:** Validation rejects incomplete config

---

### Step 4: Create Test Connection (Dry Run)

**With fake credentials (will fail to connect, but tests instantiation):**

```bash
curl -X POST http://localhost:8011/api/v1/connections \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Databricks",
    "type": "databricks",
    "config": {
      "server_hostname": "test.cloud.databricks.com",
      "http_path": "/sql/1.0/warehouses/test123",
      "access_token": "fake-token-for-testing",
      "catalog": "main",
      "schema": "default"
    }
  }' | jq
```

**Expected:** Connection created successfully (ID returned)

**Save the connection ID:**
```bash
CONNECTION_ID=1  # Use the ID from the response
```

**✅ Success Criteria:** Connection created without errors

---

### Step 5: Test Connection Health Check

**Test the connection (will fail, but validates error handling):**

```bash
curl http://localhost:8011/api/v1/connections/$CONNECTION_ID/test \
  -H "Authorization: Bearer $TOKEN" | jq
```

**Expected response:**
```json
{
  "status": "error",
  "diagnostics": {
    "reachable": false,
    "authenticated": false,
    "database_accessible": false,
    "version": null,
    "latency_ms": null
  },
  "error": {
    "code": "CONNECTION_REFUSED",
    "message": "..."
  }
}
```

**✅ Success Criteria:** Error is classified correctly (not a 500 error)

---

### Step 6: Frontend Testing

**Open the frontend:**
```bash
open http://localhost:3011
```

**Login:**
- Username: `admin`
- Password: `admin123`

**Navigate to Connections:**
1. Click "Connections" in sidebar
2. Click "New Connection" or "+"

**Verify Databricks appears:**
- [ ] Databricks is in the type dropdown
- [ ] Icon is 🧱
- [ ] Selecting it shows the correct form fields:
  - Server Hostname (text)
  - HTTP Path (text)
  - Access Token (password)
  - Catalog (text, optional)
  - Schema (text, optional)

**Try creating a connection via UI:**
1. Fill in fake values
2. Click "Test Connection"
3. Should show error (expected with fake credentials)
4. Should NOT crash the UI

**✅ Success Criteria:** 
- Form renders correctly
- Validation works
- Error displayed properly

---

### Step 7: Test with Real Databricks (If Available)

**If you have Databricks Community Edition access:**

**Create real connection:**
```bash
curl -X POST http://localhost:8011/api/v1/connections \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Databricks",
    "type": "databricks",
    "config": {
      "server_hostname": "community.cloud.databricks.com",
      "http_path": "/sql/1.0/warehouses/YOUR_WAREHOUSE_ID",
      "access_token": "YOUR_ACTUAL_TOKEN",
      "catalog": "main",
      "schema": "default"
    }
  }' | jq
```

**Test connection:**
```bash
CONNECTION_ID=2  # Use the actual ID
curl http://localhost:8011/api/v1/connections/$CONNECTION_ID/test \
  -H "Authorization: Bearer $TOKEN" | jq
```

**Expected (success):**
```json
{
  "status": "success",
  "diagnostics": {
    "reachable": true,
    "authenticated": true,
    "database_accessible": true,
    "version": "Databricks 13.3",
    "latency_ms": 245
  }
}
```

**Get schema:**
```bash
curl http://localhost:8011/api/v1/connections/$CONNECTION_ID/schema \
  -H "Authorization: Bearer $TOKEN" | jq
```

**Expected:** List of tables and columns from your Databricks workspace

**Execute query:**
```bash
curl -X POST http://localhost:8011/api/v1/query/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"connection_id\": $CONNECTION_ID,
    \"sql\": \"SELECT current_catalog(), current_database(), current_version()\"
  }" | jq
```

**Expected:** Query results showing your catalog, database, and Databricks version

**✅ Success Criteria:** All operations succeed with real credentials

---

### Step 8: Test Multi-Source (No Regression)

**Create a Postgres connection:**
```bash
curl -X POST http://localhost:8011/api/v1/connections \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Postgres",
    "type": "postgres",
    "config": {
      "host": "postgres",
      "port": 5432,
      "dbname": "dataone",
      "user": "postgres",
      "password": "postgres"
    }
  }' | jq
```

**Test Postgres connection:**
```bash
PG_CONNECTION_ID=3  # Use actual ID
curl http://localhost:8011/api/v1/connections/$PG_CONNECTION_ID/test \
  -H "Authorization: Bearer $TOKEN" | jq
```

**Expected:** Postgres connection still works (success)

**✅ Success Criteria:** Non-Databricks connectors unaffected

---

### Step 9: Error Handling Tests

**Test various error scenarios with Databricks:**

**Invalid hostname:**
```bash
curl -X POST http://localhost:8011/api/v1/connections \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Bad Hostname",
    "type": "databricks",
    "config": {
      "server_hostname": "invalid.doesnotexist.com",
      "http_path": "/sql/1.0/warehouses/test",
      "access_token": "fake"
    }
  }'
```

Test connection → Should return `CONNECTION_REFUSED`

**Invalid token (with real hostname if available):**
```bash
curl -X POST http://localhost:8011/api/v1/connections \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Bad Token",
    "type": "databricks",
    "config": {
      "server_hostname": "community.cloud.databricks.com",
      "http_path": "/sql/1.0/warehouses/test",
      "access_token": "invalid-token"
    }
  }'
```

Test connection → Should return `AUTH_FAILED`

**✅ Success Criteria:** Each error classified correctly

---

## Test Results Checklist

### Backend
- [ ] Databricks dependencies installed in Docker image
- [ ] Connector imports without errors
- [ ] Databricks appears in connector catalog
- [ ] Validation rejects invalid configs
- [ ] Connection creation succeeds
- [ ] Test connection handles errors gracefully
- [ ] Error classification works (CONNECTION_REFUSED, AUTH_FAILED, etc.)

### Frontend
- [ ] Databricks appears in connection type dropdown
- [ ] Icon displays correctly (🧱)
- [ ] Form fields render properly
- [ ] Validation works
- [ ] Error messages display correctly
- [ ] No UI crashes

### With Real Credentials (Optional)
- [ ] Connection test succeeds
- [ ] Schema discovery lists tables
- [ ] Column metadata retrieved
- [ ] Query execution works
- [ ] Results display correctly
- [ ] Column profiling works

### Multi-Source
- [ ] Postgres connections still work
- [ ] MySQL connections still work (if tested)
- [ ] No regressions in existing features
- [ ] Schema catalog works for non-Databricks

### Error Handling
- [ ] Invalid hostname → CONNECTION_REFUSED
- [ ] Invalid token → AUTH_FAILED
- [ ] Nonexistent warehouse → WAREHOUSE_NOT_FOUND
- [ ] Invalid catalog → CATALOG_UNAVAILABLE
- [ ] Errors don't crash backend (500 errors)

---

## Troubleshooting

### Docker Image Build Fails

**Symptom:** `databricks` module not found

**Solution:**
```bash
# Clear Docker cache and rebuild
docker compose down
docker system prune -a
docker compose build --no-cache backend backend-worker
docker compose up -d
```

### Import Errors

**Symptom:** Backend logs show `ModuleNotFoundError: No module named 'databricks'`

**Solution:**
Check if requirements.txt is being copied to Docker image:
```bash
# Check Dockerfile
cat backend/Dockerfile | grep requirements.txt

# Verify requirements.txt has the dependencies
cat backend/requirements.txt | grep databricks
```

### Connection Timeout

**Symptom:** All Databricks connections time out

**Solution:**
- Verify SQL Warehouse is running in Databricks UI
- Check network connectivity: `ping community.cloud.databricks.com`
- Verify Docker container can reach external networks

### Token Authentication Fails

**Symptom:** AUTH_FAILED even with valid token

**Solution:**
- Regenerate token in Databricks
- Verify token has `sql:execute` permission
- Check token hasn't expired

---

## Quick Test Script

**Run all basic tests at once:**

```bash
#!/bin/bash
# Save as test-databricks.sh

cd "/Users/salonisidheshwar/Desktop/dataone/DataOne-main 2"

echo "=== Testing Databricks Integration ==="

# 1. Get token
echo "1. Getting auth token..."
TOKEN=$(curl -s -X POST http://localhost:8011/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}' \
  | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ Failed to get auth token"
  exit 1
fi
echo "✅ Got auth token"

# 2. Check connector types
echo "2. Checking connector catalog..."
DATABRICKS=$(curl -s http://localhost:8011/api/v1/connectors/types \
  -H "Authorization: Bearer $TOKEN" | grep databricks)

if [ -z "$DATABRICKS" ]; then
  echo "❌ Databricks not in connector catalog"
  exit 1
fi
echo "✅ Databricks in connector catalog"

# 3. Test validation
echo "3. Testing validation..."
VALIDATION=$(curl -s -X POST http://localhost:8011/api/v1/connections \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","type":"databricks","config":{"server_hostname":"test"}}' \
  | grep -o "required")

if [ -z "$VALIDATION" ]; then
  echo "❌ Validation not working"
  exit 1
fi
echo "✅ Validation working"

# 4. Create test connection
echo "4. Creating test connection..."
CONN_RESPONSE=$(curl -s -X POST http://localhost:8011/api/v1/connections \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Databricks",
    "type": "databricks",
    "config": {
      "server_hostname": "test.cloud.databricks.com",
      "http_path": "/sql/1.0/warehouses/test",
      "access_token": "fake-token",
      "catalog": "main",
      "schema": "default"
    }
  }')

CONNECTION_ID=$(echo $CONN_RESPONSE | grep -o '"id":[0-9]*' | cut -d':' -f2)

if [ -z "$CONNECTION_ID" ]; then
  echo "❌ Failed to create connection"
  echo $CONN_RESPONSE
  exit 1
fi
echo "✅ Created connection ID: $CONNECTION_ID"

# 5. Test connection (expected to fail)
echo "5. Testing connection (expect failure with fake creds)..."
TEST_RESPONSE=$(curl -s http://localhost:8011/api/v1/connections/$CONNECTION_ID/test \
  -H "Authorization: Bearer $TOKEN")

if echo "$TEST_RESPONSE" | grep -q "CONNECTION_REFUSED\|AUTH_FAILED\|error"; then
  echo "✅ Error handling working (expected failure)"
else
  echo "⚠️  Unexpected response:"
  echo $TEST_RESPONSE
fi

# 6. Test Postgres (no regression)
echo "6. Testing Postgres (no regression)..."
PG_RESPONSE=$(curl -s -X POST http://localhost:8011/api/v1/connections \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test PG",
    "type": "postgres",
    "config": {
      "host": "postgres",
      "port": 5432,
      "dbname": "dataone",
      "user": "postgres",
      "password": "postgres"
    }
  }')

PG_ID=$(echo $PG_RESPONSE | grep -o '"id":[0-9]*' | cut -d':' -f2)

if [ -z "$PG_ID" ]; then
  echo "❌ Postgres connection failed (REGRESSION!)"
  exit 1
fi
echo "✅ Postgres still works (no regression)"

echo ""
echo "=== All Basic Tests Passed! ==="
echo ""
echo "Next steps:"
echo "1. Open http://localhost:3011 and test the UI"
echo "2. If you have Databricks credentials, test with real connection"
echo "3. Review DATABRICKS_TESTING_LOG.md for detailed results"
```

**Run it:**
```bash
chmod +x test-databricks.sh
./test-databricks.sh
```

---

## Next Steps After Testing

### If All Tests Pass ✅
- Update `DATABRICKS_TESTING_LOG.md` with results
- Mark Phase 1 as complete
- Decide: Proceed to Phase 2 or use in production

### If Tests Fail ❌
- Review error messages in Docker logs: `docker compose logs backend`
- Check specific failing test
- Review troubleshooting section above
- Update code if needed

### For Production Deployment
- Generate strong SECRET_KEY
- Use real Databricks service principal tokens
- Set up proper monitoring
- Review security best practices in `DATABRICKS_README.md`

---

**Good luck with testing! 🚀**
