import { Router } from "express";
import { db } from "../db.js";

const router = Router();

function getAssemblyItems(assemblyId) {
  return db
    .prepare(
      `SELECT ai.id, ai.itemType, ai.materialId, m.name AS materialName, m.unit AS materialUnit,
              ai.specializationId, s.name AS specializationName,
              ai.equipmentId, e.name AS equipmentName, e.unit AS equipmentUnit,
              ai.description, ai.quantity, ai.unitPriceAtEntry, ai.hourlyRateAtEntry, ai.cost,
              ai.notes, ai.sortOrder
       FROM assembly_items ai
       LEFT JOIN materials m ON m.id = ai.materialId
       LEFT JOIN labor_specializations s ON s.id = ai.specializationId
       LEFT JOIN equipment e ON e.id = ai.equipmentId
       WHERE ai.assemblyId = ?
       ORDER BY ai.sortOrder ASC, ai.id ASC`
    )
    .all(assemblyId)
    .map((row) => {
      let cost = 0;
      if (row.itemType === "material" || row.itemType === "equipment") {
        cost = row.quantity * row.unitPriceAtEntry;
      } else if (row.itemType === "labor") {
        cost = row.quantity * row.hourlyRateAtEntry;
      } else {
        cost = row.cost;
      }
      return { ...row, cost };
    });
}

function withTotalCost(assembly) {
  const items = getAssemblyItems(assembly.id);
  const totalCost = items.reduce((sum, item) => sum + item.cost, 0);
  return { ...assembly, items, totalCost };
}

router.get("/", (req, res) => {
  const includeInactive = req.query.includeInactive === "true";
  const assemblies = includeInactive
    ? db.prepare("SELECT * FROM assemblies ORDER BY name ASC").all()
    : db.prepare("SELECT * FROM assemblies WHERE isActive = 1 ORDER BY name ASC").all();
  res.json(assemblies.map(withTotalCost));
});

router.get("/:id", (req, res) => {
  const id = Number(req.params.id);
  const assembly = db.prepare("SELECT * FROM assemblies WHERE id = ?").get(id);
  if (!assembly) return res.status(404).json({ error: "Not found" });
  res.json(withTotalCost(assembly));
});

router.post("/", (req, res) => {
  const { code, name, description, unit, version } = req.body;
  if (!name || !unit) {
    return res.status(400).json({ error: "name and unit are required" });
  }
  const result = db
    .prepare(
      `INSERT INTO assemblies (code, name, description, unit, version, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
    .run(code ?? null, name, description ?? null, unit, Number(version ?? 1));
  res.status(201).json(withTotalCost(db.prepare("SELECT * FROM assemblies WHERE id = ?").get(result.lastInsertRowid)));
});

router.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM assemblies WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const { code, name, description, unit, version, isActive } = req.body;
  db.prepare(
    `UPDATE assemblies
     SET code = ?, name = ?, description = ?, unit = ?, version = ?, isActive = ?, updatedAt = datetime('now')
     WHERE id = ?`
  ).run(
    code !== undefined ? code : existing.code,
    name ?? existing.name,
    description !== undefined ? description : existing.description,
    unit ?? existing.unit,
    version != null ? Number(version) : existing.version,
    isActive !== undefined ? Number(Boolean(isActive)) : existing.isActive,
    id
  );
  res.json(withTotalCost(db.prepare("SELECT * FROM assemblies WHERE id = ?").get(id)));
});

// Assemblies are referenced by module_assemblies via assemblyId, so they are
// deactivated rather than hard-deleted to keep modules that used them intact.
router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  db.prepare("UPDATE assemblies SET isActive = 0, updatedAt = datetime('now') WHERE id = ?").run(id);
  res.status(204).end();
});

function touchAssembly(assemblyId) {
  db.prepare("UPDATE assemblies SET updatedAt = datetime('now') WHERE id = ?").run(assemblyId);
}

// Material item
router.post("/:id/items/materials", (req, res) => {
  const assemblyId = Number(req.params.id);
  const { materialId, quantity, notes } = req.body;
  if (!materialId || quantity == null) {
    return res.status(400).json({ error: "materialId and quantity are required" });
  }
  const material = db.prepare("SELECT unitPrice FROM materials WHERE id = ?").get(Number(materialId));
  if (!material) return res.status(400).json({ error: "materialId does not exist" });
  const result = db
    .prepare(
      `INSERT INTO assembly_items (assemblyId, itemType, materialId, quantity, unitPriceAtEntry, notes, createdAt, updatedAt)
       VALUES (?, 'material', ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
    .run(assemblyId, Number(materialId), Number(quantity), material.unitPrice, notes ?? null);
  touchAssembly(assemblyId);
  res.status(201).json(db.prepare("SELECT * FROM assembly_items WHERE id = ?").get(result.lastInsertRowid));
});

// Labor item
router.post("/:id/items/labor", (req, res) => {
  const assemblyId = Number(req.params.id);
  const { specializationId, quantity, notes } = req.body;
  if (!specializationId || quantity == null) {
    return res.status(400).json({ error: "specializationId and quantity are required" });
  }
  const spec = db.prepare("SELECT hourlyRate FROM labor_specializations WHERE id = ?").get(Number(specializationId));
  if (!spec) return res.status(400).json({ error: "specializationId does not exist" });
  const result = db
    .prepare(
      `INSERT INTO assembly_items (assemblyId, itemType, specializationId, quantity, hourlyRateAtEntry, notes, createdAt, updatedAt)
       VALUES (?, 'labor', ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
    .run(assemblyId, Number(specializationId), Number(quantity), spec.hourlyRate, notes ?? null);
  touchAssembly(assemblyId);
  res.status(201).json(db.prepare("SELECT * FROM assembly_items WHERE id = ?").get(result.lastInsertRowid));
});

// Equipment item
router.post("/:id/items/equipment", (req, res) => {
  const assemblyId = Number(req.params.id);
  const { equipmentId, quantity, notes } = req.body;
  if (!equipmentId || quantity == null) {
    return res.status(400).json({ error: "equipmentId and quantity are required" });
  }
  const item = db.prepare("SELECT unitPrice FROM equipment WHERE id = ?").get(Number(equipmentId));
  if (!item) return res.status(400).json({ error: "equipmentId does not exist" });
  const result = db
    .prepare(
      `INSERT INTO assembly_items (assemblyId, itemType, equipmentId, quantity, unitPriceAtEntry, notes, createdAt, updatedAt)
       VALUES (?, 'equipment', ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
    .run(assemblyId, Number(equipmentId), Number(quantity), item.unitPrice, notes ?? null);
  touchAssembly(assemblyId);
  res.status(201).json(db.prepare("SELECT * FROM assembly_items WHERE id = ?").get(result.lastInsertRowid));
});

// Subcontract item
router.post("/:id/items/subcontract", (req, res) => {
  const assemblyId = Number(req.params.id);
  const { description, cost, notes } = req.body;
  if (!description || cost == null) {
    return res.status(400).json({ error: "description and cost are required" });
  }
  const result = db
    .prepare(
      `INSERT INTO assembly_items (assemblyId, itemType, description, cost, notes, createdAt, updatedAt)
       VALUES (?, 'subcontract', ?, ?, ?, datetime('now'), datetime('now'))`
    )
    .run(assemblyId, description, Number(cost), notes ?? null);
  touchAssembly(assemblyId);
  res.status(201).json(db.prepare("SELECT * FROM assembly_items WHERE id = ?").get(result.lastInsertRowid));
});

// Other cost item
router.post("/:id/items/other-costs", (req, res) => {
  const assemblyId = Number(req.params.id);
  const { description, cost, notes } = req.body;
  if (!description || cost == null) {
    return res.status(400).json({ error: "description and cost are required" });
  }
  const result = db
    .prepare(
      `INSERT INTO assembly_items (assemblyId, itemType, description, cost, notes, createdAt, updatedAt)
       VALUES (?, 'other', ?, ?, ?, datetime('now'), datetime('now'))`
    )
    .run(assemblyId, description, Number(cost), notes ?? null);
  touchAssembly(assemblyId);
  res.status(201).json(db.prepare("SELECT * FROM assembly_items WHERE id = ?").get(result.lastInsertRowid));
});

router.put("/:id/items/:itemId", (req, res) => {
  const itemId = Number(req.params.itemId);
  const existing = db.prepare("SELECT * FROM assembly_items WHERE id = ?").get(itemId);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const { quantity, description, cost, notes } = req.body;
  db.prepare(
    `UPDATE assembly_items
     SET quantity = ?, description = ?, cost = ?, notes = ?, updatedAt = datetime('now')
     WHERE id = ?`
  ).run(
    quantity != null ? Number(quantity) : existing.quantity,
    description !== undefined ? description : existing.description,
    cost != null ? Number(cost) : existing.cost,
    notes !== undefined ? notes : existing.notes,
    itemId
  );
  touchAssembly(existing.assemblyId);
  res.json(db.prepare("SELECT * FROM assembly_items WHERE id = ?").get(itemId));
});

router.delete("/:id/items/:itemId", (req, res) => {
  const itemId = Number(req.params.itemId);
  const existing = db.prepare("SELECT * FROM assembly_items WHERE id = ?").get(itemId);
  if (existing) touchAssembly(existing.assemblyId);
  db.prepare("DELETE FROM assembly_items WHERE id = ?").run(itemId);
  res.status(204).end();
});

export default router;
