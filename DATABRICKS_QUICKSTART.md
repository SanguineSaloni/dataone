# DataOne → Databricks: Quick Start Checklist

## 🎯 Goal
Deploy DataOne to Databricks Marketplace so users can:
1. Find DataOne in the Marketplace
2. Click "Install"
3. Get redirected to hosted DataOne UI
4. Use all DataOne features with their Databricks data

## 📋 Pre-Flight Checklist

### Account Setup
- [ ] Create Databricks Community Edition account (free): https://community.cloud.databricks.com
- [ ] Generate personal access token (User Settings → Access Tokens)
- [ ] Start a SQL Warehouse (Compute → SQL Warehouses)
- [ ] Optional: Enable Unity Catalog (if available in your workspace)

### Local Development Setup
- [ ] Clone DataOne repository
- [ ] Install Docker Desktop
- [ ] Install Python 3.11+
- [ ] Install Node.js 18+

## 🚀 Phase 1: Integration (Start Here - Free Account Compatible)

### Week 1-2: Databricks Connector

**Step 1:** Install Databricks SDK
```bash
cd backend
pip install databricks-sql-connector databricks-sdk
pip freeze > requirements.txt
```

**Step 2:** Create connector file
- Create `backend/app/connectors/databricks_connector.py`
- Copy code from `DATABRICKS_DEPLOYMENT.md` section 1.2

**Step 3:** Register connector
- Edit `backend/app/services/connector_catalog.py`
- Add `databricks` to `CONNECTOR_TYPES`

**Step 4:** Frontend form
- Create `frontend/src/components/connections/DatabricksForm.tsx`
- Add Databricks option to connection selector

**Step 5:** Test locally
```bash
# Terminal 1: Backend
cd backend
uvicorn app.main:app --reload

# Terminal 2: Frontend
cd frontend
npm run dev

# Terminal 3: Redis & Postgres
docker-compose up postgres redis
```

**Test checklist:**
- [ ] New connection shows "Databricks SQL Warehouse" option
- [ ] Connection form accepts hostname, http_path, token
- [ ] Test connection succeeds
- [ ] Schema discovery lists your Databricks tables
- [ ] Query execution returns results

### Week 3-4: LLM Integration

**Step 1:** Modify AI service
- Edit `backend/app/services/ai_service.py`
- Add Databricks Model Serving option
- Keep Ollama as fallback

```python
def get_llm_provider(self):
    if os.getenv("USE_DATABRICKS_LLM") == "true":
        return DatabricksFoundationAPI(
            host=os.getenv("DATABRICKS_HOST"),
            token=os.getenv("DATABRICKS_TOKEN")
        )
    return OllamaProvider()
```

**Step 2:** Test Agentic DBA with Databricks LLM
- [ ] Ask DBA feature works
- [ ] Responses come from Databricks Model Serving
- [ ] Fallback to Ollama if Databricks unavailable

**Milestone 1 Complete:**
- [ ] DataOne can connect to Databricks
- [ ] Users can query Databricks data through DataOne
- [ ] AI features work with Databricks LLMs
- **Decision point:** Proceed to Phase 2 if customer demand confirmed

---

## 🏢 Phase 2: Databricks App (Marketplace Ready)

### Prerequisites
- [ ] Phase 1 completed and tested
- [ ] Container registry account (Azure CR, ECR, or GCR)
- [ ] Request Databricks partner workspace (email: partner-connect@databricks.com)

### Month 2: OAuth & Unity Catalog

**Week 1-2: OAuth Implementation**

**Step 1:** Create auth service
- Create `backend/app/services/databricks_auth_service.py`
- Implement OAuth token verification
- Map UC permissions to DataOne roles

**Step 2:** Add middleware
- Create `backend/app/api/middleware/databricks_auth.py`
- Protect all endpoints with OAuth

**Step 3:** Update frontend
- Detect Databricks environment
- Use OAuth flow instead of local JWT
- Store token in session

**Test:**
- [ ] OAuth flow works in partner workspace
- [ ] User permissions mapped correctly
- [ ] Admin/analyst/viewer roles enforced

**Week 3-4: Unity Catalog Delegation**

**Step 1:** Create UC service
- Create `backend/app/services/unity_catalog_service.py`
- Implement catalog/schema/table listing
- Add lineage API integration
- Read UC tags for PII classification

**Step 2:** Route based on connection type
- Edit `backend/app/services/schema_catalog_service.py`
- If connection is Databricks → use UC
- If connection is other → use app catalog

**Test:**
- [ ] Databricks catalogs visible
- [ ] Schema discovery uses UC metadata
- [ ] Lineage shows in DataOne UI
- [ ] PII tags from UC displayed
- [ ] Non-Databricks connections still work (multi-source preserved)

### Month 3: Containerization

**Week 1-2: Build Images**

**Step 1:** Create Dockerfiles
- Create `databricks/backend.Dockerfile`
- Create `databricks/frontend.Dockerfile`
- Add health checks

**Step 2:** Build locally
```bash
docker build -f databricks/backend.Dockerfile -t dataone-backend:test .
docker build -f databricks/frontend.Dockerfile -t dataone-frontend:test .

# Test containers
docker run -p 8000:8000 dataone-backend:test
docker run -p 3000:3000 dataone-frontend:test
```

**Step 3:** Push to registry
```bash
# Example: Azure Container Registry
az acr login --name yourregistry
docker tag dataone-backend:test yourregistry.azurecr.io/dataone-backend:1.0.0
docker push yourregistry.azurecr.io/dataone-backend:1.0.0
```

**Week 3-4: App Manifest**

**Step 1:** Create app.yml
- Create `databricks/app.yml`
- Define services (backend, frontend, postgres, redis)
- Configure OAuth scopes
- Set resource limits

**Step 2:** Deploy to partner workspace
```bash
databricks apps deploy \
  --app-config databricks/app.yml \
  --workspace-url https://your-partner-workspace.cloud.databricks.com
```

**Test:**
- [ ] App deploys successfully
- [ ] All services start (check logs)
- [ ] Health checks pass
- [ ] Can access UI through workspace
- [ ] OAuth redirects work
- [ ] Full functionality available

### Month 4: Marketplace Submission

**Week 1: Prepare Assets**

**Step 1:** Create listing materials
- [ ] Logo (512x512 PNG)
- [ ] Icon (128x128 PNG)
- [ ] Screenshots (at least 3)
- [ ] Demo video (3-5 minutes, upload to YouTube)

**Step 2:** Write documentation
- Create `marketplace/listing.json`
- Create `marketplace/INSTALLATION.md`
- Create `marketplace/SECURITY.md`
- Include clear steps for installation

**Step 3:** Security review
- [ ] Vulnerability scan on containers
- [ ] Penetration test (if required)
- [ ] Compliance checklist (SOC 2, GDPR)

**Week 2-3: Submit to Portal**

**Step 1:** Access partner portal
- Go to https://partner.databricks.com
- Navigate to Marketplace submission

**Step 2:** Upload materials
- [ ] App manifest (app.yml)
- [ ] Container images (registry URLs)
- [ ] Listing details (listing.json)
- [ ] Documentation
- [ ] Demo video link
- [ ] Support contact

**Step 3:** Validation
- Databricks will review (2-4 weeks)
- Address any feedback
- Resubmit if needed

**Week 4: Beta Program**

**Step 1:** Invite beta testers
- [ ] 3-5 friendly customers
- [ ] Install from Marketplace (preview mode)
- [ ] Gather feedback

**Step 2:** Iterate
- Fix bugs
- Improve UX based on feedback
- Update documentation

**Milestone 2 Complete:**
- [ ] DataOne listed in Databricks Marketplace
- [ ] Users can install with one click
- [ ] OAuth authentication working
- [ ] Unity Catalog integrated
- [ ] Multi-source support preserved
- [ ] Beta customers using successfully
- **Decision point:** Monitor adoption before Phase 3

---

## ⚡ Phase 3: Selective Native (Performance Optimization)

**Only proceed if:**
- Phase 2 stable for 3+ months
- Customer feedback shows performance bottlenecks
- ETL pipelines > 10GB timing out
- Query execution hitting limits

### Month 5-6: ETL Push-down

**Step 1:** Analyze bottlenecks
- Identify which pipelines are slow
- Measure: in-process Python vs. potential Spark
- Calculate ROI

**Step 2:** Implement Spark generator
- Create `backend/app/services/databricks_pipeline_executor.py`
- Convert mapping grammar to Spark SQL
- Test with large datasets

**Step 3:** Orchestration migration
- Move scheduled pipelines to Databricks Workflows
- Keep Celery for app-tier tasks
- Provide migration tool for existing pipelines

**Test:**
- [ ] Large pipelines 10x+ faster
- [ ] Databricks Jobs visible in Workflows UI
- [ ] Monitoring/alerting working
- [ ] Backward compatibility maintained

---

## 🎯 Success Criteria

### Phase 1 (Integration)
- **Goal:** Databricks data accessible in DataOne
- **Metric:** 10+ internal test scenarios pass
- **Timeline:** 1-2 months
- **Risk:** Low

### Phase 2 (Marketplace)
- **Goal:** Listed in Marketplace, customers can install
- **Metric:** 10+ customer installations, 80%+ satisfaction
- **Timeline:** 3-4 months from Phase 1 complete
- **Risk:** Medium

### Phase 3 (Native)
- **Goal:** Performance at Spark scale
- **Metric:** 10x ETL speedup, 50%+ adoption of native features
- **Timeline:** 3-4 months from Phase 2 stable
- **Risk:** High

---

## 🆘 Troubleshooting

### Community Edition Limitations
**Issue:** Can't test Unity Catalog
**Solution:** Develop fallback logic; request partner workspace for UC testing

**Issue:** SQL Warehouse auto-stops
**Solution:** Keep queries short; restart as needed; optimize for quick tests

### OAuth Issues
**Issue:** Token validation fails
**Solution:** Ensure workspace URL correct; check token hasn't expired

### Container Build Fails
**Issue:** Dependencies conflict
**Solution:** Pin versions in requirements.txt; use multi-stage builds

### Marketplace Rejection
**Issue:** Security concerns
**Solution:** Address all feedback; provide security attestation; iterate

---

## 📞 Support & Resources

### Databricks Support
- **Partner Portal:** https://partner.databricks.com
- **Partner Connect:** partner-connect@databricks.com
- **Documentation:** https://docs.databricks.com/lakehouse-apps/

### DataOne Development
- **Detailed Guide:** See `DATABRICKS_DEPLOYMENT.md`
- **Assessment:** See `databricks-native-assessment.html`
- **Architecture:** See `README.md`

### Getting Help
- Databricks Partner Slack (request access)
- Databricks Community Forums
- Your account team (if Enterprise customer)

---

## 🎓 Key Principles (from Assessment)

1. **Multi-source is non-negotiable**
   - Databricks is one backend, not the only one
   - Keep app-owned catalog as fallback

2. **Phased and reversible**
   - Each phase independently valuable
   - Can roll back if needed

3. **Delegate infrastructure, keep intelligence**
   - Let Databricks handle compute/storage/catalog
   - Invest in workflow intelligence (agentic DBA, mapping, governance)

4. **The partnership is co-opetition**
   - Databricks is building many features we DELEGATE
   - Our defensible position: cross-source workflow layer

---

## ✅ Your First Action Items (This Week)

1. [ ] Create Databricks Community Edition account
2. [ ] Generate access token
3. [ ] Review `DATABRICKS_DEPLOYMENT.md` section 1
4. [ ] Install `databricks-sql-connector` in backend
5. [ ] Create `databricks_connector.py` file
6. [ ] Test connection locally

**Time estimate:** 4-6 hours for first working connection

Good luck! 🚀
