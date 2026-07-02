import { Router } from "express";
import { db } from "../db.js";
import { calculateGRSheet, GR_CATEGORIES } from "../services/costEngine.js";

const router = Router();

const METHODS = [
  "lumpSum", "unitRate", "percentageOfDirect", "percentageOfProject",
  "percentageOfCategory", "monthly", "weekly", "daily", "rental", "allowance", "formula",
];

router.get("/categories", (req, res) => res.json({ categories: GR_CATEGORIES, methods: METHODS }));

// ── Staff library ───────────────────────────────────────────────────────────

router.get("/staff", (req, res) => res.json(db.prepare("SELECT * FROM gr_staff_library ORDER BY sortOrder, id").all()));
router.post("/staff", (req, res) => {
  const { role, monthlyRate, notes } = req.body;
  if (!role) return res.status(400).json({ error: "role is required" });
  const max = db.prepare("SELECT COALESCE(MAX(sortOrder),-1) AS m FROM gr_staff_library").get().m;
  const r = db.prepare("INSERT INTO gr_staff_library (role, monthlyRate, notes, sortOrder) VALUES (?, ?, ?, ?)").run(role, Number(monthlyRate) || 0, notes ?? null, max + 1);
  res.status(201).json(db.prepare("SELECT * FROM gr_staff_library WHERE id = ?").get(r.lastInsertRowid));
});
router.put("/staff/:id", (req, res) => {
  const e = db.prepare("SELECT * FROM gr_staff_library WHERE id = ?").get(Number(req.params.id));
  if (!e) return res.status(404).json({ error: "Not found" });
  db.prepare("UPDATE gr_staff_library SET role = ?, monthlyRate = ?, notes = ? WHERE id = ?")
    .run(req.body.role ?? e.role, req.body.monthlyRate != null ? Number(req.body.monthlyRate) : e.monthlyRate, req.body.notes !== undefined ? req.body.notes : e.notes, e.id);
  res.json(db.prepare("SELECT * FROM gr_staff_library WHERE id = ?").get(e.id));
});
router.delete("/staff/:id", (req, res) => { db.prepare("DELETE FROM gr_staff_library WHERE id = ?").run(Number(req.params.id)); res.status(204).end(); });

// ── Templates ───────────────────────────────────────────────────────────────

router.get("/templates", (req, res) => {
  res.json(db.prepare("SELECT * FROM gr_templates ORDER BY name").all().map((t) => ({
    ...t, itemCount: db.prepare("SELECT COUNT(*) AS c FROM gr_template_items WHERE templateId = ?").get(t.id).c,
  })));
});
router.get("/templates/:id", (req, res) => {
  const t = db.prepare("SELECT * FROM gr_templates WHERE id = ?").get(Number(req.params.id));
  if (!t) return res.status(404).json({ error: "Not found" });
  res.json({ ...t, items: db.prepare("SELECT * FROM gr_template_items WHERE templateId = ? ORDER BY sortOrder, id").all(t.id) });
});
router.post("/templates", (req, res) => {
  const { name, projectType, description } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });
  const r = db.prepare("INSERT INTO gr_templates (name, projectType, description) VALUES (?, ?, ?)").run(name, projectType ?? null, description ?? null);
  res.status(201).json(db.prepare("SELECT * FROM gr_templates WHERE id = ?").get(r.lastInsertRowid));
});
router.delete("/templates/:id", (req, res) => { db.prepare("DELETE FROM gr_templates WHERE id = ?").run(Number(req.params.id)); res.status(204).end(); });

// ── Sheets ──────────────────────────────────────────────────────────────────

const SHEET_FIELDS = ["name", "projectId", "description", "durationDays", "workingDays", "calendarMonths", "projectArea", "buildingCount", "floorCount", "projectValue", "personnelCount", "inflation", "escalation"];
const SHEET_NUM = new Set(["projectId", "durationDays", "workingDays", "calendarMonths", "projectArea", "buildingCount", "floorCount", "projectValue", "personnelCount", "inflation", "escalation"]);

router.get("/sheets", (req, res) => {
  const { projectId } = req.query;
  let sql = "SELECT * FROM gr_sheets WHERE deletedAt IS NULL";
  const params = [];
  if (projectId) { sql += " AND projectId = ?"; params.push(Number(projectId)); }
  sql += " ORDER BY id DESC";
  res.json(db.prepare(sql).all(...params));
});

router.get("/sheets/:id", (req, res) => {
  const sheet = db.prepare("SELECT * FROM gr_sheets WHERE id = ? AND deletedAt IS NULL").get(Number(req.params.id));
  if (!sheet) return res.status(404).json({ error: "Not found" });
  const items = db.prepare("SELECT * FROM gr_items WHERE sheetId = ? ORDER BY category, sortOrder, id").all(sheet.id);
  res.json({ ...sheet, items, calc: calculateGRSheet(sheet.id) });
});

router.get("/sheets/:id/calculate", (req, res) => {
  const calc = calculateGRSheet(Number(req.params.id));
  if (!calc) return res.status(404).json({ error: "Not found" });
  res.json(calc);
});

router.post("/sheets", (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: "name is required" });
  const provided = SHEET_FIELDS.filter((f) => req.body[f] !== undefined && req.body[f] !== "");
  const cols = provided.length ? provided : ["name"];
  const values = cols.map((f) => (SHEET_NUM.has(f) ? Number(req.body[f]) || 0 : req.body[f]));
  const r = db.prepare(`INSERT INTO gr_sheets (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`).run(...values);
  res.status(201).json(db.prepare("SELECT * FROM gr_sheets WHERE id = ?").get(r.lastInsertRowid));
});

router.put("/sheets/:id", (req, res) => {
  const e = db.prepare("SELECT * FROM gr_sheets WHERE id = ?").get(Number(req.params.id));
  if (!e) return res.status(404).json({ error: "Not found" });
  const values = SHEET_FIELDS.map((f) => (req.body[f] !== undefined ? (SHEET_NUM.has(f) ? Number(req.body[f]) || 0 : req.body[f]) : e[f]));
  db.prepare(`UPDATE gr_sheets SET ${SHEET_FIELDS.map((f) => `${f} = ?`).join(", ")}, updatedAt = datetime('now') WHERE id = ?`).run(...values, e.id);
  res.json(db.prepare("SELECT * FROM gr_sheets WHERE id = ?").get(e.id));
});

router.delete("/sheets/:id", (req, res) => { db.prepare("UPDATE gr_sheets SET deletedAt = datetime('now') WHERE id = ?").run(Number(req.params.id)); res.status(204).end(); });

// Duplicate a sheet with all its items.
router.post("/sheets/:id/duplicate", (req, res) => {
  const src = db.prepare("SELECT * FROM gr_sheets WHERE id = ?").get(Number(req.params.id));
  if (!src) return res.status(404).json({ error: "Not found" });
  db.exec("BEGIN");
  try {
    const values = SHEET_FIELDS.map((f) => (f === "name" ? `${src.name} (Copy)` : src[f]));
    const r = db.prepare(`INSERT INTO gr_sheets (${SHEET_FIELDS.join(", ")}) VALUES (${SHEET_FIELDS.map(() => "?").join(", ")})`).run(...values);
    const newId = r.lastInsertRowid;
    copyItemsInto(newId, db.prepare("SELECT * FROM gr_items WHERE sheetId = ?").all(src.id));
    db.exec("COMMIT");
    res.status(201).json(db.prepare("SELECT * FROM gr_sheets WHERE id = ?").get(newId));
  } catch (err) { db.exec("ROLLBACK"); res.status(500).json({ error: err.message }); }
});

// Instantiate a template's items into a sheet.
router.post("/sheets/:id/apply-template/:templateId", (req, res) => {
  const sheet = db.prepare("SELECT id FROM gr_sheets WHERE id = ?").get(Number(req.params.id));
  if (!sheet) return res.status(404).json({ error: "Sheet not found" });
  const titems = db.prepare("SELECT * FROM gr_template_items WHERE templateId = ? ORDER BY sortOrder, id").all(Number(req.params.templateId));
  if (!titems.length) return res.status(404).json({ error: "Template has no items" });
  db.exec("BEGIN");
  try {
    const max = db.prepare("SELECT COALESCE(MAX(sortOrder),-1) AS m FROM gr_items WHERE sheetId = ?").get(sheet.id).m;
    const ins = db.prepare("INSERT INTO gr_items (sheetId, category, description, unit, method, quantity, rate, value, pct, formula, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    titems.forEach((t, i) => ins.run(sheet.id, t.category, t.description, t.unit, t.method, t.quantity, t.rate, t.value, t.pct, t.formula, max + 1 + i));
    db.exec("COMMIT");
    res.status(201).json({ inserted: titems.length });
  } catch (err) { db.exec("ROLLBACK"); res.status(500).json({ error: err.message }); }
});

function copyItemsInto(sheetId, items) {
  const cols = ["category", "itemType", "materialId", "specializationId", "equipmentId", "assemblyId", "upaId", "description", "unit", "method", "quantity", "rate", "value", "pct", "durationValue", "formula", "frozenCost", "markup", "status", "notes", "sortOrder"];
  const ins = db.prepare(`INSERT INTO gr_items (sheetId, ${cols.join(", ")}) VALUES (?, ${cols.map(() => "?").join(", ")})`);
  for (const it of items) ins.run(sheetId, ...cols.map((c) => it[c]));
}

// ── Items ───────────────────────────────────────────────────────────────────

const ITEM_FIELDS = ["category", "itemType", "materialId", "specializationId", "equipmentId", "assemblyId", "upaId", "description", "unit", "method", "quantity", "rate", "value", "pct", "durationValue", "formula", "frozenCost", "markup", "status", "notes"];
const ITEM_NUM = new Set(["materialId", "specializationId", "equipmentId", "assemblyId", "upaId", "quantity", "rate", "value", "pct", "durationValue", "frozenCost", "markup"]);

// Resolve a frozen cost from the referenced catalog/assembly/UPA at add time.
function resolveItemFrozen(body) {
  if (body.frozenCost != null && body.frozenCost !== "") return Number(body.frozenCost);
  if (body.itemType === "material" && body.materialId) return db.prepare("SELECT unitPrice FROM materials WHERE id = ?").get(Number(body.materialId))?.unitPrice ?? 0;
  if (body.itemType === "labor" && body.specializationId) return db.prepare("SELECT hourlyRate FROM labor_specializations WHERE id = ?").get(Number(body.specializationId))?.hourlyRate ?? 0;
  if (body.itemType === "equipment" && body.equipmentId) return db.prepare("SELECT unitPrice FROM equipment WHERE id = ?").get(Number(body.equipmentId))?.unitPrice ?? 0;
  return 0;
}

router.post("/sheets/:id/items", (req, res) => {
  const sheet = db.prepare("SELECT id FROM gr_sheets WHERE id = ?").get(Number(req.params.id));
  if (!sheet) return res.status(404).json({ error: "Sheet not found" });
  if (!req.body.category || !req.body.description) return res.status(400).json({ error: "category and description are required" });
  const body = { ...req.body, frozenCost: resolveItemFrozen(req.body) };
  const provided = ITEM_FIELDS.filter((f) => body[f] !== undefined && body[f] !== "");
  const max = db.prepare("SELECT COALESCE(MAX(sortOrder),-1) AS m FROM gr_items WHERE sheetId = ?").get(sheet.id).m;
  const cols = [...provided, "sortOrder"];
  const values = [...provided.map((f) => (ITEM_NUM.has(f) ? Number(body[f]) || 0 : body[f])), max + 1];
  const r = db.prepare(`INSERT INTO gr_items (sheetId, ${cols.join(", ")}) VALUES (?, ${cols.map(() => "?").join(", ")})`).run(sheet.id, ...values);
  res.status(201).json(db.prepare("SELECT * FROM gr_items WHERE id = ?").get(r.lastInsertRowid));
});

router.put("/items/:itemId", (req, res) => {
  const e = db.prepare("SELECT * FROM gr_items WHERE id = ?").get(Number(req.params.itemId));
  if (!e) return res.status(404).json({ error: "Not found" });
  const values = ITEM_FIELDS.map((f) => (req.body[f] !== undefined ? (ITEM_NUM.has(f) ? Number(req.body[f]) || 0 : req.body[f]) : e[f]));
  db.prepare(`UPDATE gr_items SET ${ITEM_FIELDS.map((f) => `${f} = ?`).join(", ")}, updatedAt = datetime('now') WHERE id = ?`).run(...values, e.id);
  res.json(db.prepare("SELECT * FROM gr_items WHERE id = ?").get(e.id));
});

router.delete("/items/:itemId", (req, res) => { db.prepare("DELETE FROM gr_items WHERE id = ?").run(Number(req.params.itemId)); res.status(204).end(); });

router.patch("/sheets/:id/items/sort", (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: "items required" });
  db.exec("BEGIN");
  try {
    const stmt = db.prepare("UPDATE gr_items SET sortOrder = ?, updatedAt = datetime('now') WHERE id = ?");
    for (const it of items) stmt.run(it.sortOrder, it.id);
    db.exec("COMMIT");
    res.json({ ok: true });
  } catch (e) { db.exec("ROLLBACK"); res.status(500).json({ error: e.message }); }
});

export default router;
