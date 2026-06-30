# Database Schema

Project Estimator Pro uses SQLite via Node's built-in `node:sqlite`. The schema
is created and migrated non-destructively at every backend startup (new columns
and tables are added with `ensureColumn` / `CREATE TABLE IF NOT EXISTS`; nothing
is dropped). Foreign keys are enabled. Every foreign key and common filter
column is indexed.

## Conventions

- `id INTEGER PRIMARY KEY AUTOINCREMENT` on every table.
- `createdAt` / `updatedAt` timestamps where applicable.
- `deletedAt` marks soft-deleted rows (hidden everywhere); `status` /
  `isActive` mark deactivation (visible with a filter).
- Line items store a **price snapshot** (`unitPriceAtEntry`,
  `hourlyRateAtEntry`, `unitCostAtEntry`, frozen breakdowns) so an estimate's
  cost never shifts when a catalog price changes later.

## Core estimating
- **projects** — project header, `status` (active/archived), `workflowStatus`
  (draft…archived), `approvalLevel`, soft-delete.
- **wbs_categories**, **wbs_subcategories** — work-breakdown structure.
- **work_modules** — work items under the WBS.
- **module_materials / module_labor / module_equipment / module_subcontract /
  module_other_costs / module_assemblies / module_upa** — line items, each with
  a frozen price snapshot, markup, status, sort order.

## Catalogs
- **materials**, **labor_specializations**, **equipment**,
  **subcontract_catalog**, **other_costs_catalog** — master catalogs with
  extended fields, soft-delete, deactivation.
- **catalog_price_history** — append-only price-change log.

## Assemblies & rate analysis
- **assemblies**, **assembly_items** (supports nested assemblies and UPA refs).
- **unit_price_analyses**, **upa_resources**, **upa_versions**.

## Estimate engine
- **estimate_scenarios**, **indirect_cost_items**, **estimate_revisions**,
  **calculation_audit**.

## Procurement
- **suppliers**, **material_quotations**, **quotation_audit**.

## Tendering & documents
- **clients**, **tenders**, **documents**, **document_versions**, **drawings**,
  **specifications**, **addenda**, **rfis**, **change_log**.

## General Requirements
- **gr_sheets**, **gr_items**, **gr_templates**, **gr_template_items**,
  **gr_staff_library**.

## Reporting
- **report_templates**, **report_history**.

## Multi-user / security
- **users** (extended), **roles**, **sessions**, **password_resets**,
  **approvals**, **activity_log**, **project_locks**, **notifications**,
  **favorites**.

## Cost control
- **budgets**, **budget_transfers**, **purchase_orders**, **subcontracts**,
  **variation_orders**, **progress_billings**, **actual_costs**.

The authoritative definitions live in `backend/src/db.js`.
