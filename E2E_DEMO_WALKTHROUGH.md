# DataOne End-to-End Demo Walkthrough

This guide walks you through creating a full end-to-end data integration on the DataOne platform — from selecting source and target tables, creating a mapping, publishing it, building a pipeline, and executing it.

---

## 1. Seeded Demo Databases

The application seeds **5 physical SQLite databases** at startup, plus the E2E retail dataset. Each is registered as a `DBConnection` so they appear in the UI.

| DBConnection Name | Type | Tables | Row Counts | Best For |
|---|---|---|---|---|
| `CRM_Source_Analytics` | sqlite | accounts, contacts, opportunities, activities, cases | ~85 rows | Source: B2B CRM export |
| `Data_Warehouse_Target` | sqlite | dim_customer, dim_product, dim_date, dim_sales_rep, fact_revenue, fact_support | ~1,000 rows | Target: Star-schema DW |
| `ECommerce_MySQL` | sqlite | products, customers, orders, order_items, reviews | ~1,100 rows | Source: Online store |
| `Finance_Oracle` | oracle (simulated) | chart_of_accounts, transactions, invoices, invoice_line_items, budget_allocations | ~2,000 rows | Source: GL/Finance |
| `HR_Postgres` | sqlite (simulates postgres) | employees, departments, payroll, attendance, performance_reviews | ~25,000 rows | Source: HR/Payroll |
| `E2E_Retail_Analytics` | sqlite | analytics_customers, analytics_products, analytics_orders, analytics_support_tickets | ~2,000 rows | Source: Messy retail data |
| `E2E_Retail_Warehouse` | sqlite | dim_customer, dim_product, fact_order, fact_support_ticket, order_status_snapshot | 0 rows (empty) | Target: Clean warehouse |

---

## 2. Recommended Source → Target Mapping Scenarios

### Scenario A: CRM Source → Data Warehouse (Best for first demo)

Map the CRM pipeline into the star-schema DW — the most natural pair since the DW was designed to receive CRM data.

| Source Table (CRM_Source_Analytics) | Target Table (Data_Warehouse_Target) | Mapping Logic |
|---|---|---|
| `accounts` | `dim_customer` | 1:1 — rename columns |
| `opportunities` | `dim_product` | AI match by industry → product category |
| — (auto-generated) | `dim_date` | Date dimension already populated |
| `accounts.sales_rep` → `contacts` | `dim_sales_rep` | Extract rep from contacts |
| `opportunities` + `accounts` | `fact_revenue` | Join on account_id, calculate net_amount |
| `cases` | `fact_support` | Map case severity/status to fact_support |

**Example column mappings for `accounts → dim_customer`:**

| Source Column | Target Column | Transformation |
|---|---|---|
| `account_id` | `customer_key` | Direct (rename) |
| `name` | `customer_name` | Direct |
| `industry` | `industry` | Direct |
| `city, state` | `region` | Concatenate → "North America" |
| `annual_revenue` | `segment` | Lookup: >500M → "Enterprise", else "SMB" |
| `employee_count` | `is_active` | >0 → 1 |
| `created_at` | `dw_created_at` | Direct |

### Scenario B: ECommerce MySQL → Custom Target (Good for aggregation demos)

| Source Table (ECommerce_MySQL) | Target Table | Mapping Logic |
|---|---|---|
| `customers` | `dw_customer_summary` | Aggregate: total_orders, lifetime_value |
| `orders` + `order_items` | `dw_order_facts` | Join on order_id |
| `products` | `dw_product_catalog` | Direct mapping |
| `reviews` | `dw_product_reviews` | Include rating, review text |

### Scenario C: HR Postgres → HR Analytics Warehouse

| Source Table (HR_Postgres) | Target Table | Mapping Logic |
|---|---|---|
| `employees` | `dim_employee` | Direct mapping |
| `departments` | `dim_department` | Direct mapping |
| `payroll` | `fact_compensation` | Aggregate monthly → quarterly |
| `attendance` | `fact_attendance` | Direct mapping |
| `performance_reviews` | `fact_performance` | Extract category_scores JSON |

### Scenario D: E2E Retail → E2E Retail Warehouse (Messy data / PII / Drift)

| Source Table (E2E_Retail_Analytics) | Target Table (E2E_Retail_Warehouse) | Mapping Logic |
|---|---|---|
| `analytics_customers` | `dim_customer` | 1:1 rename; handle dup emails |
| `analytics_products` | `dim_product` | 1:1 rename |
| `analytics_orders` | `fact_order` | Calculate discount_percent, tender_type mapping |
| `analytics_support_tickets` | `fact_support_ticket` | 1:1 rename |
| `analytics_orders` | `order_status_snapshot` | No PK — full table replacement |

**Why choose this dataset:**
- 1,500 fact rows → meaningful pagination/aggregation
- Duplicate emails, null values, inconsistent casing → tests AI matching
- Orphaned FK references → edge cases for validation
- Schema drift script (`scripts/simulate_e2e_drift.py`) → test drift detection

---

## 3. How to Create the End-to-End Flow

### Step 1: Access the Platform

1. Open the DataOne UI at `http://localhost:3000`
2. Log in as `admin@dataplane.ai` (password from `ADMIN_DEFAULT_PASSWORD` in `.env`)
3. You'll land on the Dashboard showing governance score, connections, recent activity

### Step 2: Schema Scan & Discovery

1. Navigate to **Schema Intel** from the sidebar
2. Select a source connection (e.g., `CRM_Source_Analytics`)
3. Click **Scan Schema** — this profiles all tables and columns
4. Review the classification results:
   - Columns with `email`, `phone`, `ssn` patterns → tagged as PII
   - Column null rates, uniqueness ratios, sample values shown
5. Repeat for a target connection (e.g., `Data_Warehouse_Target`)

### Step 3: Create a New Mapping

1. Navigate to **Schema Mapper**
2. Click **New Mapping**
3. Select Source: `CRM_Source_Analytics` → choose a table (e.g., `accounts`)
4. Select Target: `Data_Warehouse_Target` → choose a table (e.g., `dim_customer`)
5. Click **Create Mapping**

### Step 4: Add Field Mappings

1. In the Mapping Canvas, you'll see source columns on the left and target columns on the right
2. **Auto-suggest**: switch the header's mode toggle to **AI Suggested** and click **AI Suggest** to generate candidate mappings (this is a separate view from the canvas, mirroring Query Workspace's Ask/SQL toggle — both stay loaded, so switching back to **Manual** doesn't lose your canvas state)
3. **Manual mapping**: click one or more source columns to stage them (a numbered badge shows the order — this matters for Concatenate), then click a target column to connect them. Clicking a target before staging anything shows a hint instead of doing nothing.
4. For each edge, click it and use **✎ Edit** in the Properties panel to open the Transform Editor and pick a **Kind**:
   - **Direct**: Copy as-is
   - **Concat**: Combine two or more staged sources (e.g. first_name + last_name → full_name)
   - **Cast**: Convert to a target SQL type
   - **Lookup**: Resolve against an auxiliary table (e.g. industry code → industry name)
   - **Conditional (If/Else)**: threshold-based IF/THEN/ELSE — see the worked example below
   - **Coalesce (Fill NULL)** / **Default**: substitute a fallback value
   - **Upper / Lower / Trim / Substring / Null If**: simple per-value formatting
5. Click **Validate** to check the mapping
6. Fix any validation errors (unmapped required columns, type mismatches)

**Example manual mapping for `accounts → dim_customer`:**
```
account_id ──[direct]──→ customer_key
name ──[direct]──→ customer_name
industry ──[direct]──→ industry
city ──[direct]──→ region
annual_revenue ──[conditional: >500M→Enterprise, else→SMB]──→ segment
employee_count ──[conditional: >0→1 else→0]──→ is_active
created_at ──[direct]──→ dw_created_at
```

#### Worked example: building the two conditional edges above

Self-contained — follow this from a cold start even if you skipped the steps above:

1. Go to **Schema Mapper** and open a **draft** mapping (e.g. the `accounts → dim_customer` mapping from Step 3).
2. Make sure the header's mode toggle is set to **Manual** (not **AI Suggested**) — Conditional (If/Else) is applied to a manually-created (or AI-accepted) edge, same as any other transformation kind.
3. On the canvas, click `annual_revenue` on the source (left) side once to stage it, then click `segment` on the target (right) side to connect them into an edge.
4. The new edge auto-selects — in the **Properties** panel on the right, click **✎ Edit** to open the Transform Editor.
5. In the Transform Editor, change the **Kind** dropdown to **Conditional (If/Else)**.
6. Set **Operator** to `Greater than (>)`, **Compare to** to `500000000`, **Then use** to `Enterprise`, **Else use** to `SMB`.
7. Click **Apply**. A number typed into Compare to / Then use / Else use is stored as a number (so `500000000` compares as a number, not text) — a non-numeric value like `Enterprise` is stored as text automatically.
8. Repeat for the second edge: stage `employee_count`, connect it to `is_active`, open **✎ Edit**, set Kind to **Conditional (If/Else)** again, Operator `>`, Compare to `0`, Then use `1`, Else use `0`.
9. Select either edge and click **▶ Run preview** in the Properties panel to see it applied to real sample rows before publishing — the same evaluation a real pipeline run uses, so a value that previews correctly is guaranteed to load correctly (a `NULL` source value always takes the **Else** branch, matching SQL's own `CASE WHEN NULL > x THEN ... ELSE ...` semantics).

> **Scope note:** Conditional (If/Else) supports one threshold with a Then/Else pair — not a multi-branch chain (`WHEN ... WHEN ... ELSE`). It executes for real during a pipeline run, same as Direct/Cast/Upper/Lower/Trim/Substring/Coalesce/Default/Null If. **Concat** (multiple sources) and **Lookup** (needs a live join) currently preview correctly but are not yet executed during a real pipeline run — a pipeline containing one of those two kinds fails with a clear message naming the affected column instead of silently moving unmapped data.

### Step 5: Review & Publish

1. Switch to **Review** tab
2. Review the mapping summary: source columns, target columns, transformations
3. Add a **steward comment** if needed
4. Click **Publish** to create a versioned snapshot
5. The published mapping is now immutable — changes require a new version

### Step 6: Create a Pipeline

1. Navigate to **Pipelines** from the sidebar
2. Click **New Pipeline**
3. Name: `CRM_to_DW_Daily`
4. Select Source Connection: `CRM_Source_Analytics`
5. Select Target Connection: `Data_Warehouse_Target`
6. Select the Published Mapping version created in Step 5
7. Set **Execution Mode**:
   - `auto` — run immediately
   - `manual` — require confirmation
8. Configure **Load Strategy**:
   - `upsert` — for tables with primary keys (dim_customer, dim_product)
   - `full_refresh` — for tables without PKs (order_status_snapshot)
   - `append` — for fact tables (fact_revenue, fact_support)
9. Click **Create Pipeline**

### Step 7: Execute the Pipeline

1. From the Pipeline detail view, click **Run Now**
2. The pipeline will:
   - **Validate** source schema against the mapping's snapshot
   - **Check for drift** (if schema changed since mapping was published)
   - If drift detected → pipeline is blocked; re-scan and re-publish first
   - If clean → execute transformation and load
3. Monitor **Run History** tab for execution status
4. On success: see row counts copied, execution duration, any warnings
5. On failure: see error details, which row/transformation failed

### Step 8: Verify the Results

1. Navigate to **Query Studio**
2. Select Target Connection: `Data_Warehouse_Target`
3. Run queries to verify data was loaded:
   ```sql
   SELECT * FROM dim_customer;
   SELECT COUNT(*) FROM fact_revenue;
   SELECT d.customer_name, SUM(f.net_amount) as total_revenue
   FROM fact_revenue f
   JOIN dim_customer d ON f.customer_key = d.customer_key
   GROUP BY d.customer_name
   ORDER BY total_revenue DESC;
   ```
4. Navigate to **Visualize** to create charts from the loaded data

---

## 4. Feature Coverage by Scenario

| DataOne Feature | Scenario A (CRM→DW) | Scenario B (EComm) | Scenario C (HR) | Scenario D (E2E Retail) |
|---|---|---|---|---|
| Schema Scan & Classification | ✅ | ✅ | ✅ | ✅ (PII-rich) |
| AI Suggested Mappings | ✅ | ✅ | ✅ | ✅ (messy data tests confidence) |
| Manual Field Mapping | ✅ | ✅ | ✅ | ✅ |
| Transformations (12 kinds incl. Conditional If/Else; concat/lookup preview-only) | ✅ | ✅ | ✅ | ✅ |
| Mapping Validation | ✅ | ✅ | ✅ | ✅ |
| Versioning / Publishing | ✅ | ✅ | ✅ | ✅ |
| Pipeline Creation | ✅ | ✅ | ✅ | ✅ |
| Pipeline Execution | ✅ | ✅ | ✅ | ✅ |
| Schema Drift Detection | — | — | — | ✅ (use drift script) |
| Data Quality Scoring | ✅ | ✅ | ✅ | ✅ (messy data shows low scores) |
| Impact Analysis | ✅ | ✅ | ✅ | ✅ |
| Visualize (charts) | ✅ | ✅ | ✅ | ✅ |
| Query Studio | ✅ | ✅ | ✅ | ✅ (1,500 rows = pagination) |
| Governance Tagging | ✅ | ✅ | ✅ | ✅ |
| PII Classification | ✅ (email/phone) | ✅ (email/CC) | ✅ (SSN) | ✅ (all types) |
| Masking Policies | ✅ | ✅ | ✅ | ✅ |
| Audit Trail | ✅ | ✅ | ✅ | ✅ |
| AskData NL Queries | ✅ | ✅ | ✅ | ✅ |

---

## 5. Advanced: Schema Drift Demo (E2E Retail Only)

The E2E_Retail_Analytics source has a companion drift script:

```bash
cd backend && python scripts/simulate_e2e_drift.py
```

This simulates schema changes (added columns, removed columns, type changes) on the `analytics_orders` table. After running it:

1. Re-scan `E2E_Retail_Analytics` in Schema Intel
2. The pipeline using this mapping will detect drift and block execution
3. You'll see the drift details in the Pipeline Run History

---

## 6. Query Studio: Sample Queries Per Dataset

### CRM_Source_Analytics
```sql
-- Top accounts by revenue
SELECT name, annual_revenue, industry
FROM accounts
ORDER BY annual_revenue DESC
LIMIT 10;

-- Open opportunities by stage
SELECT stage, COUNT(*) as count, SUM(amount) as pipeline_value
FROM opportunities
WHERE stage NOT IN ('closed_won', 'closed_lost')
GROUP BY stage
ORDER BY pipeline_value DESC;

-- Support cases by priority
SELECT priority, status, COUNT(*) as count
FROM cases
GROUP BY priority, status
ORDER BY priority;
```

### Data_Warehouse_Target
```sql
-- Revenue by customer segment
SELECT d.segment, SUM(f.net_amount) as total_revenue
FROM fact_revenue f
JOIN dim_customer d ON f.customer_key = d.customer_key
GROUP BY d.segment;

-- Monthly revenue trend
SELECT dd.year, dd.month, dd.month_name,
       SUM(f.net_amount) as revenue
FROM fact_revenue f
JOIN dim_date dd ON f.date_key = dd.date_key
GROUP BY dd.year, dd.month, dd.month_name
ORDER BY dd.year, dd.month;

-- Support SLA performance
SELECT severity,
       COUNT(*) as total_cases,
       SUM(sla_met) as sla_compliant,
       ROUND(100.0 * SUM(sla_met) / COUNT(*), 1) as sla_pct
FROM fact_support
GROUP BY severity;
```

### HR_Postgres
```sql
-- Department headcount & salary stats
SELECT d.department_name,
       COUNT(*) as employees,
       ROUND(AVG(e.salary), 0) as avg_salary,
       ROUND(SUM(e.salary), 0) as total_salary_cost
FROM employees e
JOIN departments d ON e.department_id = d.department_id
WHERE e.employment_status = 'Active'
GROUP BY d.department_name
ORDER BY avg_salary DESC;

-- Payroll trend (monthly gross pay)
SELECT pay_period, SUM(gross_pay) as total_gross, SUM(net_pay) as total_net
FROM payroll
GROUP BY pay_period
ORDER BY pay_period;

-- Attendance summary by department
SELECT d.department_name,
       ROUND(AVG(a.hours_worked), 1) as avg_hours,
       SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) as absences
FROM attendance a
JOIN employees e ON a.employee_id = e.employee_id
JOIN departments d ON e.department_id = d.department_id
WHERE a.work_date >= '2025-01-01'
GROUP BY d.department_name;
```

### ECommerce_MySQL
```sql
-- Top selling products
SELECT p.name, p.category, SUM(oi.quantity) as units_sold,
       ROUND(SUM(oi.quantity * oi.unit_price), 2) as revenue
FROM order_items oi
JOIN products p ON oi.product_id = p.product_id
GROUP BY p.product_id
ORDER BY revenue DESC
LIMIT 10;

-- Customer lifetime value
SELECT c.first_name || ' ' || c.last_name as name,
       c.loyalty_tier, c.total_orders,
       ROUND(AVG(o.total_amount), 2) as avg_order_value
FROM customers c
JOIN orders o ON c.customer_id = o.customer_id
WHERE o.status = 'delivered'
GROUP BY c.customer_id
ORDER BY c.total_orders DESC;

-- Product review distribution
SELECT p.category, AVG(r.rating) as avg_rating, COUNT(*) as review_count
FROM reviews r
JOIN products p ON r.product_id = p.product_id
GROUP BY p.category
ORDER BY avg_rating DESC;
```

### Finance_Oracle
```sql
-- Income statement (revenue vs expenses)
SELECT account_type,
       SUM(CASE WHEN txn_type = 'debit' THEN amount ELSE -amount END) as balance
FROM transactions t
JOIN chart_of_accounts a ON t.account_id = a.account_id
WHERE strftime('%Y', t.txn_date) = '2025'
GROUP BY account_type;

-- Accounts receivable aging
SELECT SUM(amount) as total_receivable
FROM transactions t
JOIN chart_of_accounts a ON t.account_id = a.account_id
WHERE a.account_code = '1100' AND t.txn_type = 'debit';

-- Budget vs actual by department
SELECT b.department, b.fiscal_year, b.allocated_amount,
       b.spent_to_date, b.remaining,
       ROUND(100.0 * b.spent_to_date / b.allocated_amount, 1) as utilization_pct
FROM budget_allocations b
WHERE b.fiscal_year = 2025
ORDER BY utilization_pct DESC;
```

---

## 7. AskData Natural Language Query Examples

Try these questions in the AskData bot:

| Question | Expected Source |
|---|---|
| "Show me the top 5 accounts by revenue" | CRM_Source_Analytics |
| "What is the average salary per department?" | HR_Postgres |
| "How many orders were placed in June 2025?" | ECommerce_MySQL |
| "What is our monthly revenue trend this year?" | Data_Warehouse_Target |
| "Show me all customers with a PII classification" | Any (uses Schema Catalog) |
| "Which tables have email columns?" | Any (uses Schema Catalog) |

---

## 8. Troubleshooting

| Issue | Likely Cause | Fix |
|---|---|---|
| Source table not appearing | Schema not yet scanned | Navigate to Schema Intel → Scan |
| Target table not appearing for mapping | Target not registered | Check DBConnection rows exist |
| Mapping validation fails | Required column unmapped | Add all required target columns |
| Pipeline execution fails | Schema drift detected | Re-scan source → Re-publish mapping |
| Pipeline execution fails (other) | Type mismatch in transformation | Check transformation output type matches target column type |
| Pipeline execution fails: "unsupported field mapping(s)" | Edge uses Concat or Lookup | Both preview correctly but don't execute for real yet — switch that edge to a supported kind, or exclude the column from this pipeline |
| Pipeline blocked | Drift or permission issue | Check Run History for details |
| No data in Warehouse after run | Wrong load strategy | Check upsert vs append vs full_refresh setting |
| AskData returns no results | Wrong connection selected | Check connection picker in AskData header |