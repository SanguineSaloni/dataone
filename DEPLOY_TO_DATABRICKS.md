# Deploy DataOne to Databricks - Quick Guide

## ✅ Preparation Complete!

Your Docker images are built and ready:
- **Backend**: `docker.io/salonisidheshwar/dataone-backend:v1.0.0`
- **Frontend**: `docker.io/salonisidheshwar/dataone-frontend:v1.0.0`
- **App Manifest**: `databricks/app.yml` (updated with image URLs)

---

## 🚀 Next Steps: Deploy to Databricks

### Step 1: Go to Databricks Apps

1. Open your Databricks workspace: https://dbc-67a1a5fa-9eb9.cloud.databricks.com
2. Click **"App"** in the left sidebar
3. Click **"Create App"** or **"New App"**

### Step 2: Upload App Manifest

1. Select **"Upload manifest"** or **"Import from file"**
2. Upload this file:
   ```
   /Users/salonisidheshwar/Desktop/dataone/DataOne-main 2/databricks/app.yml
   ```

### Step 3: Configure App

**App Settings:**
- App Name: `dataone-test`
- Environment: `development`

**Secrets (Auto-generate these):**
- ✅ `SECRET_POSTGRES_PASSWORD` - Click "Generate"
- ✅ `SECRET_APP_SECRET_KEY` - Click "Generate"  
- ✅ `SECRET_JWT_SECRET_KEY` - Click "Generate"
- ⚠️  `SECRET_DATABRICKS_OAUTH_CLIENT_SECRET` - Will be provided after deployment

### Step 4: Review Services

You should see these 5 services:
- ✅ `postgres` - Database (10GB storage)
- ✅ `redis` - Cache (1GB storage)
- ✅ `backend` - API server (2 CPU, 4GB RAM)
- ✅ `worker` - Celery worker (2 CPU, 4GB RAM)
- ✅ `frontend` - UI (1 CPU, 1GB RAM)

### Step 5: Deploy!

1. Click **"Deploy"**
2. Wait 5-10 minutes for deployment
3. Watch logs for any errors

**Expected timeline:**
- Pulling images: 2-3 mins
- Starting postgres: 30 secs
- Starting redis: 20 secs
- Starting backend: 1 min
- Starting worker/beat: 30 secs
- Starting frontend: 30 secs

---

## 🔧 Post-Deployment: Configure OAuth

After deployment completes, Databricks will show:

### 1. Get OAuth Credentials

Look for:
- **OAuth Client ID**: `dbx-oauth-client-XXXXX`
- **OAuth Client Secret**: `dbx-secret-YYYYY`
- **App URL**: `https://dbc-67a1a5fa-9eb9.cloud.databricks.com/apps/dataone-test-XXXXX`

### 2. Update Environment Variables

1. Go to **App Settings** → **Environment Variables**
2. Add these:
   ```
   DATABRICKS_OAUTH_CLIENT_ID=<paste client ID>
   DATABRICKS_OAUTH_CLIENT_SECRET=<paste client secret>
   DATABRICKS_HOST=dbc-67a1a5fa-9eb9.cloud.databricks.com
   DATABRICKS_WORKSPACE_URL=https://dbc-67a1a5fa-9eb9.cloud.databricks.com
   DATABRICKS_NATIVE_MODE=true
   ENABLE_UNITY_CATALOG=true
   ENABLE_EXTERNAL_CONNECTORS=true
   ```

### 3. Restart App

- Click **"Restart"** to apply changes
- Wait 2-3 mins for restart

---

## 🧪 Test Your Deployment

### 1. Access the App

Open the app URL in your browser:
```
https://dbc-67a1a5fa-9eb9.cloud.databricks.com/apps/dataone-test-XXXXX
```

### 2. Test OAuth Login

- You should see the DataOne login page
- Click **"🧱 Sign in with Databricks"**
- Grant permissions when prompted
- You'll be redirected to the dashboard

### 3. Browse Unity Catalog

1. Go to **Connections** in the sidebar
2. Look for auto-created "Unity Catalog" connection
3. Click **Browse**
4. You should see your catalogs (e.g., `main`)
5. Expand to see schemas and tables

### 4. Test a Query

1. Go to **Query Studio**
2. Select your Unity Catalog connection
3. Run:
   ```sql
   SELECT * FROM main.default.your_table LIMIT 10
   ```

---

## 🐛 Troubleshooting

### Issue: Services won't start

**Check logs:**
```
App → dataone-test → Logs → Select service
```

**Common issues:**
- Postgres taking time to initialize (wait 2 mins)
- Backend waiting for postgres (normal, will retry)
- Image pull errors (check Docker Hub repo is public)

### Issue: OAuth not working

**Fix:**
1. Verify `DATABRICKS_OAUTH_CLIENT_ID` is set
2. Verify callback URL exactly matches:
   ```
   https://dbc-67a1a5fa-9eb9.cloud.databricks.com/apps/dataone-test-XXXXX/api/v1/auth/databricks/callback
   ```
3. Restart app after setting env vars

### Issue: "Method not allowed" when testing connection

**This is non-blocking:**
- OAuth login works (main flow)
- UI test button uses different endpoint
- Will be fixed in next version

### Issue: Images are private

**Make images public on Docker Hub:**
1. Go to https://hub.docker.com/repository/docker/salonisidheshwar/dataone-backend
2. Click Settings → Make Public
3. Do same for dataone-frontend
4. Redeploy app

---

## 📊 What You'll Have

After successful deployment:

✅ **DataOne UI** - Accessible via Databricks Apps URL
✅ **OAuth Login** - Sign in with Databricks button
✅ **Unity Catalog** - Browse your catalogs, schemas, tables
✅ **Multi-Source** - Can still connect PostgreSQL, MySQL, etc.
✅ **AI Mapping** - Schema mapping with LLM suggestions
✅ **Query Studio** - Execute SQL queries
✅ **Auto-Scaling** - Scales up to 5 backend replicas

---

## 🎯 Success Criteria

- [ ] App deployed successfully
- [ ] OAuth client ID/secret configured
- [ ] Can log in with "Sign in with Databricks"
- [ ] Can browse Unity Catalog
- [ ] Can execute queries
- [ ] Can create external connections (optional)

---

## 📞 Need Help?

**Databricks Support:**
- Check App logs in Databricks UI
- Review error messages
- Contact Databricks support if deployment fails

**DataOne Issues:**
- Check `PHASE2_IMPLEMENTATION_SUMMARY.md` for details
- Review `databricks/DEPLOYMENT_GUIDE.md` for full guide
- Look at error logs in App → Logs

---

## 🎉 Ready to Deploy!

Run through Steps 1-5 above, and you'll have DataOne running as a Databricks Lakehouse App in about 15 minutes!

**Your images are already built and pushed:** ✅
- docker.io/salonisidheshwar/dataone-backend:v1.0.0
- docker.io/salonisidheshwar/dataone-frontend:v1.0.0

**Just upload `databricks/app.yml` and click Deploy!** 🚀
