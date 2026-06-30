# API Reference

Base URL: `/api`. All responses are JSON. Authentication uses a bearer token
(`Authorization: Bearer <token>`) obtained from `POST /api/auth/login`. Data
routes remain accessible for backward compatibility; administrative routes
require authentication and the appropriate permission. Errors return
`{ "error": "message" }` with an appropriate HTTP status.

## Authentication — `/api/auth`
- `POST /login` `{ username, password, rememberMe }` → `{ token, user }`
- `POST /logout`
- `GET /me` → current user
- `POST /change-password` `{ currentPassword, newPassword }`
- `POST /forgot-password` `{ username }`
- `POST /reset-password` `{ token, newPassword }`

## Users & Roles — `/api/users` (Administration permission)
- `GET /`, `POST /`, `PUT /:id`, `DELETE /:id`
- `GET /roles`, `POST /roles`, `PUT /roles/:id`

## Enterprise — `/api/enterprise` (authenticated)
- `POST /workflow/:projectId/:transition` (submit, resubmit, return, reject,
  approve, issue, archive)
- `GET /workflow/:projectId/approvals`
- `GET|POST|DELETE /locks/:projectId`, `POST /locks/:projectId/force`
- `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all`
- `GET|POST|DELETE /favorites/:projectId`
- `GET /dashboard`, `GET /activity`, `GET /activity/logins`, `GET /activity/approvals`

## Projects & WBS
- `/api/projects` — list/get/create/update/delete, `:id/archive`, `:id/restore`, `:id/duplicate`
- `/api/wbs` — categories & subcategories
- `/api/modules` — work modules + line items (materials/labor/equipment/
  subcontract/other-costs/assemblies/upa) + `/:id/lines/sort`

## Catalogs
- `/api/materials`, `/api/labor-specializations`, `/api/equipment` (simple)
- `/api/catalog/{materials|labor|equipment|subcontract|other-costs}` — paginated
  list, filters, CRUD, duplicate, activate/deactivate, soft-delete/restore,
  price-history, bulk, import (preview/confirm), export

## Estimate engine — `/api/estimate`
- `GET /project/:id/calculate`, `GET /module/:id/calculate`, `GET /assembly/:id/calculate`
- scenarios, indirect-costs (+ seed-defaults), revisions, audit

## Assemblies & UPA
- `/api/assemblies` — assemblies + items (incl. nested assembly and UPA items)
- `/api/upa` — UPA CRUD, resources (+sort), calculate, versions, filters

## Procurement — `/api/procurement` & `/api/suppliers`
- suppliers CRUD; quotations, comparison, select, dashboard, comparison-table,
  packages, rfq, audit

## General Requirements — `/api/general-requirements`
- categories, staff, templates, sheets (+ calculate, duplicate, apply-template),
  items (+ sort)

## Reports — `/api/reports`
- `GET /types`, `GET /generate/:reportType`, `GET /export/:reportType`
  (xlsx/csv), templates, history

## Excel — `/api/excel`
- `GET /entities`, `GET /template/:entity`, `POST /import/:entity/preview`,
  `POST /import/:entity/commit`, `POST /error-report/:entity`,
  `GET /export/summary-workbook`

## Tendering — `/api/clients`, `/api/tenders`, `/api/drawings`,
  `/api/specifications`, `/api/addenda`, `/api/rfis`, `/api/documents`,
  `/api/tendering` (change-log, bid-comparison, search)

## Cost Control — `/api/cost-control` & registers
- budgets (from-estimate, freeze), transfers (+approve/reject), budget-vs-actual,
  committed, earned-value, cash-flow, dashboard
- `/api/purchase-orders`, `/api/subcontracts`, `/api/variation-orders`,
  `/api/progress-billings`, `/api/actual-costs`

## Analytics — `/api/analytics`
- `GET /all`, `/executive`, `/health`, `/cost`, `/procurement`, `/tender`,
  `/resources`, `/portfolio`, `/kpi`, `/filters` (filterable by estimator,
  client, year, status)
