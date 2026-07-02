import { Router } from "express";
import { db } from "../db.js";
import { calculateUPA, invalidateUPA } from "../services/costEngine.js";

const router = Router();

const HEAD_FIELDS = [
  "code", "description", "trade", "category", "subcategory", "unit",
  "status", "remarks", "locationAdjustment", "regionalMultiplier",
  "transportation", "mobilization",
];

// Live "current cost" for a resource (from the catalog) so the UI can flag
// drift between the frozen snapshot and the current catalog price.
function currentCostFor(r) {
  if (r.resourceType === "material" && r.materialId)
    return db.prepare("SELECT unitPrice FROM materials WHERE id = ?").get(r.materialId)?.unitPrice ?? null;
  if (r.resourceType === "labor" && r.specializationId)
    return db.prepare("SELECT hourlyRate FROM labor_specializations WHERE id = ?").get(r.specializationId)?.hourlyRate ?? null;
  if (r.resourceType === "equipment" && r.equipmentId)
    return db.prepare("SELECT unitPrice FROM equipment WHERE id = ?").get(r.equipmentId)?.unitPrice ?? null;
  return null;
}

function resourcesFor(upaId) {
  return db.prepare("SELECT * FROM upa_resources WHERE upaId = ? ORDER BY sortOrder ASC, id ASC").all(upaId)
    .map((r) => ({ ...r, currentCost: currentCostFor(r) }));
}

function withDetail(upa) {
  const resources = resourcesFor(upa.id);
  const calc = calculateUPA(upa.id);
  return { ...upa, resources, calc };
}

// ── UPA library ─────────────────────────────────────────────────────────────

router.get("/", (req, res) => {
  const { q, trade, category, status, includeDeleted } = req.query;
  const where = [];
  const params = [];
  if (!includeDeleted) where.push("deletedAt IS NULL");
  if (status) { where.push("status = ?"); params.push(status); }
  if (trade) { where.push("trade = ?"); params.push(trade); }
  if (category) { where.push("category = ?"); params.push(category); }
  if (q) {
    where.push("(description LIKE ? OR code LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = db.prepare(`SELECT * FROM unit_price_analyses ${whereSql} ORDER BY code, description`).all(...params);
  // List view includes the computed unit rate but not the full resource set.
  res.json(rows.map((u) => ({ ...u, unitRate: calculateUPA(u.id)?.unitRate ?? 0 })));
});

router.get("/filters", (req, res) => {
  const trades = db.prepare("SELECT DISTINCT trade FROM unit_price_analyses WHERE trade IS NOT NULL AND trade <> '' ORDER BY trade").all().map((r) => r.trade);
  const categories = db.prepare("SELECT DISTINCT category FROM unit_price_analyses WHERE category IS NOT NULL AND category <> '' ORDER BY category").all().map((r) => r.category);
  res.json({ trades, categories });
});

router.get("/:id", (req, res) => {
  const upa = db.prepare("SELECT * FROM unit_price_analyses WHERE id = ?").get(Number(req.params.id));
  if (!upa) return res.status(404).json({ error: "Not found" });
  res.json(withDetail(upa));
});

router.get("/:id/calculate", (req, res) => {
  const calc = calculateUPA(Number(req.params.id));
  if (!calc) return res.status(404).json({ error: "Not found" });
  res.json(calc);
});

// Dashboard statistics for the Rate Analysis library.
router.get("/stats/dashboard", (req, res) => {
  const total = db.prepare("SELECT COUNT(*) AS c FROM unit_price_analyses WHERE deletedAt IS NULL AND status != 'archived'").get().c;
  const archived = db.prepare("SELECT COUNT(*) AS c FROM unit_price_analyses WHERE deletedAt IS NULL AND status = 'archived'").get().c;
  const favorites = db.prepare("SELECT id, code, description, category FROM unit_price_analyses WHERE deletedAt IS NULL AND isFavorite = 1 ORDER BY description LIMIT 20").all();
  const recent = db.prepare("SELECT id, code, description, category, updatedAt FROM unit_price_analyses WHERE deletedAt IS NULL ORDER BY updatedAt DESC LIMIT 10").all();
  const byCategory = db.prepare("SELECT COALESCE(category,'Uncategorized') AS category, COUNT(*) AS count FROM unit_price_analyses WHERE deletedAt IS NULL GROUP BY category ORDER BY count DESC").all();
  const mostUsed = db.prepare(
    `SELECT u.id, u.code, u.description, COUNT(mu.id) AS uses
     FROM unit_price_analyses u LEFT JOIN module_upa mu ON mu.upaId = u.id
     WHERE u.deletedAt IS NULL GROUP BY u.id HAVING uses > 0 ORDER BY uses DESC, u.description LIMIT 10`
  ).all();
  res.json({ total, archived, favorites, recent, byCategory, mostUsed });
});

router.post("/:id/favorite", (req, res) => {
  const id = Number(req.params.id);
  const u = db.prepare("SELECT isFavorite FROM unit_price_analyses WHERE id = ?").get(id);
  if (!u) return res.status(404).json({ error: "Not found" });
  db.prepare("UPDATE unit_price_analyses SET isFavorite = ?, updatedAt = datetime('now') WHERE id = ?").run(u.isFavorite ? 0 : 1, id);
  res.json(withDetail(db.prepare("SELECT * FROM unit_price_analyses WHERE id = ?").get(id)));
});

router.post("/:id/archive", (req, res) => {
  db.prepare("UPDATE unit_price_analyses SET status = 'archived', updatedAt = datetime('now') WHERE id = ?").run(Number(req.params.id));
  res.json(withDetail(db.prepare("SELECT * FROM unit_price_analyses WHERE id = ?").get(Number(req.params.id))));
});
router.post("/:id/restore", (req, res) => {
  db.prepare("UPDATE unit_price_analyses SET status = 'active', deletedAt = NULL, updatedAt = datetime('now') WHERE id = ?").run(Number(req.params.id));
  res.json(withDetail(db.prepare("SELECT * FROM unit_price_analyses WHERE id = ?").get(Number(req.params.id))));
});

router.post("/", (req, res) => {
  if (!req.body.description) return res.status(400).json({ error: "description is required" });
  const values = HEAD_FIELDS.map((f) => {
    if (req.body[f] !== undefined) return req.body[f];
    if (f === "unit") return "unit";
    if (f === "status") return "active";
    if (f === "locationAdjustment" || f === "regionalMultiplier") return 1;
    if (f === "transportation" || f === "mobilization") return 0;
    return null;
  });
  const placeholders = HEAD_FIELDS.map(() => "?").join(", ");
  const result = db.prepare(`INSERT INTO unit_price_analyses (${HEAD_FIELDS.join(", ")}) VALUES (${placeholders})`).run(...values);
  res.status(201).json(withDetail(db.prepare("SELECT * FROM unit_price_analyses WHERE id = ?").get(result.lastInsertRowid)));
});

router.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM unit_price_analyses WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const values = HEAD_FIELDS.map((f) => (req.body[f] !== undefined ? req.body[f] : existing[f]));
  const assignments = HEAD_FIELDS.map((f) => `${f} = ?`).join(", ");
  db.prepare(`UPDATE unit_price_analyses SET ${assignments}, updatedAt = datetime('now') WHERE id = ?`).run(...values, id);
  invalidateUPA(id);
  res.json(withDetail(db.prepare("SELECT * FROM unit_price_analyses WHERE id = ?").get(id)));
});

router.post("/:id/duplicate", (req, res) => {
  const id = Number(req.params.id);
  const src = db.prepare("SELECT * FROM unit_price_analyses WHERE id = ?").get(id);
  if (!src) return res.status(404).json({ error: "Not found" });
  db.exec("BEGIN");
  try {
    const values = HEAD_FIELDS.map((f) => (f === "description" ? `${src.description} (Copy)` : src[f]));
    const placeholders = HEAD_FIELDS.map(() => "?").join(", ");
    const result = db.prepare(`INSERT INTO unit_price_analyses (${HEAD_FIELDS.join(", ")}) VALUES (${placeholders})`).run(...values);
    const newId = result.lastInsertRowid;
    const cols = ["resourceType", "materialId", "specializationId", "equipmentId", "description", "quantity", "unit", "wastePct", "crew", "outputPerDay", "outputPerHour", "laborHours", "manhours", "operatingHours", "idleFactor", "fuelConsumption", "operatorCost", "frozenCost", "notes", "sortOrder"];
    const rows = db.prepare("SELECT * FROM upa_resources WHERE upaId = ?").all(id);
    const insert = db.prepare(`INSERT INTO upa_resources (upaId, ${cols.join(", ")}) VALUES (?, ${cols.map(() => "?").join(", ")})`);
    for (const r of rows) insert.run(newId, ...cols.map((c) => r[c]));
    db.exec("COMMIT");
    res.status(201).json(withDetail(db.prepare("SELECT * FROM unit_price_analyses WHERE id = ?").get(newId)));
  } catch (e) {
    db.exec("ROLLBACK");
    res.status(500).json({ error: e.message });
  }
});

router.delete("/:id", (req, res) => {
  db.prepare("UPDATE unit_price_analyses SET deletedAt = datetime('now') WHERE id = ?").run(Number(req.params.id));
  res.status(204).end();
});

// ── Resources ───────────────────────────────────────────────────────────────

const R_FIELDS = [
  "resourceType", "materialId", "specializationId", "equipmentId", "description",
  "quantity", "unit", "wastePct", "crew", "outputPerDay", "outputPerHour",
  "laborHours", "manhours", "operatingHours", "idleFactor", "fuelConsumption",
  "operatorCost", "frozenCost", "notes",
];

// Resolve the catalog price for a resource at add-time so frozenCost defaults
// to the live price (the price-freeze rule). Reuses the existing catalogs.
function resolveFrozenCost(body) {
  if (body.frozenCost != null && body.frozenCost !== "") return Number(body.frozenCost);
  if (body.resourceType === "material" && body.materialId)
    return db.prepare("SELECT unitPrice FROM materials WHERE id = ?").get(Number(body.materialId))?.unitPrice ?? 0;
  if (body.resourceType === "labor" && body.specializationId)
    return db.prepare("SELECT hourlyRate FROM labor_specializations WHERE id = ?").get(Number(body.specializationId))?.hourlyRate ?? 0;
  if (body.resourceType === "equipment" && body.equipmentId)
    return db.prepare("SELECT unitPrice FROM equipment WHERE id = ?").get(Number(body.equipmentId))?.unitPrice ?? 0;
  return 0;
}

router.post("/:id/resources", (req, res) => {
  const upaId = Number(req.params.id);
  const upa = db.prepare("SELECT id FROM unit_price_analyses WHERE id = ?").get(upaId);
  if (!upa) return res.status(404).json({ error: "UPA not found" });
  if (!req.body.resourceType) return res.status(400).json({ error: "resourceType is required" });

  // Validate catalog references up front so a bad FK returns a clean 400.
  const { resourceType, materialId, specializationId, equipmentId } = req.body;
  if (resourceType === "material") {
    if (!materialId || !db.prepare("SELECT id FROM materials WHERE id = ?").get(Number(materialId)))
      return res.status(400).json({ error: "materialId is required and must exist" });
  } else if (resourceType === "labor") {
    if (!specializationId || !db.prepare("SELECT id FROM labor_specializations WHERE id = ?").get(Number(specializationId)))
      return res.status(400).json({ error: "specializationId is required and must exist" });
  } else if (resourceType === "equipment") {
    if (!equipmentId || !db.prepare("SELECT id FROM equipment WHERE id = ?").get(Number(equipmentId)))
      return res.status(400).json({ error: "equipmentId is required and must exist" });
  } else if (resourceType !== "subcontract" && resourceType !== "other") {
    return res.status(400).json({ error: "invalid resourceType" });
  }

  const frozenCost = resolveFrozenCost(req.body);
  const maxOrder = db.prepare("SELECT COALESCE(MAX(sortOrder),-1) AS m FROM upa_resources WHERE upaId = ?").get(upaId).m;
  const values = R_FIELDS.map((f) => {
    if (f === "frozenCost") return frozenCost;
    if (req.body[f] === undefined || req.body[f] === "") return f === "wastePct" || f === "idleFactor" || f === "quantity" ? 0 : null;
    return req.body[f];
  });
  const result = db
    .prepare(`INSERT INTO upa_resources (upaId, ${R_FIELDS.join(", ")}, sortOrder) VALUES (?, ${R_FIELDS.map(() => "?").join(", ")}, ?)`)
    .run(upaId, ...values, maxOrder + 1);
  invalidateUPA(upaId);
  res.status(201).json(db.prepare("SELECT * FROM upa_resources WHERE id = ?").get(result.lastInsertRowid));
});

router.put("/:id/resources/:resId", (req, res) => {
  const resId = Number(req.params.resId);
  const existing = db.prepare("SELECT * FROM upa_resources WHERE id = ?").get(resId);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const values = R_FIELDS.map((f) => (req.body[f] !== undefined ? req.body[f] : existing[f]));
  const assignments = R_FIELDS.map((f) => `${f} = ?`).join(", ");
  db.prepare(`UPDATE upa_resources SET ${assignments}, updatedAt = datetime('now') WHERE id = ?`).run(...values, resId);
  invalidateUPA(existing.upaId);
  res.json(db.prepare("SELECT * FROM upa_resources WHERE id = ?").get(resId));
});

router.delete("/:id/resources/:resId", (req, res) => {
  const existing = db.prepare("SELECT * FROM upa_resources WHERE id = ?").get(Number(req.params.resId));
  db.prepare("DELETE FROM upa_resources WHERE id = ?").run(Number(req.params.resId));
  if (existing) invalidateUPA(existing.upaId);
  res.status(204).end();
});

router.patch("/:id/resources/sort", (req, res) => {
  const upaId = Number(req.params.id);
  const { items } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: "items required" });
  db.exec("BEGIN");
  try {
    const stmt = db.prepare("UPDATE upa_resources SET sortOrder = ?, updatedAt = datetime('now') WHERE id = ?");
    for (const it of items) stmt.run(it.sortOrder, it.id);
    db.exec("COMMIT");
    invalidateUPA(upaId);
    res.json({ ok: true });
  } catch (e) {
    db.exec("ROLLBACK");
    res.status(500).json({ error: e.message });
  }
});

// ── Versioning ──────────────────────────────────────────────────────────────

router.get("/:id/versions", (req, res) => {
  const rows = db.prepare("SELECT id, upaId, version, revision, note, totals, createdAt FROM upa_versions WHERE upaId = ? ORDER BY version DESC, revision DESC").all(Number(req.params.id));
  res.json(rows.map((r) => ({ ...r, totals: JSON.parse(r.totals) })));
});

router.get("/:id/versions/:versionId", (req, res) => {
  const row = db.prepare("SELECT * FROM upa_versions WHERE id = ?").get(Number(req.params.versionId));
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json({ ...row, snapshot: JSON.parse(row.snapshot), totals: JSON.parse(row.totals) });
});

// Snapshot the current state as a new version, then bump the UPA's revision.
router.post("/:id/versions", (req, res) => {
  const id = Number(req.params.id);
  const upa = db.prepare("SELECT * FROM unit_price_analyses WHERE id = ?").get(id);
  if (!upa) return res.status(404).json({ error: "Not found" });
  const resources = db.prepare("SELECT * FROM upa_resources WHERE upaId = ?").all(id);
  const totals = calculateUPA(id);
  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO upa_versions (upaId, version, revision, note, snapshot, totals, createdAt) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))")
      .run(id, upa.version, upa.revision, req.body?.note ?? null, JSON.stringify({ upa, resources }), JSON.stringify(totals));
    db.prepare("UPDATE unit_price_analyses SET revision = revision + 1, version = version + 1, updatedAt = datetime('now') WHERE id = ?").run(id);
    db.exec("COMMIT");
    invalidateUPA(id);
    res.status(201).json({ ok: true });
  } catch (e) {
    db.exec("ROLLBACK");
    res.status(500).json({ error: e.message });
  }
});

export default router;
