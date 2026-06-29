import { Router } from "express";
import { db } from "../db.js";

const router = Router();

function getMaterialLines(workModuleId) {
  return db
    .prepare(
      `SELECT mm.id, mm.materialId, m.name, m.unit, m.unitPrice, mm.quantity
       FROM module_materials mm
       JOIN materials m ON m.id = mm.materialId
       WHERE mm.workModuleId = ?
       ORDER BY mm.id ASC`
    )
    .all(workModuleId)
    .map((row) => ({ ...row, cost: row.quantity * row.unitPrice }));
}

function getLaborLines(workModuleId) {
  return db
    .prepare(
      `SELECT ml.id, ml.specializationId, s.name, s.hourlyRate, ml.quantity
       FROM module_labor ml
       JOIN labor_specializations s ON s.id = ml.specializationId
       WHERE ml.workModuleId = ?
       ORDER BY ml.id ASC`
    )
    .all(workModuleId)
    .map((row) => ({ ...row, cost: row.quantity * row.hourlyRate }));
}

function withCostBreakdown(workModule) {
  const materialLines = getMaterialLines(workModule.id);
  const laborLines = getLaborLines(workModule.id);
  const materialCost = materialLines.reduce((sum, l) => sum + l.cost, 0);
  const laborCost = laborLines.reduce((sum, l) => sum + l.cost, 0);
  return {
    ...workModule,
    materialLines,
    laborLines,
    materialCost,
    laborCost,
    totalCost: materialCost + laborCost,
  };
}

router.get("/", (req, res) => {
  const modules = db.prepare("SELECT * FROM work_modules ORDER BY name ASC").all();
  res.json(modules.map(withCostBreakdown));
});

router.get("/:id", (req, res) => {
  const id = Number(req.params.id);
  const workModule = db.prepare("SELECT * FROM work_modules WHERE id = ?").get(id);
  if (!workModule) return res.status(404).json({ error: "Not found" });
  res.json(withCostBreakdown(workModule));
});

router.post("/", (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });
  const result = db
    .prepare("INSERT INTO work_modules (name, description) VALUES (?, ?)")
    .run(name, description ?? null);
  res.status(201).json(db.prepare("SELECT * FROM work_modules WHERE id = ?").get(result.lastInsertRowid));
});

router.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM work_modules WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const { name, description } = req.body;
  db.prepare("UPDATE work_modules SET name = ?, description = ? WHERE id = ?").run(
    name ?? existing.name,
    description !== undefined ? description : existing.description,
    id
  );
  res.json(db.prepare("SELECT * FROM work_modules WHERE id = ?").get(id));
});

router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  db.prepare("DELETE FROM work_modules WHERE id = ?").run(id);
  res.status(204).end();
});

// Material lines
router.post("/:id/materials", (req, res) => {
  const workModuleId = Number(req.params.id);
  const { materialId, quantity } = req.body;
  if (!materialId || quantity == null) {
    return res.status(400).json({ error: "materialId and quantity are required" });
  }
  const result = db
    .prepare("INSERT INTO module_materials (workModuleId, materialId, quantity) VALUES (?, ?, ?)")
    .run(workModuleId, Number(materialId), Number(quantity));
  res.status(201).json({ id: result.lastInsertRowid, workModuleId, materialId: Number(materialId), quantity: Number(quantity) });
});

router.put("/:id/materials/:lineId", (req, res) => {
  const lineId = Number(req.params.lineId);
  const { quantity } = req.body;
  db.prepare("UPDATE module_materials SET quantity = ? WHERE id = ?").run(Number(quantity), lineId);
  res.json(db.prepare("SELECT * FROM module_materials WHERE id = ?").get(lineId));
});

router.delete("/:id/materials/:lineId", (req, res) => {
  const lineId = Number(req.params.lineId);
  db.prepare("DELETE FROM module_materials WHERE id = ?").run(lineId);
  res.status(204).end();
});

// Labor lines
router.post("/:id/labor", (req, res) => {
  const workModuleId = Number(req.params.id);
  const { specializationId, quantity } = req.body;
  if (!specializationId || quantity == null) {
    return res.status(400).json({ error: "specializationId and quantity are required" });
  }
  const result = db
    .prepare("INSERT INTO module_labor (workModuleId, specializationId, quantity) VALUES (?, ?, ?)")
    .run(workModuleId, Number(specializationId), Number(quantity));
  res.status(201).json({ id: result.lastInsertRowid, workModuleId, specializationId: Number(specializationId), quantity: Number(quantity) });
});

router.put("/:id/labor/:lineId", (req, res) => {
  const lineId = Number(req.params.lineId);
  const { quantity } = req.body;
  db.prepare("UPDATE module_labor SET quantity = ? WHERE id = ?").run(Number(quantity), lineId);
  res.json(db.prepare("SELECT * FROM module_labor WHERE id = ?").get(lineId));
});

router.delete("/:id/labor/:lineId", (req, res) => {
  const lineId = Number(req.params.lineId);
  db.prepare("DELETE FROM module_labor WHERE id = ?").run(lineId);
  res.status(204).end();
});

export default router;
