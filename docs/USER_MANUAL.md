# User Manual

## Signing in

Open the app and sign in with your username and password. Use **Remember me**
on trusted devices. You are automatically signed out after 30 minutes of
inactivity. Change your password from the user menu (top-right).

## Navigation

The top navigation bar provides access to every module. Your role determines
which actions you can perform; the **Administration** tab appears only for
administrators. Use the **global search** box to find projects, clients,
suppliers, materials, assemblies, UPA, documents, and specifications.

## Executive Dashboard

The landing page. Shows portfolio KPIs (active/completed projects, tender and
awarded value, revenue, cost, profit, cash flow), project-health traffic
lights, cost/procurement/tender/resource charts, and the KPI center. Filter by
estimator, client, year, or status. Click a project-health row to open it.
Toggle **Auto-refresh** for live updates; export via Print/PDF, PNG, or Excel.

## My Work

Your personal dashboard: pending reviews, pending approvals, favorite projects,
recent projects, and recent activity.

## Projects & the Workspace

- **Projects** lists all projects with create, open, duplicate, archive, and
  delete. Open a project to enter the **Workspace**.
- The Workspace has a WBS tree (Mechanical, Electrical, Civil, Architectural,
  General Requirements). Add work items under any node.
- The **Estimate Grid** edits a work item's line items (Materials, Labor,
  Equipment, Subcontract, Other, Assemblies, Unit Price Analysis). Double-click
  a cell to edit; use copy/paste, drag to reorder, and undo/redo.
- The **workflow bar** shows the estimate status and edit lock. Submit for
  review, approve, return, issue, or archive according to your permissions.
- The **Cost Summary** tab shows the full cost waterfall, WBS rollup, indirect
  costs, scenarios, and revisions.

## Catalogs

Materials, Labor, Equipment, Subcontract, and Other Costs each have a data grid
with instant search, filters, sorting, pagination, create/edit/duplicate/
deactivate/delete, price history, bulk update, and Excel/CSV import & export.

## Rate Analysis (UPA)

Build reusable Unit Price Analyses from catalog resources with waste %,
productivity, crew, and regional factors. The unit rate recalculates live.
Snapshot versions to compare historical rates. Insert a UPA into any work item.

## Procurement

Manage suppliers and material quotations. Compare prices (lowest/highest/
average/preferred), select a supplier (which updates the estimate price),
generate purchase packages by category or supplier, and print RFQs.

## Tendering

Tender register, client master, document control (with version history),
drawing/specification/addendum/RFI registers, bid comparison across scenarios,
and the change log.

## General Requirements

A dedicated builder for project general requirements (mobilization, temporary
facilities, staff, safety, QA/QC, permits, testing, closeout, …). Choose an
estimating method per item (lump sum, unit rate, %-of-direct/project/category,
monthly/weekly/daily, rental, allowance, formula). Project parameters
(duration, area, personnel, …) drive automatic calculations. Apply templates
and use the staff library.

## Cost Control

Create the official budget from the approved estimate. Track purchase orders,
subcontracts, variation orders, progress billing, and actual costs. View
budget-vs-actual, the cash-flow S-curve, and earned-value metrics
(CPI/SPI/EAC/VAC). The financial dashboard summarizes profit and forecast.

## Reports

Generate the BOQ, detailed estimate, cost breakdown, resource summaries, UPA
report, procurement/supplier reports, project/WBS summaries, GR reports, and
cost-control reports. Group, filter, choose include/exclude options, pick a
page size, then print or export to Excel/CSV.

## Excel Import & Export

Use the Import wizard to bring data in from Excel/CSV: upload, preview, map
columns, validate, review duplicates, choose an option (append / update
existing / ignore duplicates / replace), and import. Download a template for
any entity. Export any report or a multi-sheet summary workbook.

---

## Working in the Project Workspace (v1.0)

Open a project to enter the **Project Workspace**. The left **Project Explorer**
tree contains, under each project:

- **Project Information** — name, client, owner, consultant, currency, revision.
- **WBS** — Mechanical (with 10 sub-disciplines), Electrical, Civil, Architectural,
  General Requirements. Add work items under any node; rename, duplicate, delete,
  or drag-and-drop them between WBS nodes.
- **Cost Summary** — the live waterfall.
- **Cost Control** — budget, actuals, EVM, cash flow, alerts (see below).
- **Procurement** — RFQs, quotations, bid comparison, POs (see below).
- **Reports** — BOQ and all report types.

A **Cost Summary sidebar** (right) and a **Bottom Summary Bar** show Materials,
Labor, Equipment, Subcontract, Other, Direct Cost and Final Tender Price, updating
instantly as you edit.

### Procurement (per project)
1. **RFQs** → *Generate RFQ from Estimate*: pick estimate items and invite suppliers.
2. **Add quotations** for each invited supplier (per-item unit prices + lead time).
3. **Bid Comparison** shows every quote side by side and highlights the **Lowest
   Price** and **Best Value**, with variance and lead time. **Award** a quote and
   generate a **Purchase Order** from it.
4. **Purchase Requests** can be generated from approved estimate items.
5. **Supplier Performance** records delivery / quality / price ratings.

### Cost Control (per project)
1. **Budget** → *Create Budget from Approved Estimate*. Track Original / Approved /
   Revised / Forecast / Remaining.
2. **Actual Costs** → record costs by source (PO, invoice, payroll, equipment,
   subcontract, misc).
3. **Budget vs Actual** shows variance and variance %, with overruns in red.
4. **Change Orders** (owner / contractor / variation / additional / deductive) —
   approving one automatically updates the revised budget.
5. **Cash Flow** — monthly or weekly S-curve, planned vs actual.
6. **Earned Value** — PV, EV, AC, CV, SV, CPI, SPI, EAC, ETC, VAC.
7. **Alerts** — budget exceeded, category over budget, negative cash flow, high
   variance, supplier overrun.

### Sample data
Ask your administrator to run `npm run seed:demo` to load a Demo Company and six
discipline sample projects (Mechanical, Electrical, Civil, Architectural, Plumbing,
Fire Protection) to explore these features.
