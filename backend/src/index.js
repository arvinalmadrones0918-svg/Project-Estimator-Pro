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
import { makeCatalogRouter } from "./routes/catalogRouter.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

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

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Estimator backend listening on port ${port}`);
});
