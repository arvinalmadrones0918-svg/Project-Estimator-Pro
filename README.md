# Project Estimator Pro

**Version 1.0.0** — a complete, professional construction-estimating and project
cost-control platform. It covers the full lifecycle: master data, estimating, a
centralized cost engine, unit-price analysis, assemblies, general requirements,
procurement & purchasing, tendering, cost control & earned value, executive
business intelligence, Excel exchange, and a full multi-user enterprise platform.

Comparable in scope to CostX, Candy, WinEst, Sage Estimating and Trimble
Estimation, delivered as a self-hostable web application.

---

## Features

- **Master Estimating Foundation** — Projects, hierarchical WBS, work modules,
  unified Project Explorer.
- **Master Catalogs** — Materials, Labor, Equipment, Subcontract, Other Costs with
  search, price history, bulk update and import/export.
- **Estimate Builder** — spreadsheet grid with keyboard navigation, copy/paste,
  drag-reorder, undo/redo and virtual scrolling for 100k+ line items.
- **Cost Engine** — single source of truth for every figure: assemblies (nested),
  modules, WBS rollups, markups, overhead, profit, VAT, retention, and the tender
  waterfall.
- **Unit Price Analysis (UPA)** — reusable rate build-ups with regional factors.
- **General Requirements** — preliminaries/GR sheets with staff, facilities,
  utilities, safety, QA/QC, testing and closeout.
- **Procurement & Purchasing** — Suppliers, RFQs from estimate items, multi-supplier
  quotations, bid comparison (lowest/best value/variance), award, purchase requests,
  purchase orders, supplier performance, attachments and approval workflow.
- **Cost Control & Budget Monitoring** — budget from estimate, actual costs, budget
  vs actual, change orders, cash flow S-curves, earned value (PV/EV/AC/CV/SV/CPI/
  SPI/EAC/ETC/VAC), alerts and forecasting.
- **Tendering** — clients, tenders, drawings, specifications, addenda, RFIs.
- **Reports & BOQ** — 20+ report types with grouping, PDF (print), Excel and CSV
  export.
- **Executive Business Intelligence** — cost, tender, procurement and KPI dashboards.
- **Enterprise Platform** — token auth with refresh tokens, 8 built-in roles,
  module/CRUD permissions, organization (company, branches, departments, business
  units, currencies, tax), audit trail (old/new value + IP + browser), notifications
  and activity logs.
- **Production** — application settings, database backup/restore, JSON import/export,
  OpenAPI/Swagger docs, security hardening and Docker deployment.

## Screenshots

Screenshots live in `docs/screenshots/`. Key views: Executive Dashboard · Project
Workspace (Explorer + estimate grid + cost summary) · Bid Comparison · Cost Control
dashboard · Reports/BOQ · Administration. Run the app with the demo data (below)
to reproduce them.

## Requirements

- **Node.js 22+** (uses the built-in `node:sqlite`).
- **npm 10+**.
- A modern browser (Chrome, Edge, Firefox, Safari).
- ~200 MB disk for the app; the database is a single SQLite file.
- Optional: **Docker** + **Docker Compose** for containerized deployment.

## Installation

```sh
# 1. Backend  →  http://localhost:4000
cd backend
npm install
npm run seed        # base catalogs + WBS
npm run seed:demo   # Demo Company + 6 sample projects (optional)
node src/index.js

# 2. Frontend →  http://localhost:5173
cd ../frontend
npm install
npm run dev
```

Sign in with **`admin` / `admin123`** and change the password after first login.
The Vite dev server proxies `/api` to the backend.

## Architecture

```
                    +----------------------------+
  Browser  ------->  |  React 19 SPA (Vite)        |
                    |  Recharts . SheetJS         |
                    +--------------+-------------+
                              /api | (JSON)
                    +--------------v-------------+
                    |  Express (Node 22)          |
                    |  security . rate-limit .    |
                    |  gzip . auth . error handler|
                    +----------------------------+
                    |  Route groups (44)          |
                    |  Services (single source of |
                    |  truth): costEngine .       |
                    |  costControl . analytics .  |
                    |  reportService . auth       |
                    +----------------------------+
                    |  node:sqlite (data.db)      |
                    |  79 tables                  |
                    +----------------------------+
```

- **No duplicated math** — every cost figure is derived by the centralized services.
- **Backward-compatible migrations** via `ensureColumn`; auth is non-blocking so
  routes stay usable while permissions layer on top.
- See `docs/DATABASE_SCHEMA.md` for the full data model.

## API Documentation

- **Swagger UI:** `http://localhost:4000/api/docs`
- **OpenAPI spec:** `http://localhost:4000/api/openapi.json`
- **Reference:** `docs/API_REFERENCE.md`
- **Health check:** `GET /api/health`

## Tests

```sh
cd backend  && npm test               # Jest + Supertest (81)
cd frontend && npm run test           # Vitest + RTL (13)
node frontend/e2e/estimate-flow.mjs   # Playwright end-to-end (14)
```

## Deployment

```sh
cp .env.example .env              # set NODE_ENV, PORT, DB_PATH, BACKUP_DIR
docker compose up -d --build      # backend + Nginx frontend
curl http://localhost/api/health  # {"status":"ok"}
```

See `docs/DEPLOYMENT.md` and `docs/DEPLOYMENT_CHECKLIST.md` for HTTPS, Nginx,
environment variables and backup scheduling.

## Documentation

| Document | Purpose |
|---|---|
| `docs/USER_MANUAL.md` | Estimator's guide |
| `docs/ADMINISTRATOR_MANUAL.md` | Admin & operations guide |
| `docs/API_REFERENCE.md` | REST API reference |
| `docs/INSTALLATION.md` | Detailed install |
| `docs/DEPLOYMENT.md` / `docs/DEPLOYMENT_CHECKLIST.md` | Production deployment |
| `docs/DATABASE_SCHEMA.md` | Data model |
| `docs/RELEASE_NOTES.md` / `docs/CHANGELOG.md` | Release history |
| `docs/VERSION_2_MASTER_PLAN.md` | Future roadmap |

## License

Proprietary — (c) 2026. All rights reserved.
