import { Router } from "express";
import { db } from "../db.js";
import { calculateAssemblyResult } from "../services/costEngine.js";

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

// totalCost (and its cost-type breakdown) comes from the engine — the single
// source of truth — so the per-item list here is display-only.
function withTotalCost(assembly) {
  const items = getAssemblyItems(assembly.id);
  const calc = calculateAssemblyResult(assembly.id);
  return { ...assembly, items, totalCost: calc.total, breakdown: calc };
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
  const { code, name, description, unit, version, category } = req.body;
  if (!name || !unit) {
    return res.status(400).json({ error: "name and unit are required" });
  }
  const result = db
    .prepare(
      `INSERT INTO assemblies (code, name, description, unit, version, category, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
    .run(code ?? null, name, description ?? null, unit, Number(version ?? 1), category ?? null);
  res.status(201).json(withTotalCost(db.prepare("SELECT * FROM assemblies WHERE id = ?").get(result.lastInsertRowid)));
});

router.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM assemblies WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const { code, name, description, unit, version, isActive, category } = req.body;
  db.prepare(
    `UPDATE assemblies
     SET code = ?, name = ?, description = ?, unit = ?, version = ?, isActive = ?, category = ?, updatedAt = datetime('now')
     WHERE id = ?`
  ).run(
    code !== undefined ? code : existing.code,
    name ?? existing.name,
    description !== undefined ? description : existing.description,
    unit ?? existing.unit,
    version != null ? Number(version) : existing.version,
    isActive !== undefined ? Number(Boolean(isActive)) : existing.isActive,
    category !== undefined ? category : existing.category,
    id
  );
  res.json(withTotalCost(db.prepare("SELECT * FROM assemblies WHERE id = ?").get(id)));
});

// Duplicate an assembly (deep copy: header + all items). The copy is active.
router.post("/:id/duplicate", (req, res) => {
  const id = Number(req.params.id);
  const src = db.prepare("SELECT * FROM assemblies WHERE id = ?").get(id);
  if (!src) return res.status(404).json({ error: "Not found" });
  const copyId = db.prepare(
    `INSERT INTO assemblies (code, name, description, unit, version, category, isActive, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, 1, ?, 1, datetime('now'), datetime('now'))`
  ).run(src.code ? `${src.code}-COPY` : null, `${src.name} (Copy)`, src.description, src.unit, src.category).lastInsertRowid;
  const items = db.prepare("SELECT * FROM assembly_items WHERE assemblyId = ?").all(id);
  const ins = db.prepare(
    `INSERT INTO assembly_items (assemblyId, itemType, materialId, specializationId, equipmentId, childAssemblyId, childUpaId, description, quantity, unitPriceAtEntry, hourlyRateAtEntry, cost, notes, sortOrder, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
  );
  for (const it of items) {
    ins.run(copyId, it.itemType, it.materialId, it.specializationId, it.equipmentId, it.childAssemblyId ?? null, it.childUpaId ?? null,
      it.description, it.quantity, it.unitPriceAtEntry, it.hourlyRateAtEntry, it.cost, it.notes, it.sortOrder);
  }
  res.status(201).json(withTotalCost(db.prepare("SELECT * FROM assemblies WHERE id = ?").get(copyId)));
});

// Archive / restore (soft, via isActive) — kept distinct from delete for clarity.
router.post("/:id/archive", (req, res) => {
  db.prepare("UPDATE assemblies SET isActive = 0, updatedAt = datetime('now') WHERE id = ?").run(Number(req.params.id));
  res.json(withTotalCost(db.prepare("SELECT * FROM assemblies WHERE id = ?").get(Number(req.params.id))));
});
router.post("/:id/restore", (req, res) => {
  db.prepare("UPDATE assemblies SET isActive = 1, updatedAt = datetime('now') WHERE id = ?").run(Number(req.params.id));
  res.json(withTotalCost(db.prepare("SELECT * FROM assemblies WHERE id = ?").get(Number(req.params.id))));
});

// Toggle favorite (for the dashboard's Favorite Assemblies list).
router.post("/:id/favorite", (req, res) => {
  const id = Number(req.params.id);
  const a = db.prepare("SELECT isFavorite FROM assemblies WHERE id = ?").get(id);
  if (!a) return res.status(404).json({ error: "Not found" });
  db.prepare("UPDATE assemblies SET isFavorite = ? WHERE id = ?").run(a.isFavorite ? 0 : 1, id);
  res.json(withTotalCost(db.prepare("SELECT * FROM assemblies WHERE id = ?").get(id)));
});

// Dashboard statistics: totals, most used (by module references), recently
// modified, and favorites.
router.get("/stats/dashboard", (req, res) => {
  const total = db.prepare("SELECT COUNT(*) AS c FROM assemblies WHERE isActive = 1").get().c;
  const archived = db.prepare("SELECT COUNT(*) AS c FROM assemblies WHERE isActive = 0").get().c;
  const byCategory = db.prepare("SELECT COALESCE(category,'Uncategorized') AS category, COUNT(*) AS count FROM assemblies WHERE isActive = 1 GROUP BY category ORDER BY count DESC").all();
  const mostUsed = db.prepare(
    `SELECT a.id, a.code, a.name, COUNT(ma.id) AS uses
     FROM assemblies a LEFT JOIN module_assemblies ma ON ma.assemblyId = a.id
     WHERE a.isActive = 1 GROUP BY a.id HAVING uses > 0 ORDER BY uses DESC, a.name LIMIT 10`
  ).all();
  const recent = db.prepare("SELECT id, code, name, category, updatedAt FROM assemblies WHERE isActive = 1 ORDER BY updatedAt DESC LIMIT 10").all();
  const favorites = db.prepare("SELECT id, code, name, category FROM assemblies WHERE isActive = 1 AND isFavorite = 1 ORDER BY name LIMIT 20").all();
  res.json({ total, archived, byCategory, mostUsed, recent, favorites });
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

// Nested assembly item: reference another assembly as a child of this one.
router.post("/:id/items/assembly", (req, res) => {
  const assemblyId = Number(req.params.id);
  const { childAssemblyId, quantity, notes } = req.body;
  if (!childAssemblyId || quantity == null) {
    return res.status(400).json({ error: "childAssemblyId and quantity are required" });
  }
  if (Number(childAssemblyId) === assemblyId) {
    return res.status(400).json({ error: "An assembly cannot contain itself" });
  }
  const child = db.prepare("SELECT id FROM assemblies WHERE id = ?").get(Number(childAssemblyId));
  if (!child) return res.status(400).json({ error: "childAssemblyId does not exist" });
  const result = db
    .prepare(
      `INSERT INTO assembly_items (assemblyId, itemType, childAssemblyId, quantity, notes, createdAt, updatedAt)
       VALUES (?, 'assembly', ?, ?, ?, datetime('now'), datetime('now'))`
    )
    .run(assemblyId, Number(childAssemblyId), Number(quantity), notes ?? null);
  touchAssembly(assemblyId);
  res.status(201).json(db.prepare("SELECT * FROM assembly_items WHERE id = ?").get(result.lastInsertRowid));
});

// UPA item: an assembly may reference one or more Unit Price Analyses.
router.post("/:id/items/upa", (req, res) => {
  const assemblyId = Number(req.params.id);
  const { childUpaId, quantity, notes } = req.body;
  if (!childUpaId || quantity == null) {
    return res.status(400).json({ error: "childUpaId and quantity are required" });
  }
  const upa = db.prepare("SELECT id FROM unit_price_analyses WHERE id = ?").get(Number(childUpaId));
  if (!upa) return res.status(400).json({ error: "childUpaId does not exist" });
  const result = db
    .prepare(
      `INSERT INTO assembly_items (assemblyId, itemType, childUpaId, quantity, notes, createdAt, updatedAt)
       VALUES (?, 'upa', ?, ?, ?, datetime('now'), datetime('now'))`
    )
    .run(assemblyId, Number(childUpaId), Number(quantity), notes ?? null);
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
