import { Router } from "express";
import { db } from "../db.js";
import { calculateModule, calculateProject, calculateAssemblyResult, calculateUPA } from "../services/costEngine.js";

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

// Assembly costs are owned by the cost engine (the single source of truth);
// this thin wrapper keeps the route code readable.
export function getAssemblyTotalCost(assemblyId) {
  return calculateAssemblyResult(assemblyId).total;
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

// UPA lines reference a Unit Price Analysis. The per-unit rate is frozen at
// entry (unitRateAtEntry); currentUnitRate is the live recalculation so the UI
// can flag drift, mirroring the catalog/assembly price-snapshot pattern.
function getUpaLines(workModuleId) {
  return db
    .prepare(
      `SELECT mu.id, mu.upaId, u.code, u.description AS name, u.unit,
              mu.unitRateAtEntry AS unitPrice, mu.quantity, mu.notes,
              mu.sortOrder, mu.markup, mu.status
       FROM module_upa mu
       JOIN unit_price_analyses u ON u.id = mu.upaId
       WHERE mu.workModuleId = ?
       ORDER BY mu.sortOrder ASC, mu.id ASC`
    )
    .all(workModuleId)
    .map((row) => ({
      ...row,
      lineType: "upa",
      currentUnitPrice: calculateUPA(row.upaId)?.unitRate ?? 0,
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
  const upaLines = getUpaLines(workModule.id);

  const materialCost = materialLines.reduce((s, l) => s + l.cost, 0);
  const laborCost = laborLines.reduce((s, l) => s + l.cost, 0);
  const equipmentCost = equipmentLines.reduce((s, l) => s + l.cost, 0);
  const subcontractCost = subcontractLines.reduce((s, l) => s + l.cost, 0);
  const otherCost = otherCostLines.reduce((s, l) => s + l.cost, 0);
  const assemblyCost = assemblyLines.reduce((s, l) => s + l.cost, 0);
  const upaCost = upaLines.reduce((s, l) => s + l.cost, 0);

  return {
    ...workModule,
    materialLines,
    laborLines,
    equipmentLines,
    subcontractLines,
    otherCostLines,
    assemblyLines,
    upaLines,
    materialCost,
    laborCost,
    equipmentCost,
    subcontractCost,
    otherCost,
    assemblyCost,
    upaCost,
    totalCost: materialCost + laborCost + equipmentCost + subcontractCost + otherCost + assemblyCost + upaCost,
  };
}

// Project direct cost is delegated to the engine so the dashboard rollup and
// the estimate calculation never diverge.
export function getProjectTotalCost(projectId) {
  return calculateProject(projectId).waterfall.directCost;
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
  const { name, description, projectId, wbsCategoryId, wbsSubcategoryId, sortOrder,
    unit, quantity, markupPct, profitPct, remarks } = req.body;
  db.prepare(`UPDATE work_modules
     SET name = ?, description = ?, projectId = ?, wbsCategoryId = ?, wbsSubcategoryId = ?, sortOrder = ?,
         unit = ?, quantity = ?, markupPct = ?, profitPct = ?, remarks = ?,
         updatedAt = datetime('now')
     WHERE id = ?`).run(
    name ?? existing.name,
    description !== undefined ? description : existing.description,
    projectId !== undefined ? projectId : existing.projectId,
    wbsCategoryId !== undefined ? wbsCategoryId : existing.wbsCategoryId,
    wbsSubcategoryId !== undefined ? wbsSubcategoryId : existing.wbsSubcategoryId,
    sortOrder !== undefined ? Number(sortOrder) : existing.sortOrder,
    unit !== undefined ? unit : existing.unit,
    quantity !== undefined ? (quantity === null ? null : Number(quantity)) : existing.quantity,
    markupPct !== undefined ? Number(markupPct) : existing.markupPct,
    profitPct !== undefined ? Number(profitPct) : existing.profitPct,
    remarks !== undefined ? remarks : existing.remarks,
    id
  );
  res.json(db.prepare("SELECT * FROM work_modules WHERE id = ?").get(id));
});

router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  db.prepare("UPDATE work_modules SET deletedAt = datetime('now') WHERE id = ?").run(id);
  res.status(204).end();
});

// Deep-copy a work item: the module row plus every line item (with their
// frozen price snapshots), so the duplicate's cost matches the original.
const MODULE_LINE_TABLES = [
  { table: "module_materials", cols: ["materialId", "quantity", "unitPriceAtEntry", "notes", "sortOrder", "markup", "status"] },
  { table: "module_labor", cols: ["specializationId", "quantity", "hourlyRateAtEntry", "notes", "sortOrder", "markup", "status"] },
  { table: "module_equipment", cols: ["equipmentId", "quantity", "unitPriceAtEntry", "notes", "sortOrder", "markup", "status"] },
  { table: "module_subcontract", cols: ["description", "cost", "notes", "sortOrder", "markup", "status", "code", "category", "supplier", "unit"] },
  { table: "module_other_costs", cols: ["description", "cost", "notes", "sortOrder", "markup", "status", "code", "category", "supplier", "unit"] },
  { table: "module_assemblies", cols: ["assemblyId", "quantity", "unitCostAtEntry", "notes", "sortOrder", "markup", "status"] },
  { table: "module_upa", cols: ["upaId", "quantity", "unitRateAtEntry", "matCostAtEntry", "laborCostAtEntry", "equipCostAtEntry", "subCostAtEntry", "otherCostAtEntry", "notes", "sortOrder", "markup", "status"] },
];

router.post("/:id/duplicate", (req, res) => {
  const id = Number(req.params.id);
  const src = db.prepare("SELECT * FROM work_modules WHERE id = ? AND deletedAt IS NULL").get(id);
  if (!src) return res.status(404).json({ error: "Not found" });
  db.exec("BEGIN");
  try {
    const result = db.prepare(
      `INSERT INTO work_modules (name, description, projectId, wbsCategoryId, wbsSubcategoryId, sortOrder, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).run(`${src.name} (Copy)`, src.description, src.projectId, src.wbsCategoryId, src.wbsSubcategoryId, src.sortOrder);
    const newId = result.lastInsertRowid;
    for (const { table, cols } of MODULE_LINE_TABLES) {
      // Some columns (markup/status/code/...) only exist after later migrations;
      // filter to the columns actually present in the table.
      const present = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
      const use = cols.filter((c) => present.has(c));
      const rows = db.prepare(`SELECT * FROM ${table} WHERE workModuleId = ?`).all(id);
      const insert = db.prepare(`INSERT INTO ${table} (workModuleId, ${use.join(", ")}, createdAt, updatedAt) VALUES (?, ${use.map(() => "?").join(", ")}, datetime('now'), datetime('now'))`);
      for (const row of rows) insert.run(newId, ...use.map((c) => row[c]));
    }
    db.exec("COMMIT");
    res.status(201).json(db.prepare("SELECT * FROM work_modules WHERE id = ?").get(newId));
  } catch (e) {
    db.exec("ROLLBACK");
    res.status(500).json({ error: e.message });
  }
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

// Insert a Cost Assembly into a module in one of two modes:
//   link — reference the master (auto-updates when the master changes)
//   copy — expand every assembly item into this module's own line items,
//          multiplied by quantity, so it is independent of the master.
router.post("/:id/insert-assembly", (req, res) => {
  const workModuleId = Number(req.params.id);
  const { assemblyId, quantity = 1, mode = "copy" } = req.body;
  if (!assemblyId) return res.status(400).json({ error: "assemblyId is required" });
  const assembly = db.prepare("SELECT id FROM assemblies WHERE id = ?").get(Number(assemblyId));
  if (!assembly) return res.status(400).json({ error: "assemblyId does not exist" });
  const qty = Number(quantity) || 1;

  if (mode === "link") {
    const unitCostAtEntry = getAssemblyTotalCost(Number(assemblyId));
    const r = db.prepare(
      "INSERT INTO module_assemblies (workModuleId, assemblyId, quantity, unitCostAtEntry, notes, markup, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, NULL, 0, 'included', datetime('now'), datetime('now'))"
    ).run(workModuleId, Number(assemblyId), qty, unitCostAtEntry);
    return res.status(201).json({ mode: "link", moduleAssemblyId: r.lastInsertRowid });
  }

  // Copy: expand items into the module's own line tables.
  const items = db.prepare("SELECT * FROM assembly_items WHERE assemblyId = ? ORDER BY sortOrder, id").all(Number(assemblyId));
  let inserted = 0;
  db.exec("BEGIN");
  try {
    for (const it of items) {
      if (it.itemType === "material" && it.materialId) {
        db.prepare("INSERT INTO module_materials (workModuleId, materialId, quantity, unitPriceAtEntry, notes) VALUES (?, ?, ?, ?, ?)")
          .run(workModuleId, it.materialId, (it.quantity || 0) * qty, it.unitPriceAtEntry ?? 0, it.notes ?? null);
      } else if (it.itemType === "labor" && it.specializationId) {
        db.prepare("INSERT INTO module_labor (workModuleId, specializationId, quantity, hourlyRateAtEntry, notes) VALUES (?, ?, ?, ?, ?)")
          .run(workModuleId, it.specializationId, (it.quantity || 0) * qty, it.hourlyRateAtEntry ?? 0, it.notes ?? null);
      } else if (it.itemType === "equipment" && it.equipmentId) {
        db.prepare("INSERT INTO module_equipment (workModuleId, equipmentId, quantity, unitPriceAtEntry, notes) VALUES (?, ?, ?, ?, ?)")
          .run(workModuleId, it.equipmentId, (it.quantity || 0) * qty, it.unitPriceAtEntry ?? 0, it.notes ?? null);
      } else if (it.itemType === "subcontract") {
        db.prepare("INSERT INTO module_subcontract (workModuleId, description, cost, notes) VALUES (?, ?, ?, ?)")
          .run(workModuleId, it.description ?? "Subcontract", (it.cost || 0) * qty, it.notes ?? null);
      } else if (it.itemType === "other") {
        db.prepare("INSERT INTO module_other_costs (workModuleId, description, cost, notes) VALUES (?, ?, ?, ?)")
          .run(workModuleId, it.description ?? "Other cost", (it.cost || 0) * qty, it.notes ?? null);
      }
      inserted += 1;
    }
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); return res.status(500).json({ error: e.message }); }
  res.status(201).json({ mode: "copy", itemsInserted: inserted });
});

// Insert a Rate Analysis (UPA) into a work item in one of two modes:
//   link   — reference the master with the per-unit breakdown frozen at entry
//            (existing module_upa mechanism, identical to POST /:id/upa).
//   expand — copy every UPA resource into this work item's own line tables,
//            multiplied by quantity, so it becomes an independent editable copy.
router.post("/:id/insert-upa", (req, res) => {
  const workModuleId = Number(req.params.id);
  const { upaId, quantity = 1, mode = "expand" } = req.body;
  if (!upaId) return res.status(400).json({ error: "upaId is required" });
  const qty = Number(quantity) || 1;

  if (mode === "link") {
    const calc = calculateUPA(Number(upaId));
    if (!calc) return res.status(400).json({ error: "upaId does not exist" });
    const r = db.prepare(
      `INSERT INTO module_upa (workModuleId, upaId, quantity, unitRateAtEntry,
        matCostAtEntry, laborCostAtEntry, equipCostAtEntry, subCostAtEntry, otherCostAtEntry,
        notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, datetime('now'), datetime('now'))`
    ).run(workModuleId, Number(upaId), qty, calc.unitRate,
      calc.materialCost, calc.laborCost, calc.equipmentCost, calc.subcontractCost, calc.otherCost);
    return res.status(201).json({ mode: "link", moduleUpaId: r.lastInsertRowid });
  }

  // Expand: copy resources into the work item's own line tables.
  const upa = db.prepare("SELECT id FROM unit_price_analyses WHERE id = ?").get(Number(upaId));
  if (!upa) return res.status(400).json({ error: "upaId does not exist" });
  const resources = db.prepare("SELECT * FROM upa_resources WHERE upaId = ? ORDER BY sortOrder, id").all(Number(upaId));

  // Effective quantity of a resource including waste, times the insert quantity.
  const effQty = (r) => (Number(r.quantity) || 0) * (1 + (Number(r.wastePct) || 0) / 100) * qty;

  let inserted = 0;
  db.exec("BEGIN");
  try {
    for (const r of resources) {
      if (r.resourceType === "material" && r.materialId) {
        const price = db.prepare("SELECT unitPrice FROM materials WHERE id = ?").get(r.materialId)?.unitPrice ?? 0;
        db.prepare("INSERT INTO module_materials (workModuleId, materialId, quantity, unitPriceAtEntry, notes) VALUES (?, ?, ?, ?, ?)")
          .run(workModuleId, r.materialId, effQty(r), price, r.notes ?? r.description ?? null);
      } else if (r.resourceType === "labor" && r.specializationId) {
        const rate = db.prepare("SELECT hourlyRate FROM labor_specializations WHERE id = ?").get(r.specializationId)?.hourlyRate ?? 0;
        // Prefer explicit man-hours; fall back to quantity.
        const hours = (Number(r.manhours) || Number(r.laborHours) || Number(r.quantity) || 0) * qty;
        db.prepare("INSERT INTO module_labor (workModuleId, specializationId, quantity, hourlyRateAtEntry, notes) VALUES (?, ?, ?, ?, ?)")
          .run(workModuleId, r.specializationId, hours, rate, r.notes ?? r.description ?? null);
      } else if (r.resourceType === "equipment" && r.equipmentId) {
        const price = db.prepare("SELECT unitPrice FROM equipment WHERE id = ?").get(r.equipmentId)?.unitPrice ?? 0;
        const hours = (Number(r.operatingHours) || Number(r.quantity) || 0) * qty;
        db.prepare("INSERT INTO module_equipment (workModuleId, equipmentId, quantity, unitPriceAtEntry, notes) VALUES (?, ?, ?, ?, ?)")
          .run(workModuleId, r.equipmentId, hours, price, r.notes ?? r.description ?? null);
      } else if (r.resourceType === "subcontract") {
        db.prepare("INSERT INTO module_subcontract (workModuleId, description, cost, notes) VALUES (?, ?, ?, ?)")
          .run(workModuleId, r.description ?? "Subcontract", (Number(r.frozenCost) || 0) * qty, r.notes ?? null);
      } else if (r.resourceType === "other") {
        db.prepare("INSERT INTO module_other_costs (workModuleId, description, cost, notes) VALUES (?, ?, ?, ?)")
          .run(workModuleId, r.description ?? "Other cost", (Number(r.frozenCost) || 0) * qty, r.notes ?? null);
      }
      inserted += 1;
    }
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); return res.status(500).json({ error: e.message }); }
  res.status(201).json({ mode: "expand", itemsInserted: inserted });
});

// Convert a work item's line items into a reusable Cost Assembly (master).
router.post("/:id/convert-to-assembly", (req, res) => {
  const moduleId = Number(req.params.id);
  const mod = db.prepare("SELECT * FROM work_modules WHERE id = ?").get(moduleId);
  if (!mod) return res.status(404).json({ error: "Work item not found" });
  const name = req.body?.name || `${mod.name} (Assembly)`;
  const asmId = db.prepare(
    "INSERT INTO assemblies (code, name, description, unit, version, category, isActive, createdAt, updatedAt) VALUES (NULL, ?, ?, ?, 1, ?, 1, datetime('now'), datetime('now'))"
  ).run(name, mod.description ?? null, mod.unit || "unit", req.body?.category ?? null).lastInsertRowid;

  const insMat = db.prepare("INSERT INTO assembly_items (assemblyId, itemType, materialId, quantity, unitPriceAtEntry, createdAt, updatedAt) VALUES (?, 'material', ?, ?, ?, datetime('now'), datetime('now'))");
  const insLab = db.prepare("INSERT INTO assembly_items (assemblyId, itemType, specializationId, quantity, hourlyRateAtEntry, createdAt, updatedAt) VALUES (?, 'labor', ?, ?, ?, datetime('now'), datetime('now'))");
  const insEqp = db.prepare("INSERT INTO assembly_items (assemblyId, itemType, equipmentId, quantity, unitPriceAtEntry, createdAt, updatedAt) VALUES (?, 'equipment', ?, ?, ?, datetime('now'), datetime('now'))");
  const insDesc = db.prepare("INSERT INTO assembly_items (assemblyId, itemType, description, cost, createdAt, updatedAt) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))");

  db.exec("BEGIN");
  try {
    for (const r of db.prepare("SELECT materialId, quantity, unitPriceAtEntry FROM module_materials WHERE workModuleId = ?").all(moduleId))
      insMat.run(asmId, r.materialId, r.quantity, r.unitPriceAtEntry);
    for (const r of db.prepare("SELECT specializationId, quantity, hourlyRateAtEntry FROM module_labor WHERE workModuleId = ?").all(moduleId))
      insLab.run(asmId, r.specializationId, r.quantity, r.hourlyRateAtEntry);
    for (const r of db.prepare("SELECT equipmentId, quantity, unitPriceAtEntry FROM module_equipment WHERE workModuleId = ?").all(moduleId))
      insEqp.run(asmId, r.equipmentId, r.quantity, r.unitPriceAtEntry);
    for (const r of db.prepare("SELECT description, cost FROM module_subcontract WHERE workModuleId = ?").all(moduleId))
      insDesc.run(asmId, "subcontract", r.description, r.cost);
    for (const r of db.prepare("SELECT description, cost FROM module_other_costs WHERE workModuleId = ?").all(moduleId))
      insDesc.run(asmId, "other", r.description, r.cost);
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); return res.status(500).json({ error: e.message }); }

  res.status(201).json(db.prepare("SELECT * FROM assemblies WHERE id = ?").get(asmId));
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

// UPA lines: freeze the full per-unit breakdown at entry so the estimate never
// shifts when the UPA or its catalog prices change later.
router.post("/:id/upa", (req, res) => {
  const workModuleId = Number(req.params.id);
  const { upaId, quantity, notes } = req.body;
  if (!upaId || quantity == null) return res.status(400).json({ error: "upaId and quantity are required" });
  const calc = calculateUPA(Number(upaId));
  if (!calc) return res.status(400).json({ error: "upaId does not exist" });
  const result = db
    .prepare(
      `INSERT INTO module_upa (workModuleId, upaId, quantity, unitRateAtEntry,
        matCostAtEntry, laborCostAtEntry, equipCostAtEntry, subCostAtEntry, otherCostAtEntry,
        notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
    .run(workModuleId, Number(upaId), Number(quantity), calc.unitRate,
      calc.materialCost, calc.laborCost, calc.equipmentCost, calc.subcontractCost, calc.otherCost,
      notes ?? null);
  res.status(201).json(db.prepare("SELECT * FROM module_upa WHERE id = ?").get(result.lastInsertRowid));
});

router.put("/:id/upa/:lineId", (req, res) => {
  const lineId = Number(req.params.lineId);
  const existing = db.prepare("SELECT * FROM module_upa WHERE id = ?").get(lineId);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const { quantity, notes, markup, status } = req.body;
  db.prepare("UPDATE module_upa SET quantity = ?, notes = ?, markup = ?, status = ?, updatedAt = datetime('now') WHERE id = ?").run(
    quantity != null ? Number(quantity) : existing.quantity,
    notes !== undefined ? notes : existing.notes,
    markup != null ? Number(markup) : existing.markup,
    status !== undefined ? status : existing.status,
    lineId
  );
  res.json(db.prepare("SELECT * FROM module_upa WHERE id = ?").get(lineId));
});

router.delete("/:id/upa/:lineId", (req, res) => {
  db.prepare("DELETE FROM module_upa WHERE id = ?").run(Number(req.params.lineId));
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
    upa: "module_upa",
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
