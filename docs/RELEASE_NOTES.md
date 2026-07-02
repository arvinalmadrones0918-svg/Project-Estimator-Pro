# Project Estimator Pro — Release Notes

## Version 1.0.0

Project Estimator Pro 1.0 is a complete, professional construction-estimating
and project cost-control platform. It covers the full lifecycle from master
data through estimating, procurement, tendering, cost control, and executive
business intelligence.

### Highlights

- **Master Estimating Foundation** — Projects, WBS tree, work modules, and a
  central cost model.
- **Master Catalogs** — Materials, Labor, Equipment, Subcontract, and Other
  Costs with search, import/export, price history, and bulk updates.
- **Estimate Builder** — professional spreadsheet grid with keyboard
  navigation, copy/paste, drag-reorder, undo/redo, and virtual scrolling for
  100k+ line items.
- **Cost Calculation Engine** — the single source of truth for every cost
  figure: assemblies (nested), modules, WBS rollups, and the indirect-cost
  waterfall (Direct → Subtotal → VAT → Bid Price → Discount → Final Tender
  Price). Supports scenarios and revisions.
- **Procurement** — supplier database, multi-supplier quotations, price
  comparison, supplier selection, purchase packages, and printable RFQs.
- **Rate Analysis (UPA)** — reusable Unit Price Analysis library with waste,
  productivity, and regional factors; versioning and comparison.
- **BOQ & Reporting** — 14+ report types with grouping, filters, include/
  exclude options, print layouts (A4/Letter/Legal), and Excel/CSV export.
- **General Requirements Builder** — dedicated module with 21 categories, 11
  estimating methods, project-parameter-driven calculations, templates, and a
  staff library.
- **Excel Integration** — generic import wizard (preview, mapping, validation,
  duplicate detection, options) and export for 15 entities.
- **Multi-User, Security & Workflow** — authentication (scrypt), RBAC, the
  estimate approval workflow, project locking, notifications, and audit trail.
- **Cost Control & Financial Management** — budgets, variation orders,
  purchase orders, subcontracts, progress billing, budget-vs-actual, earned
  value (EVM), and cash-flow S-curves.
- **Executive Dashboard & BI** — portfolio KPIs, project-health traffic
  lights, cost/procurement/tender/resource dashboards, and the KPI center.

### Architecture

- **Backend** — Node.js + Express with the built-in `node:sqlite` database.
  All calculations live in centralized services (`costEngine`, `costControl`,
  `analytics`) so business logic is never duplicated.
- **Frontend** — React 19 + Vite, Recharts for charts, SheetJS for Excel.
- **Single source of truth** — every dashboard, report, and cost-control
  figure is derived from the cost engine.

### Security

- Passwords hashed with scrypt (timing-safe verification).
- Role-based access control per module/action.
- All SQL is parameterized; dynamic identifiers come only from server-side
  configuration. No `dangerouslySetInnerHTML`; React auto-escaping prevents
  XSS. Centralized JSON error handler avoids leaking stack traces.

### Defaults

- Administrator account: `admin` / `admin123` (change on first login).

See `CHANGELOG.md` for the full phase-by-phase history.

---

### Also delivered in 1.0.0

- **Enterprise & security:** refresh tokens, 8 built-in roles, Organization
  management, and an audit trail capturing old/new value, IP address and
  browser, with security and system log views.
- **Procurement & purchasing:** RFQs from estimate items, multi-supplier
  quotations, bid comparison, award → PO, purchase requests and supplier
  performance.
- **Cost control:** budget-vs-actual, change orders that update the revised
  budget, cash-flow S-curves, earned value and alerts.
- **Production readiness:** settings, backup/restore, import/export, OpenAPI +
  Swagger docs, health check and security hardening (headers, rate limiting,
  sanitization, compression).
- **Quality:** 81 backend tests, 13 frontend tests, 14 Playwright checks — all
  green. Production build verified.
- **Demo data:** `npm run seed:demo` seeds a Demo Company plus six discipline
  sample projects.
