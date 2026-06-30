# Changelog

All notable changes to Project Estimator Pro.

## [1.0.0] — Release

Production hardening: removed dead components (legacy workspace sections),
centralized JSON error handling and a 404 handler (no leaked stack traces),
security review (parameterized SQL, no XSS sinks, scrypt auth), full
documentation, and Docker/Nginx deployment assets. All backend unit tests pass.

### Phase history

- **Phase 1 — Master Estimating Foundation:** projects, WBS, work modules, core
  data model and API.
- **Phase 2 — Project Workspace UI:** dashboard, WBS tree editor, node editor,
  cost summary, dark/light theme.
- **Phase 3 — Master Catalog Manager:** 5 catalogs with search, filters,
  import/export, price history, bulk update.
- **Phase 4 — Estimate Builder:** professional grid (keyboard nav, copy/paste,
  drag reorder, undo/redo, virtual scroll).
- **Phase 5 — Cost Calculation Engine:** single source of truth; assemblies,
  modules, WBS rollup, indirect-cost waterfall, scenarios, revisions, audit.
- **Phase 6 — Procurement & Supplier Quotations:** suppliers, quotations, price
  comparison, supplier selection, purchase packages, RFQ.
- **Phase 7 — Rate Analysis (UPA):** reusable unit-price analysis with waste,
  productivity, regional factors, versioning.
- **Phase 8 — BOQ & Reporting Engine:** 14+ report types, grouping, filters,
  print layouts, Excel/CSV export.
- **Phase 9 — Tendering & Document Control:** tenders, clients, documents +
  versions, drawing/spec/addendum/RFI registers, bid comparison, change log,
  global search.
- **Phase 10 — General Requirements Builder:** dedicated module, 21 categories,
  11 estimating methods, templates, staff library, reports.
- **Phase 11 — Excel Integration:** import wizard (preview/map/validate/
  dedupe/commit) and export for 15 entities.
- **Phase 12 — Multi-User, Security & Workflow:** auth, RBAC, approval
  workflow, project locking, notifications, audit trail.
- **Phase 13 — Cost Control & Financial Management:** budgets, VOs, POs,
  subcontracts, progress billing, budget-vs-actual, EVM, cash flow.
- **Phase 14 — Executive Dashboard & BI:** portfolio KPIs, project health,
  cost/procurement/tender/resource dashboards, KPI center.
