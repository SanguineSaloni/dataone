Enhance the existing Enterprise Topology & Lineage module into a next-generation Data Intelligence Workspace comparable to Microsoft Fabric, Informatica Enterprise Data Catalog, Collibra, Alation, and Databricks Unity Catalog.

PRIMARY GOAL

Transform the current table-level lineage screen into an interactive AI-assisted Schema Mapping Workbench that allows users to:

1. Expand tables into full field-level mappings
2. Inspect AI mapping decisions per column
3. Understand transformation logic
4. Review confidence scores
5. Override mappings manually
6. Minimize/Collapse workspace panes like Excel
7. Analyze downstream impact
8. Compare schemas side-by-side

--------------------------------------------------------
TABLE EXPAND / COLLAPSE EXPERIENCE
--------------------------------------------------------

Every table card should support:

▶ Expand
▼ Collapse

States:

Level 1
- Table name only

Level 2
- Key columns
- PII indicators
- Data quality indicators

Level 3
- Full schema
- Data types
- Constraints
- AI match indicators

Level 4
- Full field-level lineage mode

Users can individually expand or collapse any table.

Support:
- Expand All
- Collapse All
- Focus Mode

--------------------------------------------------------
FIELD LEVEL LINEAGE VIEW
--------------------------------------------------------

When a user expands a table:

Show:

Customer_Name
VARCHAR(255)

Mapped To:

Customer_Full_Name
VARCHAR(500)

AI Confidence:
97%

Status:
Auto Matched

Transformation:
TRIM()
UPPER()
CONCAT()

Business Meaning:
Customer Display Name

Source Quality Score:
94%

Target Quality Score:
98%

Every column mapping should render visually.

Example:

Customer_Name
      │
      ▼
Customer_Full_Name

Confidence 97%

Transformation Applied

--------------------------------------------------------
LINE CONNECTION ENHANCEMENTS
--------------------------------------------------------

Current table connections should become:

TABLE LINEAGE
  ▼
COLUMN LINEAGE

Users can zoom in to see:

accounts
  customer_name
      │
      ▼
dim_customer.customer_full_name

accounts
  address
      │
      ▼
dim_customer.region

Animated lineage paths.

Color coding:

Green
Exact Match

Blue
AI Match

Orange
Transformation Required

Red
Missing Mapping

Purple
Business Rule Applied

--------------------------------------------------------
AI MAPPING EXPLAINABILITY PANEL
--------------------------------------------------------

Clicking any field mapping opens AI Explainability Drawer.

Show:

Why was this matched?

Example:

customer_name
→ customer_full_name

AI Reasoning:

- Semantic similarity 94%
- Data profile similarity 98%
- Frequent usage pattern match
- Business glossary alignment
- Historical migration match

Confidence Contributors:

Meaning Similarity
94%

Pattern Similarity
98%

Historical Mapping
89%

Business Glossary
100%

Overall
97%

--------------------------------------------------------
AI COLUMN RECOMMENDATIONS
--------------------------------------------------------

Unmapped fields should show:

Suggested Matches

Example:

Source:
cust_location

Possible Targets:

region_name
Confidence 92%

customer_region
Confidence 87%

territory_name
Confidence 84%

Accept
Reject
Train Model

--------------------------------------------------------
TRANSFORMATION PREVIEW
--------------------------------------------------------

For transformed columns:

Preview section:

Source Value
John Smith

Transformation

TRIM()
UPPER()

Output

JOHN SMITH

Users can preview sample records.

--------------------------------------------------------
EXCEL-LIKE PANEL MANAGEMENT
--------------------------------------------------------

Every major panel supports:

□ Maximize

─ Minimize

✕ Close

Supported Panels:

- Topology View
- Issues Panel
- AI Mapping Drawer
- Lineage Explorer
- Properties Pane
- Schema Comparison Panel

Excel-style docking behavior.

Users can:

Pin
Unpin
Float
Dock Left
Dock Right
Dock Bottom

Resizable splitters.

--------------------------------------------------------
TAB MANAGEMENT
--------------------------------------------------------

Current tabs should become workspace tabs.

Example:

Topology
Impact Analysis
Schema Comparison
AI Mapping
Data Quality
Governance

Each tab supports:

Minimize
Detach
Popout
Split View

Like Excel sheets + VS Code panels.

--------------------------------------------------------
SCHEMA COMPARISON MODE
--------------------------------------------------------

New View:

Source Schema
vs
Target Schema

Display:

✔ Added Columns

✖ Missing Columns

⚠ Changed Datatypes

⚡ Changed Constraints

Side-by-side diff viewer.

--------------------------------------------------------
AI CHANGE IMPACT ANALYSIS
--------------------------------------------------------

When user selects any column:

Show:

Affected Tables

Affected Dashboards

Affected Reports

Affected ETL Pipelines

Affected ML Models

Affected APIs

Risk Score

--------------------------------------------------------
MAPPING REVIEW WORKFLOW
--------------------------------------------------------

Introduce enterprise approval process.

Statuses:

Draft

AI Proposed

Pending Review

Business Approved

Data Steward Approved

Production Ready

Rejected

Display workflow badge per mapping.

--------------------------------------------------------
BUSINESS GLOSSARY INTEGRATION
--------------------------------------------------------

Each column exposes:

Business Definition

Owner

Domain

Classification

Examples

Policies

Glossary match score

--------------------------------------------------------
RIGHT SIDE INSIGHTS PANEL
--------------------------------------------------------

Dynamic insights change with selection.

Example:

Selected:
customer_name

Insights:

Used in 42 reports

Appears in 7 pipelines

PII Classification:
Sensitive

AI Mapping Confidence:
97%

Data Quality:
94%

Last Updated:
2 hours ago

--------------------------------------------------------
TOP TOOLBAR
--------------------------------------------------------

Add:

Search Tables

Search Columns

Search Business Terms

Expand All

Collapse All

Show AI Suggestions

Show Unmapped

Show PII

Show Quality Issues

Export Mapping

Generate Documentation

Generate Migration Report

--------------------------------------------------------
ADVANCED ENTERPRISE FEATURES
--------------------------------------------------------

Add future-ready capabilities:

- Column-level lineage
- Knowledge graph visualization
- Schema drift detection
- AI mapping training feedback loop
- Versioned mappings
- Mapping snapshots
- Compare revisions
- Rollback mappings
- Real-time collaboration
- Multi-user annotations
- Data steward comments
- Governance approvals

--------------------------------------------------------
DESIGN SYSTEM
--------------------------------------------------------

Maintain existing dark luxury enterprise theme.

Inspired by:

- Microsoft Fabric
- Azure Data Explorer
- Databricks Unity Catalog
- Snowflake Horizon
- Informatica EDC
- Collibra Data Intelligence
- Alation

Focus on:
- Dense information
- Zero clutter
- Explainable AI
- Governance-first UX
- Executive-grade visual polish
- Massive-scale lineage visualization