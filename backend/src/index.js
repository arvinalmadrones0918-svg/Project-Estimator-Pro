import express from "express";
import cors from "cors";
import materialsRouter from "./routes/materials.js";
import laborSpecializationsRouter from "./routes/laborSpecializations.js";
import equipmentRouter from "./routes/equipment.js";
import projectsRouter from "./routes/projects.js";
import wbsRouter from "./routes/wbs.js";
import modulesRouter from "./routes/modules.js";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/materials", materialsRouter);
app.use("/api/labor-specializations", laborSpecializationsRouter);
app.use("/api/equipment", equipmentRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/wbs", wbsRouter);
app.use("/api/modules", modulesRouter);

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Estimator backend listening on port ${port}`);
});
