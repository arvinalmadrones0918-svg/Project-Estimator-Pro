import { Router } from "express";
import { db } from "../db.js";

const router = Router();

// Cost is computed from the price *snapshot at entry* (unitPriceAtEntry /
// hourlyRateAtEntry), not the live catalog price. Catalog rows still join in
// so the UI can show the current price alongside the locked-in one and flag
// when they've drifted.
function getMaterialLines(workModuleId) {
  return db
    .prepare(
      `SELECT mm.id, mm.materialId, m.name, m.unit, m.unitPrice AS currentUnitPrice,
              mm.unitPriceAtEntry AS unitPrice, mm.quantity, mm.notes, mm.sortOrder
       FROM module_materials mm
       JOIN materials m ON m.id = mm.materialId
       WHERE mm.workModuleId = ?
       ORDER BY mm.sortOrder ASC, mm.id ASC`
    )
    .all(workModuleId)
    .map((row) => ({ ...row, cost: row.quantity * row.unitPrice }));
}

function getLaborLines(workModuleId) {
  return db
    .prepare(
      `SELECT ml.id, ml.specializationId, s.name, s.hourlyRate AS currentHourlyRate,
              ml.hourlyRateAtEntry AS hourlyRate, ml.quantity, ml.notes, ml.sortOrder
       FROM module_labor ml
       JOIN labor_specializations s ON s.id = ml.specializationId
       WHERE ml.workModuleId = ?
       ORDER BY ml.sortOrder ASC, ml.id ASC`
    )
    .all(workModuleId)
    .map((row) => ({ ...row, cost: row.quantity * row.hourlyRate }));
}

function getEquipmentLines(workModuleId) {
  return db
    .prepare(
      `SELECT me.id, me.equipmentId, e.name, e.unit, e.unitPrice AS currentUnitPrice,
              me.unitPriceAtEntry AS unitPrice, me.quantity, me.notes, me.sortOrder
       FROM module_equipment me
       JOIN equipment e ON e.id = me.equipmentId
       WHERE me.workModuleId = ?
       ORDER BY me.sortOrder ASC, me.id ASC`
    )
    .all(workModuleId)
    .map((row) => ({ ...row, cost: row.quantity * row.unitPrice }));
}

function getSubcontractLines(workModuleId) {
  return db
    .prepare(
      `SELECT id, description, cost, notes, sortOrder
       FROM module_subcontract
       WHERE workModuleId = ?
       ORDER BY sortOrder ASC, id ASC`
    )
    .all(workModuleId);
}

function getOtherCostLines(workModuleId) {
  return db
    .prepare(
      `SELECT id, description, cost, notes, sortOrder
       FROM module_other_costs
       WHERE workModuleId = ?
       ORDER BY sortOrder ASC, id ASC`
    )
    .all(workModuleId);
}

// Assemblies don't store a precomputed total; it's always derived live from
// their child items so it can never drift out of sync.
export function getAssemblyTotalCost(assemblyId) {
  const items = db.prepare("SELECT itemType, quantity, unitPriceAtEntry, hourlyRateAtEntry, cost FROM assembly_items WHERE assemblyId = ?").all(assemblyId);
  return items.reduce((sum, item) => {
    if (item.itemType === "material" || item.itemType === "equipment") return sum + item.quantity * item.unitPriceAtEntry;
    if (item.itemType === "labor") return sum + item.quantity * item.hourlyRateAtEntry;
    return sum + (item.cost ?? 0);
  }, 0);
}

// A module can reference a cost assembly instead of (or alongside) catalog
// items directly. Cost uses the snapshot taken when the assembly was added
// (unitCostAtEntry), the same price-freeze pattern as every other line item.
function getAssemblyLines(workModuleId) {
  return db
    .prepare(
      `SELECT ma.id, ma.assemblyId, a.code, a.name, a.unit,
              ma.unitCostAtEntry AS unitCost, ma.quantity, ma.notes, ma.sortOrder
       FROM module_assemblies ma
       JOIN assemblies a ON a.id = ma.assemblyId
       WHERE ma.workModuleId = ?
       ORDER BY ma.sortOrder ASC, ma.id ASC`
    )
    .all(workModuleId)
    .map((row) => ({
      ...row,
      currentUnitCost: getAssemblyTotalCost(row.assemblyId),
      cost: row.quantity * row.unitCost,
    }));
}

function withCostBreakdown(workModule) {
  const materialLines = getMaterialLines(workModule.id);
  const laborLines = getLaborLines(workModule.id);
  const equipmentLines = getEquipmentLines(workModule.id);
  const subcontractLines = getSubcontractLines(workModule.id);
  const otherCostLines = getOtherCostLines(workModule.id);
  const assemblyLines = getAssemblyLines(workModule.id);

  const materialCost = materialLines.reduce((sum, l) => sum + l.cost, 0);
  const laborCost = laborLines.reduce((sum, l) => sum + l.cost, 0);
  const equipmentCost = equipmentLines.reduce((sum, l) => sum + l.cost, 0);
  const subcontractCost = subcontractLines.reduce((sum, l) => sum + l.cost, 0);
  const otherCost = otherCostLines.reduce((sum, l) => sum + l.cost, 0);
  const assemblyCost = assemblyLines.reduce((sum, l) => sum + l.cost, 0);

  return {
    ...workModule,
    materialLines,
    laborLines,
    equipmentLines,
    subcontractLines,
    otherCostLines,
    assemblyLines,
    materialCost,
    laborCost,
    equipmentCost,
    subcontractCost,
    otherCost,
    assemblyCost,
    totalCost: materialCost + laborCost + equipmentCost + subcontractCost + otherCost + assemblyCost,
  };
}

// Shared by the projects route so the dashboard can show a live rollup
// without duplicating the per-module cost-breakdown logic above.
export function getProjectTotalCost(projectId) {
  const modules = db
    .prepare("SELECT * FROM work_modules WHERE projectId = ? AND deletedAt IS NULL")
    .all(projectId);
  return modules.reduce((sum, m) => sum + withCostBreakdown(m).totalCost, 0);
}

router.get("/", (req, res) => {
  const { projectId } = req.query;
  const modules = projectId
    ? db
        .prepare(
          "SELECT * FROM work_modules WHERE deletedAt IS NULL AND projectId = ? ORDER BY sortOrder ASC, name ASC"
        )
        .all(Number(projectId))
    : db.prepare("SELECT * FROM work_modules WHERE deletedAt IS NULL ORDER BY sortOrder ASC, name ASC").all();
  res.json(modules.map(withCostBreakdown));
});

router.get("/:id", (req, res) => {
  const id = Number(req.params.id);
  const workModule = db.prepare("SELECT * FROM work_modules WHERE id = ? AND deletedAt IS NULL").get(id);
  if (!workModule) return res.status(404).json({ error: "Not found" });
  res.json(withCostBreakdown(workModule));
});

router.post("/", (req, res) => {
  const { name, description, projectId, wbsCategoryId, wbsSubcategoryId } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });
  const result = db
    .prepare(
      `INSERT INTO work_modules (name, description, projectId, wbsCategoryId, wbsSubcategoryId, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
    .run(name, description ?? null, projectId ?? null, wbsCategoryId ?? null, wbsSubcategoryId ?? null);
  res.status(201).json(db.prepare("SELECT * FROM work_modules WHERE id = ?").get(result.lastInsertRowid));
});

router.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM work_modules WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const { name, description, projectId, wbsCategoryId, wbsSubcategoryId, sortOrder } = req.body;
  db.prepare(
    `UPDATE work_modules
     SET name = ?, description = ?, projectId = ?, wbsCategoryId = ?, wbsSubcategoryId = ?, sortOrder = ?,
         updatedAt = datetime('now')
     WHERE id = ?`
  ).run(
    name ?? existing.name,
    description !== undefined ? description : existing.description,
    projectId !== undefined ? projectId : existing.projectId,
    wbsCategoryId !== undefined ? wbsCategoryId : existing.wbsCategoryId,
    wbsSubcategoryId !== undefined ? wbsSubcategoryId : existing.wbsSubcategoryId,
    sortOrder !== undefined ? Number(sortOrder) : existing.sortOrder,
    id
  );
  res.json(db.prepare("SELECT * FROM work_modules WHERE id = ?").get(id));
});

// Soft delete: archive the module (and keep its line items for audit/history)
// instead of removing it, so a project's historical totals never shift.
router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  db.prepare("UPDATE work_modules SET deletedAt = datetime('now') WHERE id = ?").run(id);
  res.status(204).end();
});

// Material lines
router.post("/:id/materials", (req, res) => {
  const workModuleId = Number(req.params.id);
  const { materialId, quantity, notes } = req.body;
  if (!materialId || quantity == null) {
    return res.status(400).json({ error: "materialId and quantity are required" });
  }
  const material = db.prepare("SELECT unitPrice FROM materials WHERE id = ?").get(Number(materialId));
  if (!material) return res.status(400).json({ error: "materialId does not exist" });
  const result = db
    .prepare(
      "INSERT INTO module_materials (workModuleId, materialId, quantity, unitPriceAtEntry, notes, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))"
    )
    .run(workModuleId, Number(materialId), Number(quantity), material.unitPrice, notes ?? null);
  res.status(201).json(db.prepare("SELECT * FROM module_materials WHERE id = ?").get(result.lastInsertRowid));
});

router.put("/:id/materials/:lineId", (req, res) => {
  const lineId = Number(req.params.lineId);
  const existing = db.prepare("SELECT * FROM module_materials WHERE id = ?").get(lineId);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const { quantity, notes } = req.body;
  db.prepare("UPDATE module_materials SET quantity = ?, notes = ?, updatedAt = datetime('now') WHERE id = ?").run(
    quantity != null ? Number(quantity) : existing.quantity,
    notes !== undefined ? notes : existing.notes,
    lineId
  );
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
  const { specializationId, quantity, notes } = req.body;
  if (!specializationId || quantity == null) {
    return res.status(400).json({ error: "specializationId and quantity are required" });
  }
  const spec = db.prepare("SELECT hourlyRate FROM labor_specializations WHERE id = ?").get(Number(specializationId));
  if (!spec) return res.status(400).json({ error: "specializationId does not exist" });
  const result = db
    .prepare(
      "INSERT INTO module_labor (workModuleId, specializationId, quantity, hourlyRateAtEntry, notes, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))"
    )
    .run(workModuleId, Number(specializationId), Number(quantity), spec.hourlyRate, notes ?? null);
  res.status(201).json(db.prepare("SELECT * FROM module_labor WHERE id = ?").get(result.lastInsertRowid));
});

router.put("/:id/labor/:lineId", (req, res) => {
  const lineId = Number(req.params.lineId);
  const existing = db.prepare("SELECT * FROM module_labor WHERE id = ?").get(lineId);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const { quantity, notes } = req.body;
  db.prepare("UPDATE module_labor SET quantity = ?, notes = ?, updatedAt = datetime('now') WHERE id = ?").run(
    quantity != null ? Number(quantity) : existing.quantity,
    notes !== undefined ? notes : existing.notes,
    lineId
  );
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
  const { equipmentId, quantity, notes } = req.body;
  if (!equipmentId || quantity == null) {
    return res.status(400).json({ error: "equipmentId and quantity are required" });
  }
  const item = db.prepare("SELECT unitPrice FROM equipment WHERE id = ?").get(Number(equipmentId));
  if (!item) return res.status(400).json({ error: "equipmentId does not exist" });
  const result = db
    .prepare(
      "INSERT INTO module_equipment (workModuleId, equipmentId, quantity, unitPriceAtEntry, notes, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))"
    )
    .run(workModuleId, Number(equipmentId), Number(quantity), item.unitPrice, notes ?? null);
  res.status(201).json(db.prepare("SELECT * FROM module_equipment WHERE id = ?").get(result.lastInsertRowid));
});

router.put("/:id/equipment/:lineId", (req, res) => {
  const lineId = Number(req.params.lineId);
  const existing = db.prepare("SELECT * FROM module_equipment WHERE id = ?").get(lineId);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const { quantity, notes } = req.body;
  db.prepare("UPDATE module_equipment SET quantity = ?, notes = ?, updatedAt = datetime('now') WHERE id = ?").run(
    quantity != null ? Number(quantity) : existing.quantity,
    notes !== undefined ? notes : existing.notes,
    lineId
  );
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
  const { description, cost, notes } = req.body;
  if (!description || cost == null) {
    return res.status(400).json({ error: "description and cost are required" });
  }
  const result = db
    .prepare("INSERT INTO module_subcontract (workModuleId, description, cost, notes, createdAt, updatedAt) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))")
    .run(workModuleId, description, Number(cost), notes ?? null);
  res.status(201).json(db.prepare("SELECT * FROM module_subcontract WHERE id = ?").get(result.lastInsertRowid));
});

router.put("/:id/subcontract/:lineId", (req, res) => {
  const lineId = Number(req.params.lineId);
  const existing = db.prepare("SELECT * FROM module_subcontract WHERE id = ?").get(lineId);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const { description, cost, notes } = req.body;
  db.prepare("UPDATE module_subcontract SET description = ?, cost = ?, notes = ?, updatedAt = datetime('now') WHERE id = ?").run(
    description ?? existing.description,
    cost != null ? Number(cost) : existing.cost,
    notes !== undefined ? notes : existing.notes,
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
  const { description, cost, notes } = req.body;
  if (!description || cost == null) {
    return res.status(400).json({ error: "description and cost are required" });
  }
  const result = db
    .prepare("INSERT INTO module_other_costs (workModuleId, description, cost, notes, createdAt, updatedAt) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))")
    .run(workModuleId, description, Number(cost), notes ?? null);
  res.status(201).json(db.prepare("SELECT * FROM module_other_costs WHERE id = ?").get(result.lastInsertRowid));
});

router.put("/:id/other-costs/:lineId", (req, res) => {
  const lineId = Number(req.params.lineId);
  const existing = db.prepare("SELECT * FROM module_other_costs WHERE id = ?").get(lineId);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const { description, cost, notes } = req.body;
  db.prepare("UPDATE module_other_costs SET description = ?, cost = ?, notes = ?, updatedAt = datetime('now') WHERE id = ?").run(
    description ?? existing.description,
    cost != null ? Number(cost) : existing.cost,
    notes !== undefined ? notes : existing.notes,
    lineId
  );
  res.json(db.prepare("SELECT * FROM module_other_costs WHERE id = ?").get(lineId));
});

router.delete("/:id/other-costs/:lineId", (req, res) => {
  const lineId = Number(req.params.lineId);
  db.prepare("DELETE FROM module_other_costs WHERE id = ?").run(lineId);
  res.status(204).end();
});

// Assembly lines
router.post("/:id/assemblies", (req, res) => {
  const workModuleId = Number(req.params.id);
  const { assemblyId, quantity, notes } = req.body;
  if (!assemblyId || quantity == null) {
    return res.status(400).json({ error: "assemblyId and quantity are required" });
  }
  const assembly = db.prepare("SELECT id FROM assemblies WHERE id = ?").get(Number(assemblyId));
  if (!assembly) return res.status(400).json({ error: "assemblyId does not exist" });
  const unitCostAtEntry = getAssemblyTotalCost(Number(assemblyId));
  const result = db
    .prepare(
      `INSERT INTO module_assemblies (workModuleId, assemblyId, quantity, unitCostAtEntry, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
    .run(workModuleId, Number(assemblyId), Number(quantity), unitCostAtEntry, notes ?? null);
  res.status(201).json(db.prepare("SELECT * FROM module_assemblies WHERE id = ?").get(result.lastInsertRowid));
});

router.put("/:id/assemblies/:lineId", (req, res) => {
  const lineId = Number(req.params.lineId);
  const existing = db.prepare("SELECT * FROM module_assemblies WHERE id = ?").get(lineId);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const { quantity, notes } = req.body;
  db.prepare("UPDATE module_assemblies SET quantity = ?, notes = ?, updatedAt = datetime('now') WHERE id = ?").run(
    quantity != null ? Number(quantity) : existing.quantity,
    notes !== undefined ? notes : existing.notes,
    lineId
  );
  res.json(db.prepare("SELECT * FROM module_assemblies WHERE id = ?").get(lineId));
});

router.delete("/:id/assemblies/:lineId", (req, res) => {
  const lineId = Number(req.params.lineId);
  db.prepare("DELETE FROM module_assemblies WHERE id = ?").run(lineId);
  res.status(204).end();
});

export default router;
