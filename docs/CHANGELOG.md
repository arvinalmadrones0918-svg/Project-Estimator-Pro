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

### Additional 1.0 hardening & feature work (this release)

- **Automated testing framework:** Jest + Supertest (backend, 81 tests),
  Vitest + React Testing Library (frontend, 13), and a Playwright end-to-end
  suite (14 checks) covering the full estimate → export flow.
- **Professional Estimating Workspace redesign:** unified Project Explorer
  (Project Information · WBS tree · Cost Summary · Cost Control · Procurement ·
  Reports) with rename/duplicate/delete and drag-and-drop; persistent cost
  summary sidebar and bottom summary bar.
- **Professional BOQ & Reporting:** formatted multi-sheet Excel workbooks
  (auto-width, frozen headers), revision comparison, and additional report
  types.
- **Procurement Module:** project-centric RFQs generated from estimate items,
  multi-supplier quotations, bid comparison (lowest / best value / variance /
  lead time), award → purchase order, purchase requests, supplier performance
  scorecards, attachments and a Draft/For-Approval/Approved/Rejected/Cancelled
  workflow. Dashboard with budget-vs-procurement.
- **Cost Control & Budget Monitoring:** budget from approved estimate, actual
  costs (PO/invoice/payroll/equipment/subcontract/misc), budget-vs-actual with
  overrun colour-coding, change orders that auto-update the revised budget,
  monthly/weekly cash-flow S-curves (planned vs actual), full earned-value
  metrics, alerts and cost reports.
- **Enterprise Platform:** refresh tokens (rotating), the 8 built-in roles
  (Administrator, Estimator, Project Engineer, Project Manager, Procurement,
  Accounting, Executive, Viewer), Organization management (company profile,
  branches, departments, business units, currencies, tax settings) and an
  enriched audit trail (old value, new value, IP address, browser) with
  security / system log views.
- **Production Release:** application settings (currency, tax, units, date and
  number formats), database backup / restore with history, JSON import/export,
  OpenAPI 3.0 spec + Swagger UI at `/api/docs`, health check, and
  dependency-free security hardening (security headers, per-IP rate limiting,
  body sanitization, gzip compression, central error handler).
- **Demo data:** `npm run seed:demo` creates a Demo Company (Cornerstone
  Builders Demo) and six sample projects — Mechanical, Electrical, Civil,
  Architectural, Plumbing and Fire Protection.
