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

function getEquipmentLines(workModuleId) {
  return db
    .prepare(
      `SELECT me.id, me.equipmentId, e.name, e.unit, e.unitPrice, me.quantity
       FROM module_equipment me
       JOIN equipment e ON e.id = me.equipmentId
       WHERE me.workModuleId = ?
       ORDER BY me.id ASC`
    )
    .all(workModuleId)
    .map((row) => ({ ...row, cost: row.quantity * row.unitPrice }));
}

function getSubcontractLines(workModuleId) {
  return db
    .prepare(
      `SELECT id, description, cost
       FROM module_subcontract
       WHERE workModuleId = ?
       ORDER BY id ASC`
    )
    .all(workModuleId);
}

function getOtherCostLines(workModuleId) {
  return db
    .prepare(
      `SELECT id, description, cost
       FROM module_other_costs
       WHERE workModuleId = ?
       ORDER BY id ASC`
    )
    .all(workModuleId);
}

function withCostBreakdown(workModule) {
  const materialLines = getMaterialLines(workModule.id);
  const laborLines = getLaborLines(workModule.id);
  const equipmentLines = getEquipmentLines(workModule.id);
  const subcontractLines = getSubcontractLines(workModule.id);
  const otherCostLines = getOtherCostLines(workModule.id);

  const materialCost = materialLines.reduce((sum, l) => sum + l.cost, 0);
  const laborCost = laborLines.reduce((sum, l) => sum + l.cost, 0);
  const equipmentCost = equipmentLines.reduce((sum, l) => sum + l.cost, 0);
  const subcontractCost = subcontractLines.reduce((sum, l) => sum + l.cost, 0);
  const otherCost = otherCostLines.reduce((sum, l) => sum + l.cost, 0);

  return {
    ...workModule,
    materialLines,
    laborLines,
    equipmentLines,
    subcontractLines,
    otherCostLines,
    materialCost,
    laborCost,
    equipmentCost,
    subcontractCost,
    otherCost,
    totalCost: materialCost + laborCost + equipmentCost + subcontractCost + otherCost,
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
  const { name, description, projectId, wbsCategoryId, wbsSubcategoryId } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });
  const result = db
    .prepare(
      "INSERT INTO work_modules (name, description, projectId, wbsCategoryId, wbsSubcategoryId) VALUES (?, ?, ?, ?, ?)"
    )
    .run(name, description ?? null, projectId ?? null, wbsCategoryId ?? null, wbsSubcategoryId ?? null);
  res.status(201).json(db.prepare("SELECT * FROM work_modules WHERE id = ?").get(result.lastInsertRowid));
});

router.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM work_modules WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const { name, description, projectId, wbsCategoryId, wbsSubcategoryId } = req.body;
  db.prepare(
    `UPDATE work_modules
     SET name = ?, description = ?, projectId = ?, wbsCategoryId = ?, wbsSubcategoryId = ?
     WHERE id = ?`
  ).run(
    name ?? existing.name,
    description !== undefined ? description : existing.description,
    projectId !== undefined ? projectId : existing.projectId,
    wbsCategoryId !== undefined ? wbsCategoryId : existing.wbsCategoryId,
    wbsSubcategoryId !== undefined ? wbsSubcategoryId : existing.wbsSubcategoryId,
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

// Equipment lines
router.post("/:id/equipment", (req, res) => {
  const workModuleId = Number(req.params.id);
  const { equipmentId, quantity } = req.body;
  if (!equipmentId || quantity == null) {
    return res.status(400).json({ error: "equipmentId and quantity are required" });
  }
  const result = db
    .prepare("INSERT INTO module_equipment (workModuleId, equipmentId, quantity) VALUES (?, ?, ?)")
    .run(workModuleId, Number(equipmentId), Number(quantity));
  res.status(201).json({ id: result.lastInsertRowid, workModuleId, equipmentId: Number(equipmentId), quantity: Number(quantity) });
});

router.put("/:id/equipment/:lineId", (req, res) => {
  const lineId = Number(req.params.lineId);
  const { quantity } = req.body;
  db.prepare("UPDATE module_equipment SET quantity = ? WHERE id = ?").run(Number(quantity), lineId);
  res.json(db.prepare("SELECT * FROM module_equipment WHERE id = ?").get(lineId));
});

router.delete("/:id/equipment/:lineId", (req, res) => {
  const lineId = Number(req.params.lineId);
  db.prepare("DELETE FROM module_equipment WHERE id = ?").run(lineId);
  res.status(204).end();
});

// Subcontract lines
router.post("/:id/subcontract", (req, res) => {
  const workModuleId = Number(req.params.id);
  const { description, cost } = req.body;
  if (!description || cost == null) {
    return res.status(400).json({ error: "description and cost are required" });
  }
  const result = db
    .prepare("INSERT INTO module_subcontract (workModuleId, description, cost) VALUES (?, ?, ?)")
    .run(workModuleId, description, Number(cost));
  res.status(201).json({ id: result.lastInsertRowid, workModuleId, description, cost: Number(cost) });
});

router.put("/:id/subcontract/:lineId", (req, res) => {
  const lineId = Number(req.params.lineId);
  const existing = db.prepare("SELECT * FROM module_subcontract WHERE id = ?").get(lineId);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const { description, cost } = req.body;
  db.prepare("UPDATE module_subcontract SET description = ?, cost = ? WHERE id = ?").run(
    description ?? existing.description,
    cost != null ? Number(cost) : existing.cost,
    lineId
  );
  res.json(db.prepare("SELECT * FROM module_subcontract WHERE id = ?").get(lineId));
});

router.delete("/:id/subcontract/:lineId", (req, res) => {
  const lineId = Number(req.params.lineId);
  db.prepare("DELETE FROM module_subcontract WHERE id = ?").run(lineId);
  res.status(204).end();
});

// Other cost lines
router.post("/:id/other-costs", (req, res) => {
  const workModuleId = Number(req.params.id);
  const { description, cost } = req.body;
  if (!description || cost == null) {
    return res.status(400).json({ error: "description and cost are required" });
  }
  const result = db
    .prepare("INSERT INTO module_other_costs (workModuleId, description, cost) VALUES (?, ?, ?)")
    .run(workModuleId, description, Number(cost));
  res.status(201).json({ id: result.lastInsertRowid, workModuleId, description, cost: Number(cost) });
});

router.put("/:id/other-costs/:lineId", (req, res) => {
  const lineId = Number(req.params.lineId);
  const existing = db.prepare("SELECT * FROM module_other_costs WHERE id = ?").get(lineId);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const { description, cost } = req.body;
  db.prepare("UPDATE module_other_costs SET description = ?, cost = ? WHERE id = ?").run(
    description ?? existing.description,
    cost != null ? Number(cost) : existing.cost,
    lineId
  );
  res.json(db.prepare("SELECT * FROM module_other_costs WHERE id = ?").get(lineId));
});

router.delete("/:id/other-costs/:lineId", (req, res) => {
  const lineId = Number(req.params.lineId);
  db.prepare("DELETE FROM module_other_costs WHERE id = ?").run(lineId);
  res.status(204).end();
});

export default router;
