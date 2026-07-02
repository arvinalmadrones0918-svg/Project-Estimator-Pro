import { Router } from "express";
import { db } from "../db.js";

const router = Router();

// Master Materials Library fields beyond the always-present name/category/unit/
// unitPrice/code/isActive. Additive; inserted/updated selectively.
const LIB_FIELDS = [
  "description", "subcategory", "manufacturer", "brand", "model", "specification",
  "standard", "currency", "supplier", "preferredSupplier", "leadTime",
  "countryOfOrigin", "minOrderQty", "wasteFactor", "weight", "density", "notes",
];
const NUMERIC = new Set(["minOrderQty", "wasteFactor", "weight", "density"]);

// List with search + filters + pagination. Bare calls (no params) still return
// a plain array so existing callers keep working.
router.get("/", (req, res) => {
  const { search, category, subcategory, supplier, unit, status } = req.query;
  const includeInactive = req.query.includeInactive === "true" || status === "all" || status === "inactive";
  const where = [];
  const args = [];
  if (status === "inactive") where.push("isActive = 0");
  else if (!includeInactive) where.push("isActive = 1");
  if (search) {
    where.push("(name LIKE ? OR code LIKE ? OR brand LIKE ? OR category LIKE ? OR manufacturer LIKE ? OR specification LIKE ?)");
    const like = `%${search}%`;
    args.push(like, like, like, like, like, like);
  }
  if (category) { where.push("category = ?"); args.push(category); }
  if (subcategory) { where.push("subcategory = ?"); args.push(subcategory); }
  if (supplier) { where.push("(preferredSupplier = ? OR supplier = ?)"); args.push(supplier, supplier); }
  if (unit) { where.push("unit = ?"); args.push(unit); }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const total = db.prepare(`SELECT COUNT(*) AS c FROM materials ${whereSql}`).get(...args).c;
  const limit = req.query.limit != null ? Math.min(Number(req.query.limit), 20000) : null;
  const offset = Number(req.query.offset) || 0;
  const pageSql = limit != null ? ` LIMIT ${limit} OFFSET ${offset}` : "";
  const items = db.prepare(`SELECT * FROM materials ${whereSql} ORDER BY category, name ASC${pageSql}`).all(...args);

  if (req.query.meta === "true") return res.json({ items, total });
  res.json(items);
});

// Distinct values for filter dropdowns.
router.get("/filters", (req, res) => {
  const distinct = (col) => db.prepare(`SELECT DISTINCT ${col} AS v FROM materials WHERE ${col} IS NOT NULL AND ${col} != '' ORDER BY ${col}`).all().map((r) => r.v);
  res.json({
    categories: distinct("category"),
    subcategories: distinct("subcategory"),
    suppliers: distinct("preferredSupplier"),
    units: distinct("unit"),
  });
});

function buildValues(body, isUpdate) {
  const cols = [], vals = [];
  for (const f of LIB_FIELDS) {
    if (isUpdate ? body[f] !== undefined : body[f] != null) {
      cols.push(f);
      vals.push(NUMERIC.has(f) ? (body[f] === null || body[f] === "" ? null : Number(body[f])) : body[f]);
    }
  }
  return { cols, vals };
}

router.post("/", (req, res) => {
  const { name, category, unit, unitPrice, code } = req.body;
  if (!name || !category || !unit || unitPrice == null) {
    return res.status(400).json({ error: "name, category, unit, unitPrice are required" });
  }
  const { cols, vals } = buildValues(req.body, false);
  const allCols = ["name", "category", "unit", "unitPrice", "code", ...cols];
  const allVals = [name, category, unit, Number(unitPrice), code ?? null, ...vals];
  const result = db.prepare(
    `INSERT INTO materials (${allCols.join(", ")}, createdAt, updatedAt)
     VALUES (${allCols.map(() => "?").join(", ")}, datetime('now'), datetime('now'))`
  ).run(...allVals);
  res.status(201).json(db.prepare("SELECT * FROM materials WHERE id = ?").get(result.lastInsertRowid));
});

router.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM materials WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const { name, category, unit, unitPrice, code, isActive } = req.body;
  const base = {
    name: name ?? existing.name,
    category: category ?? existing.category,
    unit: unit ?? existing.unit,
    unitPrice: unitPrice != null ? Number(unitPrice) : existing.unitPrice,
    code: code !== undefined ? code : existing.code,
    isActive: isActive !== undefined ? Number(Boolean(isActive)) : existing.isActive,
  };
  const { cols, vals } = buildValues(req.body, true);
  const setCols = [...Object.keys(base), ...cols];
  const setVals = [...Object.values(base), ...vals];
  db.prepare(`UPDATE materials SET ${setCols.map((c) => `${c} = ?`).join(", ")}, updatedAt = datetime('now') WHERE id = ?`)
    .run(...setVals, id);
  res.json(db.prepare("SELECT * FROM materials WHERE id = ?").get(id));
});

// Catalog rows are deactivated (not hard-deleted) so estimates that reference
// them stay intact.
router.delete("/:id", (req, res) => {
  db.prepare("UPDATE materials SET isActive = 0, updatedAt = datetime('now') WHERE id = ?").run(Number(req.params.id));
  res.status(204).end();
});

export default router;
