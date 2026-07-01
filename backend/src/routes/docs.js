import { Router } from "express";

// Phase 11 — API documentation. Serves an OpenAPI 3.0 spec at /api/openapi.json
// and a Swagger UI page at /api/docs (UI loaded from CDN — no extra dependency).
const router = Router();

const openapi = {
  openapi: "3.0.3",
  info: {
    title: "Project Estimator Pro API",
    version: "1.0.0",
    description: "Construction estimating, procurement, cost control and enterprise platform API.",
  },
  servers: [{ url: "/api" }],
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "opaque-session-token" } },
  },
  security: [{ bearerAuth: [] }],
  tags: [
    { name: "Auth" }, { name: "Projects" }, { name: "Estimate" }, { name: "Catalogs" },
    { name: "Reports" }, { name: "Procurement" }, { name: "Purchasing" }, { name: "Cost Control" },
    { name: "Organization" }, { name: "Settings" }, { name: "Admin" }, { name: "Enterprise" },
  ],
  paths: {
    "/auth/login": { post: { tags: ["Auth"], summary: "Authenticate and receive access + refresh tokens",
      requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { username: { type: "string", example: "admin" }, password: { type: "string", example: "admin123" }, rememberMe: { type: "boolean" } }, required: ["username", "password"] } } } },
      responses: { 200: { description: "OK — { token, refreshToken, user }" }, 401: { description: "Invalid credentials" } } } },
    "/auth/refresh": { post: { tags: ["Auth"], summary: "Rotate the access token using a refresh token", responses: { 200: { description: "New token pair" }, 401: { description: "Invalid/expired refresh token" } } } },
    "/projects": {
      get: { tags: ["Projects"], summary: "List projects", responses: { 200: { description: "Array of projects" } } },
      post: { tags: ["Projects"], summary: "Create a project", requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { name: { type: "string" }, client: { type: "string" } }, required: ["name"] } } } }, responses: { 201: { description: "Created" }, 400: { description: "Validation error" } } },
    },
    "/projects/{id}": { get: { tags: ["Projects"], summary: "Get a project", parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], responses: { 200: { description: "Project" }, 404: { description: "Not found" } } } },
    "/estimate/project/{id}/calculate": { get: { tags: ["Estimate"], summary: "Run the cost engine for a project", parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], responses: { 200: { description: "Full cost waterfall" } } } },
    "/reports/types": { get: { tags: ["Reports"], summary: "List available report types", responses: { 200: { description: "Report type list" } } } },
    "/reports/generate/{reportType}": { get: { tags: ["Reports"], summary: "Generate a report", parameters: [{ name: "reportType", in: "path", required: true, schema: { type: "string" } }, { name: "projectId", in: "query", schema: { type: "integer" } }], responses: { 200: { description: "Report data" } } } },
    "/purchasing/rfqs": { get: { tags: ["Purchasing"], summary: "List RFQs" }, post: { tags: ["Purchasing"], summary: "Create an RFQ (optionally from estimate items)" } },
    "/purchasing/rfqs/{id}/bid-comparison": { get: { tags: ["Purchasing"], summary: "Side-by-side bid comparison", parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], responses: { 200: { description: "Columns with lowest/best-value flags" } } } },
    "/cost-control/budget-vs-actual/{projectId}": { get: { tags: ["Cost Control"], summary: "Budget vs actual with variance", parameters: [{ name: "projectId", in: "path", required: true, schema: { type: "integer" } }], responses: { 200: { description: "Budget/actual/variance" } } } },
    "/cost-control/earned-value/{projectId}": { get: { tags: ["Cost Control"], summary: "Earned value metrics (PV/EV/AC/CV/SV/CPI/SPI/EAC/ETC/VAC)", parameters: [{ name: "projectId", in: "path", required: true, schema: { type: "integer" } }], responses: { 200: { description: "EVM metrics" } } } },
    "/cost-control/alerts/{projectId}": { get: { tags: ["Cost Control"], summary: "Cost-control alerts", parameters: [{ name: "projectId", in: "path", required: true, schema: { type: "integer" } }], responses: { 200: { description: "Alert list" } } } },
    "/organization/company": { get: { tags: ["Organization"], summary: "Company profile" }, put: { tags: ["Organization"], summary: "Update company profile" } },
    "/settings": { get: { tags: ["Settings"], summary: "Get application settings" }, put: { tags: ["Settings"], summary: "Update application settings" } },
    "/admin/backups": { get: { tags: ["Admin"], summary: "Backup history" }, post: { tags: ["Admin"], summary: "Create a database backup" } },
    "/admin/export/{scope}": { get: { tags: ["Admin"], summary: "Export data (database|project|catalogs|users|organization) as JSON", parameters: [{ name: "scope", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "JSON export" } } } },
    "/admin/import": { post: { tags: ["Admin"], summary: "Import a JSON export bundle", responses: { 200: { description: "{ inserted }" } } } },
    "/health": { get: { tags: ["Enterprise"], summary: "Health check", responses: { 200: { description: "{ status: 'ok' }" } } } },
  },
};

router.get("/openapi.json", (req, res) => res.json(openapi));

router.get("/docs", (req, res) => {
  res.type("html").send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Project Estimator Pro — API Docs</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css">
</head><body>
<div id="swagger-ui"></div>
<script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>
  window.ui = SwaggerUIBundle({ url: "/api/openapi.json", dom_id: "#swagger-ui" });
</script>
</body></html>`);
});

export default router;
