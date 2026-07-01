# Project Estimator Pro — Version 2 Master Development Plan

**Status of Version 1.0:** Approved, feature-complete, **frozen** (bug fixes and
security patches only).
**Document type:** Architecture review + V2 roadmap. **No code** is written until
this roadmap is approved.

---

## Part A — Architecture Review of Version 1.0

### A.1 System at a glance
- **Backend:** Node 22 + Express, `node:sqlite` (single-file `data.db`), 79 tables,
  44 mounted route groups, custom scrypt auth with opaque session tokens.
- **Frontend:** React 19 + Vite, Recharts, SheetJS; single-page app, ~1.2 MB bundle.
- **Calculation core:** centralized `costEngine`, `costControl`, `analytics`,
  `reportService` — single source of truth, no duplicated math.
- **Size:** ~18k LOC. Dependencies deliberately minimal (express, cors, xlsx /
  react, react-dom, recharts, xlsx).
- **Testing:** Jest+Supertest (81 backend tests), Vitest+RTL (13), Playwright e2e (14).

### A.2 Module-by-module assessment

| Module | State | Verdict |
|---|---|---|
| Projects / WBS / Work Modules | Complete | Solid foundation; add hierarchical WBS depth & templates (V2). |
| Master Catalogs (Mat/Labor/Equip/Sub/Other) | Complete | Add versioning, regional price books, escalation indices. |
| Estimate Builder (spreadsheet grid) | Complete | Add on-screen takeoff, formulas, conditional formatting. |
| Cost Engine (waterfall, markups, VAT) | Complete | Add risk/contingency, escalation, multi-currency at line level. |
| Unit Price Analysis (UPA) | Complete | Add crew-based productivity libraries & regional factors UI. |
| Assemblies (nested) | Complete | Add parametric assemblies & assembly versioning. |
| General Requirements | Complete | Add template library expansion. |
| Procurement + Purchasing (RFQ→PO) | Complete | Add supplier portal, e-mail RFQ, e-signature. |
| Cost Control / EVM / Cash Flow | Complete | Add forecasting models, resource S-curves, actual-cost feeds. |
| Tendering | Complete | Add bid-leveling, tender comparison analytics. |
| Reports / BOQ / Export | Complete | Add true server-side PDF, template designer, scheduled reports. |
| Enterprise (auth/roles/org/audit) | Complete | Add SSO/2FA, API keys, multi-tenant. |
| Analytics / Executive Dashboard | Complete | Add drill-down, custom KPI builder, benchmarking. |
| Settings / Backup / Import-Export / API docs | Complete | Add scheduled backups UI, migration versioning. |

### A.3 Cross-cutting findings (the 10 analysis axes)

1. **Complete:** estimating core, catalogs, UPA, assemblies, GR, procurement,
   purchasing, cost control/EVM, tendering, reporting, enterprise, analytics,
   settings/backup. This is already broad relative to commercial suites.
2. **Should improve:** reporting (browser-print PDF → true server PDF + designer),
   estimate grid (formulas, takeoff), catalog price management (versioning/escalation),
   collaboration (lock-polling → real-time).
3. **Missing professional estimating features:** on-screen quantity **takeoff** (2D
   PDF/CAD measurement), **BIM/IFC** quantity extraction, **parametric/conceptual**
   cost models, **cost indices & escalation**, **risk/contingency & Monte-Carlo**,
   **benchmarking**, **resource leveling / histograms**, **what-if scenario compare**
   at scale, **rate build-up libraries by region**.
4. **Enterprise expansion:** SSO (SAML/OIDC), 2FA, API keys/OAuth clients,
   multi-tenant workspaces, granular field-level permissions, delegation/approval
   chains, retention policies.
5. **Performance:** single SQLite file limits concurrency and cloud scale; no
   caching; no background job queue; frontend has no code-splitting/lazy loading;
   no server-side pagination on some list endpoints; report generation is synchronous.
6. **Security:** opaque tokens (no rotation/JTI revocation lists), no rate-limit
   persistence, no 2FA, no CSRF tokens for cookie flows, no secrets manager,
   no dependency scanning/CSP report endpoint, no field encryption at rest.
7. **UI/UX:** single large bundle; no lazy routes; limited keyboard/command palette
   depth; no in-app onboarding; accessibility pass needed; print-only PDF; no
   dark-mode polish across every module; no responsive/mobile layout.
8. **Database:** ad-hoc migrations via `ensureColumn` (no versioned migration
   history/rollback); no Postgres option; no read replicas; no partitioning for
   100k+ line items; JSON snapshots not indexed.
9. **API:** OpenAPI is hand-maintained (drift risk); no versioning (`/api/v1`);
   inconsistent list pagination/filtering; no webhooks; no GraphQL/bulk endpoints;
   no idempotency keys.
10. **Integration opportunities:** accounting/ERP (QuickBooks, Xero, SAP, Sage),
    scheduling (MS Project, Primavera P6), BIM (Revit/IFC), CAD takeoff (DWG/PDF),
    e-signature (DocuSign), storage (S3/Azure Blob), email/SMTP, Power BI/Tableau,
    payment/tender portals.

---

## Part B — Version 2 Feature Catalog (by category)

Complexity: **S** (small, ~days), **M** (medium, ~1–2 wks), **L** (large, multi-wk),
**XL** (major, multi-month). Each item: *Why → Benefits → Dependencies → Complexity → Order.*

### 1. Estimating Enhancements
- **On-Screen Takeoff (2D PDF/image measurement)** — *Why:* quantity takeoff is the
  #1 differentiator of CostX/Candy; today quantities are typed. *Benefits:* faster,
  auditable, drawing-linked estimates. *Dependencies:* PDF/vector viewer, drawing
  storage (S3), measurement data model. *Complexity:* XL. *Order:* early.
- **Formula cells & conditional formatting in the estimate grid** — *Why:* Excel-like
  power. *Benefits:* fewer external spreadsheets. *Deps:* grid engine. *Complexity:* L. *Order:* early.
- **What-if scenario compare (side-by-side)** — *Why:* scenarios exist; comparison
  UI does not. *Benefits:* faster tender optioneering. *Deps:* existing scenarios. *Complexity:* M. *Order:* early.
- **Cost indices & time escalation** — *Why:* multi-year projects need escalation.
  *Benefits:* accurate forward pricing. *Deps:* index tables. *Complexity:* M. *Order:* mid.
- **Line-level multi-currency** — *Why:* international projects. *Deps:* org currencies
  (already present). *Complexity:* M. *Order:* mid.

### 2. Cost Engineering
- **Risk & Contingency + Monte-Carlo simulation** — *Why:* Cleopatra-style
  probabilistic cost. *Benefits:* P50/P80 confidence ranges. *Deps:* engine hooks,
  compute (worker). *Complexity:* L. *Order:* mid.
- **Resource leveling & histograms / S-curves** — *Why:* resource planning.
  *Deps:* schedule data. *Complexity:* L. *Order:* mid.
- **Benchmarking & cost/m² analytics** — *Why:* validate estimates vs history.
  *Deps:* data warehouse view. *Complexity:* M. *Order:* mid.
- **Parametric / conceptual estimating models** — *Why:* early-stage estimates.
  *Deps:* model builder. *Complexity:* L. *Order:* later.

### 3. Templates & Libraries
- **Project / WBS / estimate templates** — *Why:* reuse standard structures.
  *Complexity:* M. *Order:* early.
- **Regional rate books & productivity libraries** — *Why:* localized pricing.
  *Deps:* catalog versioning. *Complexity:* L. *Order:* mid.
- **Assembly & UPA marketplace/sharing** — *Complexity:* M. *Order:* later.

### 4. Advanced Reporting
- **True server-side PDF engine + template designer** — *Why:* replace browser
  print; branded, paginated, batch. *Deps:* headless renderer/worker. *Complexity:* L. *Order:* early.
- **Scheduled & emailed reports** — *Deps:* job queue, SMTP. *Complexity:* M. *Order:* mid.
- **Custom KPI / dashboard builder** — *Complexity:* L. *Order:* later.

### 5. AI Features
- **AI estimate assistant (NL → line items, rate suggestions)** — *Why:* speed &
  consistency; use latest Claude models. *Benefits:* draft estimates, catch omissions.
  *Deps:* Anthropic API, RAG over catalogs/history. *Complexity:* L. *Order:* mid.
- **AI document extraction (specs/drawings → BOQ)** — *Deps:* file pipeline, model. *Complexity:* XL. *Order:* later.
- **Anomaly detection on rates & variances** — *Complexity:* M. *Order:* mid.
- **Natural-language report Q&A** — *Complexity:* M. *Order:* later.

### 6. Cloud Features
- **Multi-tenant + Postgres option** — *Why:* SaaS scale & isolation. *Deps:*
  migration framework, tenancy model. *Complexity:* XL. *Order:* foundational for cloud.
- **Object storage for attachments/drawings (S3/Azure)** — *Complexity:* M. *Order:* early-cloud.
- **Real-time collaboration (WebSockets)** — *Why:* replace lock-polling. *Complexity:* L. *Order:* mid.
- **Background job queue (reports, backups, AI, imports)** — *Complexity:* M. *Order:* early-cloud.

### 7. Integration Features
- **Accounting/ERP connectors (QuickBooks, Xero, Sage, SAP)** — *Complexity:* L. *Order:* mid.
- **Scheduling (MS Project / Primavera P6) sync** — *Complexity:* L. *Order:* mid.
- **BIM/IFC quantity import + CAD (DWG) takeoff** — *Complexity:* XL. *Order:* later.
- **E-signature (DocuSign) for POs/tenders; Webhooks; Power BI feed** — *Complexity:* M each. *Order:* mid.

### 8. Mobile Features
- **Responsive web + PWA (offline site capture)** — *Why:* field access. *Complexity:* L. *Order:* mid.
- **Site progress / actual-cost capture app** — *Deps:* PWA, sync. *Complexity:* L. *Order:* later.
- **Push notifications** — *Complexity:* S. *Order:* mid.

### 9. Administration
- **SSO (SAML/OIDC) + 2FA + API keys/OAuth clients** — *Complexity:* L. *Order:* early-enterprise.
- **Versioned DB migrations + admin migration console** — *Why:* replace ad-hoc
  `ensureColumn`; safe upgrades/rollbacks. *Complexity:* M. *Order:* foundational.
- **Field-level permissions, approval delegation, retention policies** — *Complexity:* M. *Order:* mid.

### 10. Performance
- **Frontend code-splitting / lazy routes / virtualized everywhere** — *Complexity:* M. *Order:* early.
- **Server-side pagination + query indexes review** — *Complexity:* M. *Order:* early.
- **Caching layer (in-memory/Redis) + ETag** — *Complexity:* M. *Order:* mid.
- **Async report/import generation via queue** — *Complexity:* M. *Order:* mid.

### 11. Security
- **JWT with rotation + revocation list (JTI), refresh hardening** — *Complexity:* M. *Order:* early.
- **2FA/TOTP, CSP + report-uri, dependency scanning in CI** — *Complexity:* M. *Order:* early.
- **Field encryption at rest for sensitive data, secrets manager** — *Complexity:* M. *Order:* mid.
- **Audit immutability (append-only + hash chaining)** — *Complexity:* M. *Order:* mid.

---

## Part C — Version 2 Phased Roadmap (priority-ordered)

Phases are ordered so that **foundations** (migrations, security, performance,
cloud plumbing) precede **high-value features** that depend on them, mirroring how
commercial suites (CostX, Cleopatra, Candy, WinEst, Sage, Trimble) layer capability.

### Phase V2.1 — Foundation & Hardening *(enables everything else)*
Versioned migration framework · JWT rotation/revocation + 2FA + CSP + CI dep-scan ·
frontend code-splitting/lazy routes · server-side pagination + index review ·
background job queue + object storage abstraction.
**Why first:** every later feature (AI, reports, cloud, takeoff) needs safe
migrations, async jobs, storage, and a hardened auth surface.

### Phase V2.2 — Estimating Power *(core differentiators)*
On-screen takeoff (2D PDF) · formula cells + conditional formatting · what-if
scenario compare · project/WBS/estimate templates.
**Why:** biggest competitive gap vs CostX/Candy; directly speeds estimator workflow.

### Phase V2.3 — Advanced Reporting & Cost Engineering
Server-side PDF engine + template designer · scheduled/emailed reports ·
risk/contingency + Monte-Carlo · benchmarking & cost/m².
**Why:** professional deliverables + probabilistic cost (Cleopatra parity).

### Phase V2.4 — AI Features
AI estimate assistant (NL → lines, rate suggestions, omission checks) · anomaly
detection on rates/variances · NL report Q&A. *(AI document/drawing extraction
deferred to V2.6 with takeoff/BIM.)*
**Why:** modern differentiator; depends on V2.1 job queue + hardened data layer.

### Phase V2.5 — Cloud & Collaboration
Multi-tenant + Postgres option · real-time collaboration (WebSockets) · caching
layer · S3/Azure attachments at scale.
**Why:** turns the product into a scalable SaaS; depends on migrations + queue.

### Phase V2.6 — Integrations & Takeoff Extensions
Accounting/ERP + scheduling (P6/MS Project) connectors · BIM/IFC import + CAD
takeoff · e-signature · webhooks · Power BI feed · AI drawing→BOQ.
**Why:** ecosystem lock-in; the heaviest items, best done on mature foundations.

### Phase V2.7 — Mobile & Field
Responsive/PWA · offline site capture & actual-cost feed · push notifications.
**Why:** extends reach to the field; depends on sync/queue/auth foundations.

### Phase V2.8 — Administration & Enterprise Polish
SSO (SAML/OIDC) · API keys/OAuth clients · field-level permissions · approval
delegation · retention policies · immutable audit (hash-chained).
**Why:** large-enterprise procurement requirements; can trail core features.

---

## Part D — Commercial Positioning (parity targets)

| Capability | CostX | Cleopatra | Candy | WinEst | Sage | Trimble | **PE Pro V1** | **PE Pro V2 target** |
|---|---|---|---|---|---|---|---|---|
| Spreadsheet estimating | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| On-screen 2D takeoff | ✓ | – | ✓ | ✓ | – | ✓ | – | **V2.2** |
| BIM/IFC takeoff | ✓ | – | – | – | – | ✓ | – | **V2.6** |
| Assemblies / UPA | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Risk / Monte-Carlo | – | ✓ | – | – | – | – | – | **V2.3** |
| Cost control / EVM | – | ✓ | ✓ | – | – | – | ✓ | ✓ (enhanced) |
| Procurement / tender | – | ✓ | ✓ | – | – | – | ✓ | ✓ (portal) |
| Advanced/branded reports | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (print) | **V2.3 server PDF** |
| AI assistance | partial | partial | – | – | – | – | – | **V2.4** |
| Cloud/multi-tenant SaaS | ✓ | ✓ | – | – | ✓ | ✓ | – | **V2.5** |
| ERP / scheduling integration | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – | **V2.6** |

**Summary:** V1.0 already matches the mid-market on estimating, cost control,
procurement and enterprise administration. V2 closes the three signature gaps of
the high end — **takeoff/BIM**, **probabilistic cost & advanced reporting**, and
**cloud/AI/integrations** — sequenced on a hardened, migration-safe, async-capable
foundation.

---

*Awaiting approval of this roadmap before any V2 implementation begins.*
