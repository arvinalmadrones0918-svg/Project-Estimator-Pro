import express from "express";
import cors from "cors";
import materialsRouter from "./routes/materials.js";
import laborSpecializationsRouter from "./routes/laborSpecializations.js";
import equipmentRouter from "./routes/equipment.js";
import projectsRouter from "./routes/projects.js";
import wbsRouter from "./routes/wbs.js";
import modulesRouter from "./routes/modules.js";
import assembliesRouter from "./routes/assemblies.js";
import estimateRouter from "./routes/estimate.js";
import suppliersRouter from "./routes/suppliers.js";
import procurementRouter from "./routes/procurement.js";
import upaRouter from "./routes/upa.js";
import reportsRouter from "./routes/reports.js";
import generalRequirementsRouter from "./routes/generalRequirements.js";
import analyticsRouter from "./routes/analytics.js";
import excelRouter from "./routes/excel.js";
import authRouter from "./routes/auth.js";
import usersRouter from "./routes/users.js";
import enterpriseRouter from "./routes/enterprise.js";
import { authOptional } from "./services/auth.js";
import {
  costControlRouter, purchaseOrdersRouter, subcontractsRouter,
  variationOrdersRouter, progressBillingsRouter, actualCostsRouter,
} from "./routes/costControl.js";
import {
  clientsRouter, tendersRouter, drawingsRouter, specificationsRouter,
  addendaRouter, rfisRouter, documentsRouter, miscRouter,
} from "./routes/tendering.js";
import { makeCatalogRouter } from "./routes/catalogRouter.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

// Phase 12: attach req.user from the bearer token when present. Non-blocking,
// so all existing routes keep working unauthenticated (backward compatible).
app.use(authOptional);

// Auth + multi-user enterprise routes.
app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/enterprise", enterpriseRouter);
app.use("/api/cost-control", costControlRouter);
app.use("/api/purchase-orders", purchaseOrdersRouter);
app.use("/api/subcontracts", subcontractsRouter);
app.use("/api/variation-orders", variationOrdersRouter);
app.use("/api/progress-billings", progressBillingsRouter);
app.use("/api/actual-costs", actualCostsRouter);

// Legacy simple routes — kept intact so the workspace NodeEditor dropdowns
// (which call GET /api/materials with no pagination params) still work.
app.use("/api/materials", materialsRouter);
app.use("/api/labor-specializations", laborSpecializationsRouter);
app.use("/api/equipment", equipmentRouter);

// Phase 3 enhanced catalog routes — same paths, richer query support.
// The catalog router's GET / handler falls through to the simple behaviour
// when no pagination/search params are present, so no existing callers break.
app.use("/api/catalog/materials", makeCatalogRouter("materials", "unitPrice", "material"));
app.use("/api/catalog/labor", makeCatalogRouter("labor_specializations", "hourlyRate", "labor", { hasUnit: false }));
app.use("/api/catalog/equipment", makeCatalogRouter("equipment", "unitPrice", "equipment"));
app.use("/api/catalog/subcontract", makeCatalogRouter("subcontract_catalog", "unitPrice", "subcontract"));
app.use("/api/catalog/other-costs", makeCatalogRouter("other_costs_catalog", "unitPrice", "other_cost"));

app.use("/api/projects", projectsRouter);
app.use("/api/wbs", wbsRouter);
app.use("/api/modules", modulesRouter);
app.use("/api/assemblies", assembliesRouter);
app.use("/api/estimate", estimateRouter);
app.use("/api/suppliers", suppliersRouter);
app.use("/api/procurement", procurementRouter);
app.use("/api/upa", upaRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/general-requirements", generalRequirementsRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/excel", excelRouter);
app.use("/api/clients", clientsRouter);
app.use("/api/tenders", tendersRouter);
app.use("/api/drawings", drawingsRouter);
app.use("/api/specifications", specificationsRouter);
app.use("/api/addenda", addendaRouter);
app.use("/api/rfis", rfisRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/tendering", miscRouter);

// Unknown API routes → clean JSON 404 (instead of an HTML page).
app.use("/api", (req, res) => res.status(404).json({ error: `Not found: ${req.method} ${req.path}` }));

// Centralized error handler → JSON, never leaking a stack trace to clients.
// Malformed JSON bodies and any thrown route error land here.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || (err.type === "entity.parse.failed" ? 400 : 500);
  if (status >= 500) console.error("Unhandled error:", err.message);
  res.status(status).json({ error: status === 400 ? "Invalid request body" : (err.expose ? err.message : "Internal server error") });
});

// Exported so Supertest (and other harnesses) can mount the app without
// binding a port. The server only listens when run directly, not under test.
export default app;

if (process.env.NODE_ENV !== "test") {
  const port = process.env.PORT || 4000;
  app.listen(port, () => {
    console.log(`Estimator backend listening on port ${port}`);
  });
}
