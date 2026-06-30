import { Router } from "express";
import { db } from "../db.js";

const router = Router();

const FIELDS = [
  "code", "companyName", "address", "contactPerson", "email", "telephone",
  "mobile", "website", "tin", "vatRegistered", "tradeCategory", "rating",
  "remarks", "status",
];

function coerce(field, value, existing) {
  if (value === undefined) return existing;
  if (field === "vatRegistered") return value ? 1 : 0;
  if (field === "rating") return Number(value) || 0;
  return value;
}

// Paginated list with search + filters (mirrors the catalog pattern so the
// 100k-record performance characteristics carry over). Falls back to a simple
// list when no pagination params are given, so dropdowns can fetch everything.
router.get("/", (req, res) => {
  const { q, tradeCategory, status, page, limit, sort = "companyName", order = "asc", includeDeleted } = req.query;

  const where = [];
  const params = [];
  if (!includeDeleted) where.push("deletedAt IS NULL");
  if (status) { where.push("status = ?"); params.push(status); }
  if (tradeCategory) { where.push("tradeCategory = ?"); params.push(tradeCategory); }
  if (q) {
    where.push("(companyName LIKE ? OR code LIKE ? OR contactPerson LIKE ? OR email LIKE ?)");
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const sortCols = new Set([...FIELDS, "id", "createdAt", "updatedAt"]);
  const sortCol = sortCols.has(sort) ? sort : "companyName";
  const sortDir = order === "desc" ? "DESC" : "ASC";

  if (!page && !limit) {
    const rows = db.prepare(`SELECT * FROM suppliers ${whereSql} ORDER BY ${sortCol} ${sortDir}`).all(...params);
    return res.json(rows);
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(1000, Math.max(1, Number(limit) || 50));
  const total = db.prepare(`SELECT COUNT(*) AS c FROM suppliers ${whereSql}`).get(...params).c;
  const rows = db
    .prepare(`SELECT * FROM suppliers ${whereSql} ORDER BY ${sortCol} ${sortDir} LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (pageNum - 1) * pageSize);
  res.json({ items: rows, total, page: pageNum, limit: pageSize });
});

router.get("/filters", (req, res) => {
  const categories = db.prepare("SELECT DISTINCT tradeCategory FROM suppliers WHERE tradeCategory IS NOT NULL AND tradeCategory <> '' ORDER BY tradeCategory").all().map((r) => r.tradeCategory);
  res.json({ tradeCategories: categories });
});

router.get("/:id", (req, res) => {
  const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(Number(req.params.id));
  if (!supplier) return res.status(404).json({ error: "Not found" });
  res.json(supplier);
});

router.post("/", (req, res) => {
  if (!req.body.companyName) return res.status(400).json({ error: "companyName is required" });
  const values = FIELDS.map((f) => coerce(f, req.body[f], f === "status" ? "active" : f === "vatRegistered" || f === "rating" ? 0 : null));
  const placeholders = FIELDS.map(() => "?").join(", ");
  const result = db.prepare(`INSERT INTO suppliers (${FIELDS.join(", ")}) VALUES (${placeholders})`).run(...values);
  res.status(201).json(db.prepare("SELECT * FROM suppliers WHERE id = ?").get(result.lastInsertRowid));
});

router.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const values = FIELDS.map((f) => coerce(f, req.body[f], existing[f]));
  const assignments = FIELDS.map((f) => `${f} = ?`).join(", ");
  db.prepare(`UPDATE suppliers SET ${assignments}, updatedAt = datetime('now') WHERE id = ?`).run(...values, id);
  res.json(db.prepare("SELECT * FROM suppliers WHERE id = ?").get(id));
});

router.post("/:id/duplicate", (req, res) => {
  const src = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(Number(req.params.id));
  if (!src) return res.status(404).json({ error: "Not found" });
  const values = FIELDS.map((f) => (f === "companyName" ? `${src.companyName} (Copy)` : src[f]));
  const placeholders = FIELDS.map(() => "?").join(", ");
  const result = db.prepare(`INSERT INTO suppliers (${FIELDS.join(", ")}) VALUES (${placeholders})`).run(...values);
  res.status(201).json(db.prepare("SELECT * FROM suppliers WHERE id = ?").get(result.lastInsertRowid));
});

router.put("/:id/deactivate", (req, res) => {
  db.prepare("UPDATE suppliers SET status = 'inactive', updatedAt = datetime('now') WHERE id = ?").run(Number(req.params.id));
  res.json(db.prepare("SELECT * FROM suppliers WHERE id = ?").get(Number(req.params.id)));
});

router.put("/:id/activate", (req, res) => {
  db.prepare("UPDATE suppliers SET status = 'active', updatedAt = datetime('now') WHERE id = ?").run(Number(req.params.id));
  res.json(db.prepare("SELECT * FROM suppliers WHERE id = ?").get(Number(req.params.id)));
});

router.delete("/:id", (req, res) => {
  db.prepare("UPDATE suppliers SET deletedAt = datetime('now') WHERE id = ?").run(Number(req.params.id));
  res.status(204).end();
});

router.put("/:id/restore", (req, res) => {
  db.prepare("UPDATE suppliers SET deletedAt = NULL, updatedAt = datetime('now') WHERE id = ?").run(Number(req.params.id));
  res.json(db.prepare("SELECT * FROM suppliers WHERE id = ?").get(Number(req.params.id)));
});

export default router;
