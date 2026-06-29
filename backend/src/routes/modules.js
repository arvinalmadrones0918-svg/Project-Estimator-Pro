import { Router } from "express";
import { db } from "../db.js";

const router = Router();

function getMaterialLines(workModuleId) {
  return db
    .prepare(
      `SELECT mm.id, mm.materialId, m.code, m.name, m.category, m.supplier,
              m.unit, m.unitPrice AS currentUnitPrice,
              mm.unitPriceAtEntry AS unitPrice, mm.quantity, mm.notes,
              mm.sortOrder, mm.markup, mm.status
       FROM module_materials mm
       JOIN materials m ON m.id = mm.materialId
       WHERE mm.workModuleId = ?
       ORDER BY mm.sortOrder ASC, mm.id ASC`
    )
    .all(workModuleId)
    .map((row) => ({ ...row, lineType: "material", cost: row.quantity * row.unitPrice }));
}

function getLaborLines(workModuleId) {
  return db
    .prepare(
      `SELECT ml.id, ml.specializationId, s.code, s.name, s.category, s.supplier,
              NULL AS unit, s.hourlyRate AS currentHourlyRate,
              ml.hourlyRateAtEntry AS hourlyRate, ml.quantity, ml.notes,
              ml.sortOrder, ml.markup, ml.status
       FROM module_labor ml
       JOIN labor_specializations s ON s.id = ml.specializationId
       WHERE ml.workModuleId = ?
       ORDER BY ml.sortOrder ASC, ml.id ASC`
    )
    .all(workModuleId)
    .map((row) => ({ ...row, lineType: "labor", unitPrice: row.hourlyRate, cost: row.quantity * row.hourlyRate }));
}

function getEquipmentLines(workModuleId) {
  return db
    .prepare(
      `SELECT me.id, me.equipmentId, e.code, e.name, e.category, e.supplier,
              e.unit, e.unitPrice AS currentUnitPrice,
              me.unitPriceAtEntry AS unitPrice, me.quantity, me.notes,
              me.sortOrder, me.markup, me.status
       FROM module_equipment me
       JOIN equipment e ON e.id = me.equipmentId
       WHERE me.workModuleId = ?
       ORDER BY me.sortOrder ASC, me.id ASC`
    )
    .all(workModuleId)
    .map((row) => ({ ...row, lineType: "equipment", cost: row.quantity * row.unitPrice }));
}

function getSubcontractLines(workModuleId) {
  return db
    .prepare(
      `SELECT id, code, description AS name, category, supplier, unit, cost,
              cost AS unitPrice, 1 AS quantity, notes, sortOrder, markup, status
       FROM module_subcontract
       WHERE workModuleId = ?
       ORDER BY sortOrder ASC, id ASC`
    )
    .all(workModuleId)
    .map((row) => ({ ...row, lineType: "subcontract" }));
}

function getOtherCostLines(workModuleId) {
  return db
    .prepare(
      `SELECT id, code, description AS name, category, supplier, unit, cost,
              cost AS unitPrice, 1 AS quantity, notes, sortOrder, markup, status
       FROM module_other_costs
       WHERE workModuleId = ?
       ORDER BY sortOrder ASC, id ASC`
    )
    .all(workModuleId)
    .map((row) => ({ ...row, lineType: "otherCost" }));
}

export function getAssemblyTotalCost(assemblyId) {
  const items = db.prepare("SELECT itemType, quantity, unitPriceAtEntry, hourlyRateAtEntry, cost FROM assembly_items WHERE assemblyId = ?").all(assemblyId);
  return items.reduce((sum, item) => {
    if (item.itemType === "material" || item.itemType === "equipment") return sum + item.quantity * item.unitPriceAtEntry;
    if (item.itemType === "labor") return sum + item.quantity * item.hourlyRateAtEntry;
    return sum + (item.cost ?? 0);
  }, 0);
}

function getAssemblyLines(workModuleId) {
  return db
    .prepare(
      `SELECT ma.id, ma.assemblyId, a.code, a.name, a.unit,
              ma.unitCostAtEntry AS unitPrice, ma.quantity, ma.notes,
              ma.sortOrder, ma.markup, ma.status
       FROM module_assemblies ma
       JOIN assemblies a ON a.id = ma.assemblyId
       WHERE ma.workModuleId = ?
       ORDER BY ma.sortOrder ASC, ma.id ASC`
    )
    .all(workModuleId)
    .map((row) => ({
      ...row,
      lineType: "assembly",
      currentUnitPrice: getAssemblyTotalCost(row.assemblyId),
      cost: row.quantity * row.unitPrice,
    }));
}

function withCostBreakdown(workModule) {
  const materialLines = getMaterialLines(workModule.id);
  const laborLines = getLaborLines(workModule.id);
  const equipmentLines = getEquipmentLines(workModule.id);
  const subcontractLines = getSubcontractLines(workModule.id);
  const otherCostLines = getOtherCostLines(workModule.id);
  const assemblyLines = getAssemblyLines(workModule.id);

  const materialCost = materialLines.reduce((s, l) => s + l.cost, 0);
  const laborCost = laborLines.reduce((s, l) => s + l.cost, 0);
  const equipmentCost = equipmentLines.reduce((s, l) => s + l.cost, 0);
  const subcontractCost = subcontractLines.reduce((s, l) => s + l.cost, 0);
  const otherCost = otherCostLines.reduce((s, l) => s + l.cost, 0);
  const assemblyCost = assemblyLines.reduce((s, l) => s + l.cost, 0);

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

export function getProjectTotalCost(projectId) {
  const modules = db.prepare("SELECT * FROM work_modules WHERE projectId = ? AND deletedAt IS NULL").all(projectId);
  return modules.reduce((sum, m) => sum + withCostBreakdown(m).totalCost, 0);
}

router.get("/", (req, res) => {
  const { projectId } = req.query;
  const modules = projectId
    ? db.prepare("SELECT * FROM work_modules WHERE deletedAt IS NULL AND projectId = ? ORDER BY sortOrder ASC, name ASC").all(Number(projectId))
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
    .prepare(`INSERT INTO work_modules (name, description, projectId, wbsCategoryId, wbsSubcategoryId, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`)
    .run(name, description ?? null, projectId ?? null, wbsCategoryId ?? null, wbsSubcategoryId ?? null);
  res.status(201).json(db.prepare("SELECT * FROM work_modules WHERE id = ?").get(result.lastInsertRowid));
});

router.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM work_modules WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const { name, description, projectId, wbsCategoryId, wbsSubcategoryId, sortOrder } = req.body;
  db.prepare(`UPDATE work_modules
     SET name = ?, description = ?, projectId = ?, wbsCategoryId = ?, wbsSubcategoryId = ?, sortOrder = ?,
         updatedAt = datetime('now')
     WHERE id = ?`).run(
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

router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  db.prepare("UPDATE work_modules SET deletedAt = datetime('now') WHERE id = ?").run(id);
  res.status(204).end();
});

// ── Material lines ─────────────────────────────────────────────────────────
router.post("/:id/materials", (req, res) => {
  const workModuleId = Number(req.params.id);
  const { materialId, quantity, notes, markup = 0, status = "included" } = req.body;
  if (!materialId || quantity == null) return res.status(400).json({ error: "materialId and quantity are required" });
  const material = db.prepare("SELECT unitPrice FROM materials WHERE id = ?").get(Number(materialId));
  if (!material) return res.status(400).json({ error: "materialId does not exist" });
  const result = db
    .prepare("INSERT INTO module_materials (workModuleId, materialId, quantity, unitPriceAtEntry, notes, markup, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))")
    .run(workModuleId, Number(materialId), Number(quantity), material.unitPrice, notes ?? null, Number(markup), status);
  res.status(201).json(db.prepare("SELECT * FROM module_materials WHERE id = ?").get(result.lastInsertRowid));
});

router.put("/:id/materials/:lineId", (req, res) => {
  const lineId = Number(req.params.lineId);
  const existing = db.prepare("SELECT * FROM module_materials WHERE id = ?").get(lineId);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const { quantity, notes, markup, status } = req.body;
  db.prepare("UPDATE module_materials SET quantity = ?, notes = ?, markup = ?, status = ?, updatedAt = datetime('now') WHERE id = ?").run(
    quantity != null ? Number(quantity) : existing.quantity,
    notes !== undefined ? notes : existing.notes,
    markup != null ? Number(markup) : existing.markup,
    status !== undefined ? status : existing.status,
    lineId
  );
  res.json(db.prepare("SELECT * FROM module_materials WHERE id = ?").get(lineId));
});

router.delete("/:id/materials/:lineId", (req, res) => {
  db.prepare("DELETE FROM module_materials WHERE id = ?").run(Number(req.params.lineId));
  res.status(204).end();
});

// ── Labor lines ────────────────────────────────────────────────────────────
router.post("/:id/labor", (req, res) => {
  const workModuleId = Number(req.params.id);
  const { specializationId, quantity, notes, markup = 0, status = "included" } = req.body;
  if (!specializationId || quantity == null) return res.status(400).json({ error: "specializationId and quantity are required" });
  const spec = db.prepare("SELECT hourlyRate FROM labor_specializations WHERE id = ?").get(Number(specializationId));
  if (!spec) return res.status(400).json({ error: "specializationId does not exist" });
  const result = db
    .prepare("INSERT INTO module_labor (workModuleId, specializationId, quantity, hourlyRateAtEntry, notes, markup, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))")
    .run(workModuleId, Number(specializationId), Number(quantity), spec.hourlyRate, notes ?? null, Number(markup), status);
  res.status(201).json(db.prepare("SELECT * FROM module_labor WHERE id = ?").get(result.lastInsertRowid));
});

router.put("/:id/labor/:lineId", (req, res) => {
  const lineId = Number(req.params.lineId);
  const existing = db.prepare("SELECT * FROM module_labor WHERE id = ?").get(lineId);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const { quantity, notes, markup, status } = req.body;
  db.prepare("UPDATE module_labor SET quantity = ?, notes = ?, markup = ?, status = ?, updatedAt = datetime('now') WHERE id = ?").run(
    quantity != null ? Number(quantity) : existing.quantity,
    notes !== undefined ? notes : existing.notes,
    markup != null ? Number(markup) : existing.markup,
    status !== undefined ? status : existing.status,
    lineId
  );
  res.json(db.prepare("SELECT * FROM module_labor WHERE id = ?").get(lineId));
});

router.delete("/:id/labor/:lineId", (req, res) => {
  db.prepare("DELETE FROM module_labor WHERE id = ?").run(Number(req.params.lineId));
  res.status(204).end();
});

// ── Equipment lines ────────────────────────────────────────────────────────
router.post("/:id/equipment", (req, res) => {
  const workModuleId = Number(req.params.id);
  const { equipmentId, quantity, notes, markup = 0, status = "included" } = req.body;
  if (!equipmentId || quantity == null) return res.status(400).json({ error: "equipmentId and quantity are required" });
  const item = db.prepare("SELECT unitPrice FROM equipment WHERE id = ?").get(Number(equipmentId));
  if (!item) return res.status(400).json({ error: "equipmentId does not exist" });
  const result = db
    .prepare("INSERT INTO module_equipment (workModuleId, equipmentId, quantity, unitPriceAtEntry, notes, markup, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))")
    .run(workModuleId, Number(equipmentId), Number(quantity), item.unitPrice, notes ?? null, Number(markup), status);
  res.status(201).json(db.prepare("SELECT * FROM module_equipment WHERE id = ?").get(result.lastInsertRowid));
});

router.put("/:id/equipment/:lineId", (req, res) => {
  const lineId = Number(req.params.lineId);
  const existing = db.prepare("SELECT * FROM module_equipment WHERE id = ?").get(lineId);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const { quantity, notes, markup, status } = req.body;
  db.prepare("UPDATE module_equipment SET quantity = ?, notes = ?, markup = ?, status = ?, updatedAt = datetime('now') WHERE id = ?").run(
    quantity != null ? Number(quantity) : existing.quantity,
    notes !== undefined ? notes : existing.notes,
    markup != null ? Number(markup) : existing.markup,
    status !== undefined ? status : existing.status,
    lineId
  );
  res.json(db.prepare("SELECT * FROM module_equipment WHERE id = ?").get(lineId));
});

router.delete("/:id/equipment/:lineId", (req, res) => {
  db.prepare("DELETE FROM module_equipment WHERE id = ?").run(Number(req.params.lineId));
  res.status(204).end();
});

// ── Subcontract lines ──────────────────────────────────────────────────────
router.post("/:id/subcontract", (req, res) => {
  const workModuleId = Number(req.params.id);
  const { description, cost, notes, code, category, supplier, unit, markup = 0, status = "included" } = req.body;
  if (!description || cost == null) return res.status(400).json({ error: "description and cost are required" });
  const result = db
    .prepare("INSERT INTO module_subcontract (workModuleId, code, description, category, supplier, unit, cost, notes, markup, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))")
    .run(workModuleId, code ?? null, description, category ?? null, supplier ?? null, unit ?? null, Number(cost), notes ?? null, Number(markup), status);
  res.status(201).json(db.prepare("SELECT * FROM module_subcontract WHERE id = ?").get(result.lastInsertRowid));
});

router.put("/:id/subcontract/:lineId", (req, res) => {
  const lineId = Number(req.params.lineId);
  const existing = db.prepare("SELECT * FROM module_subcontract WHERE id = ?").get(lineId);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const { description, cost, notes, code, category, supplier, unit, markup, status } = req.body;
  db.prepare("UPDATE module_subcontract SET code = ?, description = ?, category = ?, supplier = ?, unit = ?, cost = ?, notes = ?, markup = ?, status = ?, updatedAt = datetime('now') WHERE id = ?").run(
    code !== undefined ? code : existing.code,
    description ?? existing.description,
    category !== undefined ? category : existing.category,
    supplier !== undefined ? supplier : existing.supplier,
    unit !== undefined ? unit : existing.unit,
    cost != null ? Number(cost) : existing.cost,
    notes !== undefined ? notes : existing.notes,
    markup != null ? Number(markup) : existing.markup,
    status !== undefined ? status : existing.status,
    lineId
  );
  res.json(db.prepare("SELECT * FROM module_subcontract WHERE id = ?").get(lineId));
});

router.delete("/:id/subcontract/:lineId", (req, res) => {
  db.prepare("DELETE FROM module_subcontract WHERE id = ?").run(Number(req.params.lineId));
  res.status(204).end();
});

// ── Other cost lines ───────────────────────────────────────────────────────
router.post("/:id/other-costs", (req, res) => {
  const workModuleId = Number(req.params.id);
  const { description, cost, notes, code, category, supplier, unit, markup = 0, status = "included" } = req.body;
  if (!description || cost == null) return res.status(400).json({ error: "description and cost are required" });
  const result = db
    .prepare("INSERT INTO module_other_costs (workModuleId, code, description, category, supplier, unit, cost, notes, markup, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))")
    .run(workModuleId, code ?? null, description, category ?? null, supplier ?? null, unit ?? null, Number(cost), notes ?? null, Number(markup), status);
  res.status(201).json(db.prepare("SELECT * FROM module_other_costs WHERE id = ?").get(result.lastInsertRowid));
});

router.put("/:id/other-costs/:lineId", (req, res) => {
  const lineId = Number(req.params.lineId);
  const existing = db.prepare("SELECT * FROM module_other_costs WHERE id = ?").get(lineId);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const { description, cost, notes, code, category, supplier, unit, markup, status } = req.body;
  db.prepare("UPDATE module_other_costs SET code = ?, description = ?, category = ?, supplier = ?, unit = ?, cost = ?, notes = ?, markup = ?, status = ?, updatedAt = datetime('now') WHERE id = ?").run(
    code !== undefined ? code : existing.code,
    description ?? existing.description,
    category !== undefined ? category : existing.category,
    supplier !== undefined ? supplier : existing.supplier,
    unit !== undefined ? unit : existing.unit,
    cost != null ? Number(cost) : existing.cost,
    notes !== undefined ? notes : existing.notes,
    markup != null ? Number(markup) : existing.markup,
    status !== undefined ? status : existing.status,
    lineId
  );
  res.json(db.prepare("SELECT * FROM module_other_costs WHERE id = ?").get(lineId));
});

router.delete("/:id/other-costs/:lineId", (req, res) => {
  db.prepare("DELETE FROM module_other_costs WHERE id = ?").run(Number(req.params.lineId));
  res.status(204).end();
});

// ── Assembly lines ─────────────────────────────────────────────────────────
router.post("/:id/assemblies", (req, res) => {
  const workModuleId = Number(req.params.id);
  const { assemblyId, quantity, notes, markup = 0, status = "included" } = req.body;
  if (!assemblyId || quantity == null) return res.status(400).json({ error: "assemblyId and quantity are required" });
  const assembly = db.prepare("SELECT id FROM assemblies WHERE id = ?").get(Number(assemblyId));
  if (!assembly) return res.status(400).json({ error: "assemblyId does not exist" });
  const unitCostAtEntry = getAssemblyTotalCost(Number(assemblyId));
  const result = db
    .prepare("INSERT INTO module_assemblies (workModuleId, assemblyId, quantity, unitCostAtEntry, notes, markup, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))")
    .run(workModuleId, Number(assemblyId), Number(quantity), unitCostAtEntry, notes ?? null, Number(markup), status);
  res.status(201).json(db.prepare("SELECT * FROM module_assemblies WHERE id = ?").get(result.lastInsertRowid));
});

router.put("/:id/assemblies/:lineId", (req, res) => {
  const lineId = Number(req.params.lineId);
  const existing = db.prepare("SELECT * FROM module_assemblies WHERE id = ?").get(lineId);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const { quantity, notes, markup, status } = req.body;
  db.prepare("UPDATE module_assemblies SET quantity = ?, notes = ?, markup = ?, status = ?, updatedAt = datetime('now') WHERE id = ?").run(
    quantity != null ? Number(quantity) : existing.quantity,
    notes !== undefined ? notes : existing.notes,
    markup != null ? Number(markup) : existing.markup,
    status !== undefined ? status : existing.status,
    lineId
  );
  res.json(db.prepare("SELECT * FROM module_assemblies WHERE id = ?").get(lineId));
});

router.delete("/:id/assemblies/:lineId", (req, res) => {
  db.prepare("DELETE FROM module_assemblies WHERE id = ?").run(Number(req.params.lineId));
  res.status(204).end();
});

// ── Reorder lines within a section ────────────────────────────────────────
router.patch("/:id/lines/sort", (req, res) => {
  const { lineType, items } = req.body; // items: [{id, sortOrder}]
  const tableMap = {
    material: "module_materials",
    labor: "module_labor",
    equipment: "module_equipment",
    subcontract: "module_subcontract",
    otherCost: "module_other_costs",
    assembly: "module_assemblies",
  };
  const table = tableMap[lineType];
  if (!table || !Array.isArray(items)) return res.status(400).json({ error: "invalid lineType or items" });
  db.exec("BEGIN");
  try {
    const stmt = db.prepare(`UPDATE ${table} SET sortOrder = ?, updatedAt = datetime('now') WHERE id = ?`);
    for (const item of items) stmt.run(item.sortOrder, item.id);
    db.exec("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    db.exec("ROLLBACK");
    res.status(500).json({ error: e.message });
  }
});

export default router;
