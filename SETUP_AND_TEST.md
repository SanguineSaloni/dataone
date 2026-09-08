# Setup and Test - Databricks Integration

**Quick start guide to set up and test Phase 1 of Databricks integration**

---

## 🎯 Goal

Validate that the Databricks connector works correctly without breaking existing functionality.

---

## ⏱️ Time Required

- **Basic Setup & Testing:** 15-20 minutes
- **With Real Databricks:** +10 minutes
- **Full UI Testing:** +10 minutes

**Total:** 35-40 minutes for complete validation

---

## 📋 Step-by-Step Instructions

### Step 1: Start Docker Desktop

1. Open **Docker Desktop** application on your Mac
2. Wait for Docker to start (whale icon in menu bar shows "Docker Desktop is running")
3. Verify:
   ```bash
   docker ps
   ```
   Should show running containers or empty list (not an error)

**Time:** 1-2 minutes

---

### Step 2: Rebuild Docker Images

The new Databricks dependencies need to be installed in the backend container.

```bash
cd "/Users/salonisidheshwar/Desktop/dataone/DataOne-main 2"

# Stop existing containers
docker compose down

# Rebuild backend with new dependencies
docker compose build backend backend-worker

# Start all services
docker compose up -d
```

**What's happening:**
- Docker reads `backend/requirements.txt` (which now includes `databricks-sql-connector` and `databricks-sdk`)
- Installs dependencies into the container
- Starts all services (backend, frontend, postgres, redis, celery)

**Time:** 3-5 minutes (depending on internet speed)

---

### Step 3: Verify Services Started

```bash
docker compose ps
```

**Expected output:**
```
NAME                    STATUS         PORTS
dataone-backend-1       running        0.0.0.0:8011->8000/tcp
dataone-backend-worker-1 running
dataone-broker-1        running        6379/tcp
dataone-frontend-1      running        0.0.0.0:3011->3000/tcp
dataone-postgres-1      running        5432/tcp
```

All services should show "running" status.

**If any service is not running:**
```bash
# Check logs
docker compose logs backend | tail -50

# Try restarting
docker compose restart
```

**Time:** 30 seconds

---

### Step 4: Check for Import Errors

Verify the Databricks connector imports successfully:

```bash
docker compose logs backend | grep -i "databricks\|modulenotfounderror\|importerror"
```

**Expected:** No errors (empty output is good!)

**If you see "ModuleNotFoundError: No module named 'databricks'":**
```bash
# Rebuild without cache
docker compose build --no-cache backend backend-worker
docker compose up -d
```

**Time:** 30 seconds (or 3-5 minutes if rebuild needed)

---

### Step 5: Run Automated Tests

Run the test script to validate basic functionality:

```bash
./test-databricks.sh
```

**Expected output:**
```
=== Testing Databricks Integration ===

0. Checking if services are running...
✅ Services running

1. Getting auth token...
✅ Got auth token

2. Checking connector catalog...
✅ Databricks in connector catalog

3. Testing validation...
✅ Validation working (rejected incomplete config)

4. Creating test connection...
✅ Created connection ID: 1

5. Testing connection health check...
✅ Error handling working correctly (graceful failure with fake credentials)
   Error code: CONNECTION_REFUSED

6. Testing Postgres connection...
✅ Postgres still works (no regression)

========================================
=== Test Summary ===
========================================
✅ Backend services running
✅ Authentication working
✅ Databricks connector registered
✅ Configuration validation working
✅ Connection creation working
✅ Error handling working
✅ No regressions in existing connectors

=== All Basic Tests Passed! ===
```

**Time:** 1-2 minutes

---

### Step 6: Test Frontend UI

**Open the application:**
```bash
open http://localhost:3011
```

**Login:**
- Username: `admin`
- Password: `admin123`

**Navigate to Connections:**
1. Click "**Connections**" in the left sidebar (or top menu)
2. Click "**New Connection**" or "**+**" button

**Verify Databricks integration:**

✅ **Check 1:** Databricks appears in the "Type" dropdown
- Look for "Databricks" option
- Should have 🧱 icon next to it

✅ **Check 2:** Selecting Databricks shows correct form fields:
- Server Hostname (text input)
- HTTP Path (text input)
- Access Token (password input)
- Catalog (text input, optional)
- Schema (text input, optional)

✅ **Check 3:** Try creating a test connection:
1. Name: "Test Databricks"
2. Type: Databricks
3. Server Hostname: `test.databricks.com`
4. HTTP Path: `/sql/1.0/warehouses/test`
5. Access Token: `fake-token`
6. Click "**Test Connection**"

**Expected:** Error message appears (connection failed) but UI doesn't crash

✅ **Check 4:** Click "**Save**" anyway (to test it saves)

**Expected:** Connection appears in the connections list with:
- Name: "Test Databricks"
- Type icon: 🧱
- Health status: "Down" or "Unknown" (expected with fake credentials)

**Time:** 3-5 minutes

---

### Step 7: Test with Real Databricks (Optional)

**If you have a Databricks workspace (even Community Edition):**

#### 7.1: Get Credentials

**Community Edition (Free):**
1. Go to https://community.cloud.databricks.com
2. Sign up or log in
3. Create a SQL Warehouse:
   - Click "**SQL Warehouses**" in sidebar
   - Click "**Create SQL Warehouse**"
   - Size: X-Small (free tier)
   - Wait for it to start

4. Get connection details:
   - Click your warehouse name
   - Go to "**Connection details**" tab
   - Copy:
     - **Server hostname**: `community.cloud.databricks.com` or `adb-xxx...`
     - **HTTP path**: `/sql/1.0/warehouses/abc123def456`

5. Get access token:
   - Click your user icon (top right)
   - Click "**User Settings**"
   - Click "**Access tokens**" tab
   - Click "**Generate new token**"
   - Comment: "DataOne Testing"
   - Lifetime: 90 days
   - Copy the token (you won't see it again!)

#### 7.2: Test Real Connection

**Via UI:**
1. In DataOne, create new connection
2. Type: Databricks
3. Fill in your real credentials
4. Click "**Test Connection**"

**Expected:** ✅ "Connection successful" (green checkmark)
- Should show version: "Databricks 13.3" or similar
- Latency: ~200-500ms

5. Click "**Save**"

**Via API:**
```bash
# Get token
TOKEN=$(curl -s -X POST http://localhost:8011/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}' \
  | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

# Create connection (replace with your credentials)
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

# Get the connection ID from response
CONNECTION_ID=2  # Use actual ID

# Test connection
curl http://localhost:8011/api/v1/connections/$CONNECTION_ID/test \
  -H "Authorization: Bearer $TOKEN" | jq

# Expected output:
# {
#   "status": "success",
#   "diagnostics": {
#     "version": "Databricks 13.3",
#     "latency_ms": 245,
#     "reachable": true,
#     "authenticated": true,
#     "database_accessible": true
#   }
# }

# Get schema (list tables)
curl http://localhost:8011/api/v1/connections/$CONNECTION_ID/schema \
  -H "Authorization: Bearer $TOKEN" | jq

# Execute a query
curl -X POST http://localhost:8011/api/v1/query/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"connection_id\": $CONNECTION_ID,
    \"sql\": \"SELECT current_catalog(), current_database(), current_version()\"
  }" | jq
```

**Time:** 10-15 minutes

---

### Step 8: Test Query Studio (Optional, with real connection)

If you have a real Databricks connection:

1. In DataOne UI, click "**Query Studio**" in sidebar
2. Select your Databricks connection from dropdown
3. You should see your catalogs/schemas/tables in the left panel
4. Write a query:
   ```sql
   SELECT current_catalog(), current_database(), current_version()
   ```
5. Press **Cmd+Enter** (or click Run)

**Expected:** Results display in the bottom panel showing your catalog, database, and Databricks version

**Try more queries:**
```sql
-- List tables
SHOW TABLES

-- Query a table (if you have one)
SELECT * FROM your_table LIMIT 10

-- Check catalogs
SHOW CATALOGS

-- Check schemas
SHOW SCHEMAS
```

**Time:** 5-10 minutes

---

## ✅ Success Checklist

Mark off each item as you complete it:

### Backend Tests
- [ ] Docker services running
- [ ] No import errors in logs
- [ ] Automated test script passes
- [ ] Databricks in connector catalog API
- [ ] Connection validation works
- [ ] Test connection with fake credentials returns proper error
- [ ] Postgres connection still works (no regression)

### Frontend Tests
- [ ] Can access UI at http://localhost:3011
- [ ] Databricks appears in connection type dropdown
- [ ] Databricks icon (🧱) displays
- [ ] Form fields render correctly
- [ ] Can create test connection
- [ ] Error messages display properly
- [ ] Connection appears in list

### Real Connection Tests (Optional)
- [ ] Connection test succeeds with real credentials
- [ ] Schema discovery lists actual tables
- [ ] Query execution works
- [ ] Query Studio shows tables
- [ ] Results display correctly

---

## 🐛 Troubleshooting

### Docker Won't Start

**Problem:** `docker ps` returns error

**Solution:**
- Open Docker Desktop application
- Wait for it to fully start
- Check for updates if it won't start

---

### Services Won't Start

**Problem:** `docker compose ps` shows services as "exited"

**Solution:**
```bash
# Check logs
docker compose logs backend

# Common issues:
# - Port already in use: Change ports in docker-compose.yml
# - Database migration failed: Delete volumes and restart
docker compose down -v
docker compose up -d
```

---

### Module Not Found Error

**Problem:** Logs show "ModuleNotFoundError: No module named 'databricks'"

**Solution:**
```bash
# Rebuild without cache
docker compose down
docker compose build --no-cache backend backend-worker
docker compose up -d

# Verify requirements.txt was updated
cat backend/requirements.txt | grep databricks
```

---

### Databricks Not in Dropdown

**Problem:** Frontend doesn't show Databricks option

**Solution:**
1. Check backend is running: `docker compose ps`
2. Check API endpoint: 
   ```bash
   curl http://localhost:8011/api/v1/connectors/types | jq
   ```
3. Clear browser cache and refresh
4. Check browser console for errors (F12)

---

### Connection Always Fails

**Problem:** Real Databricks credentials fail

**Solution:**
- Verify SQL Warehouse is **running** (not stopped)
- Check hostname format: `adb-xxx.azuredatabricks.net` (no `https://`)
- Verify HTTP path: `/sql/1.0/warehouses/abc123` (starts with `/`)
- Regenerate access token
- Check token has SQL Warehouse permissions

---

## 📊 Test Results

**Date:** _______________  
**Tester:** _______________  
**Environment:** macOS / Docker

### Test Results Summary

| Test Category | Status | Notes |
|--------------|--------|-------|
| Backend Services | ⬜ Pass / ⬜ Fail | |
| Automated Tests | ⬜ Pass / ⬜ Fail | |
| Frontend UI | ⬜ Pass / ⬜ Fail | |
| Real Connection | ⬜ Pass / ⬜ Fail / ⬜ Skipped | |
| Query Execution | ⬜ Pass / ⬜ Fail / ⬜ Skipped | |
| No Regressions | ⬜ Pass / ⬜ Fail | |

### Issues Found

1. _______________________________________
2. _______________________________________
3. _______________________________________

### Overall Result

⬜ **PASS** - Ready for Phase 2  
⬜ **PASS with Minor Issues** - Document and proceed  
⬜ **FAIL** - Needs fixes before proceeding

---

## 🎉 Next Steps

### If All Tests Pass ✅

**You're ready for Phase 2!**

See `DATABRICKS_QUICKSTART.md` for:
- OAuth authentication
- Unity Catalog delegation
- Databricks App packaging
- Marketplace submission

### If Some Tests Fail ⚠️

1. Document failures in test results above
2. Review troubleshooting section
3. Check `DATABRICKS_README.md` for additional help
4. Review Docker logs: `docker compose logs backend`
5. Ask for help with specific error messages

### For Production Use

Even if tests pass, before production:
- [ ] Generate strong `SECRET_KEY` (not default)
- [ ] Use service principal tokens (not personal)
- [ ] Set up monitoring and alerting
- [ ] Configure backup and disaster recovery
- [ ] Review security best practices
- [ ] Test with production data volume

---

## 📚 Additional Resources

- **DATABRICKS_README.md** - User guide and troubleshooting
- **DATABRICKS_TESTING_GUIDE.md** - Detailed testing procedures
- **DATABRICKS_DEPLOYMENT.md** - Full deployment guide
- **DATABRICKS_QUICKSTART.md** - Phase 2 roadmap
- **databricks-native-assessment.html** - Strategic assessment

---

**Happy Testing! 🧱**
