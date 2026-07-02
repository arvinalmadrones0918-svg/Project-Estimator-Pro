import { Router } from "express";
import { db } from "../db.js";
import {
  calculateProject,
  calculateModuleResult,
  calculateAssemblyResult,
  CALC_VERSION,
} from "../services/costEngine.js";

const router = Router();

// ── Calculation endpoints (read-only, engine is the source of truth) ────────

router.get("/project/:projectId/calculate", (req, res) => {
  const projectId = Number(req.params.projectId);
  const scenarioId = req.query.scenarioId ? Number(req.query.scenarioId) : null;
  const writeAudit = req.query.audit === "true";
  const project = db.prepare("SELECT id FROM projects WHERE id = ? AND deletedAt IS NULL").get(projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });
  res.json(calculateProject(projectId, { scenarioId, writeAudit }));
});

router.get("/module/:moduleId/calculate", (req, res) => {
  const moduleId = Number(req.params.moduleId);
  const m = db.prepare("SELECT id FROM work_modules WHERE id = ? AND deletedAt IS NULL").get(moduleId);
  if (!m) return res.status(404).json({ error: "Module not found" });
  res.json({ moduleId, calcVersion: CALC_VERSION, ...calculateModuleResult(moduleId) });
});

router.get("/assembly/:assemblyId/calculate", (req, res) => {
  const assemblyId = Number(req.params.assemblyId);
  const a = db.prepare("SELECT id FROM assemblies WHERE id = ?").get(assemblyId);
  if (!a) return res.status(404).json({ error: "Assembly not found" });
  res.json({ assemblyId, calcVersion: CALC_VERSION, ...calculateAssemblyResult(assemblyId) });
});

// ── Scenarios ───────────────────────────────────────────────────────────────

router.get("/scenarios", (req, res) => {
  const projectId = Number(req.query.projectId);
  if (!projectId) return res.status(400).json({ error: "projectId is required" });
  const scenarios = db
    .prepare("SELECT * FROM estimate_scenarios WHERE projectId = ? AND deletedAt IS NULL ORDER BY isPrimary DESC, id ASC")
    .all(projectId);
  res.json(scenarios);
});

router.post("/scenarios", (req, res) => {
  const { projectId, name, type = "tender", description } = req.body;
  if (!projectId || !name) return res.status(400).json({ error: "projectId and name are required" });
  const count = db.prepare("SELECT COUNT(*) AS c FROM estimate_scenarios WHERE projectId = ? AND deletedAt IS NULL").get(projectId).c;
  const result = db
    .prepare("INSERT INTO estimate_scenarios (projectId, name, type, description, isPrimary, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))")
    .run(projectId, name, type, description ?? null, count === 0 ? 1 : 0);
  res.status(201).json(db.prepare("SELECT * FROM estimate_scenarios WHERE id = ?").get(result.lastInsertRowid));
});

router.put("/scenarios/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM estimate_scenarios WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const { name, type, description, isPrimary } = req.body;
  if (isPrimary) {
    db.prepare("UPDATE estimate_scenarios SET isPrimary = 0 WHERE projectId = ?").run(existing.projectId);
  }
  db.prepare("UPDATE estimate_scenarios SET name = ?, type = ?, description = ?, isPrimary = ?, updatedAt = datetime('now') WHERE id = ?").run(
    name ?? existing.name,
    type ?? existing.type,
    description !== undefined ? description : existing.description,
    isPrimary !== undefined ? Number(Boolean(isPrimary)) : existing.isPrimary,
    id
  );
  res.json(db.prepare("SELECT * FROM estimate_scenarios WHERE id = ?").get(id));
});

router.delete("/scenarios/:id", (req, res) => {
  db.prepare("UPDATE estimate_scenarios SET deletedAt = datetime('now') WHERE id = ?").run(Number(req.params.id));
  res.status(204).end();
});

// Duplicate a scenario along with its indirect-cost configuration.
router.post("/scenarios/:id/duplicate", (req, res) => {
  const id = Number(req.params.id);
  const src = db.prepare("SELECT * FROM estimate_scenarios WHERE id = ?").get(id);
  if (!src) return res.status(404).json({ error: "Not found" });
  db.exec("BEGIN");
  try {
    const result = db
      .prepare("INSERT INTO estimate_scenarios (projectId, name, type, description, isPrimary, createdAt, updatedAt) VALUES (?, ?, ?, ?, 0, datetime('now'), datetime('now'))")
      .run(src.projectId, `${src.name} (Copy)`, src.type, src.description);
    const newId = result.lastInsertRowid;
    const items = db.prepare("SELECT * FROM indirect_cost_items WHERE scenarioId = ?").all(id);
    const insert = db.prepare("INSERT INTO indirect_cost_items (projectId, scenarioId, name, kind, method, value, appliesTo, enabled, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))");
    for (const it of items) insert.run(it.projectId, newId, it.name, it.kind, it.method, it.value, it.appliesTo, it.enabled, it.sortOrder);
    db.exec("COMMIT");
    res.status(201).json(db.prepare("SELECT * FROM estimate_scenarios WHERE id = ?").get(newId));
  } catch (e) {
    db.exec("ROLLBACK");
    res.status(500).json({ error: e.message });
  }
});

// ── Indirect cost items ─────────────────────────────────────────────────────

router.get("/indirect-costs", (req, res) => {
  const projectId = Number(req.query.projectId);
  const scenarioId = req.query.scenarioId ? Number(req.query.scenarioId) : null;
  if (!projectId) return res.status(400).json({ error: "projectId is required" });
  const items = scenarioId
    ? db.prepare("SELECT * FROM indirect_cost_items WHERE projectId = ? AND scenarioId = ? ORDER BY sortOrder ASC, id ASC").all(projectId, scenarioId)
    : db.prepare("SELECT * FROM indirect_cost_items WHERE projectId = ? AND scenarioId IS NULL ORDER BY sortOrder ASC, id ASC").all(projectId);
  res.json(items.map((i) => ({ ...i, enabled: !!i.enabled })));
});

router.post("/indirect-costs", (req, res) => {
  const { projectId, scenarioId = null, name, kind = "indirect", method = "percentage", value = 0, appliesTo = "project", enabled = true } = req.body;
  if (!projectId || !name) return res.status(400).json({ error: "projectId and name are required" });
  const maxOrder = db.prepare("SELECT COALESCE(MAX(sortOrder),-1) AS m FROM indirect_cost_items WHERE projectId = ?").get(projectId).m;
  const result = db
    .prepare("INSERT INTO indirect_cost_items (projectId, scenarioId, name, kind, method, value, appliesTo, enabled, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))")
    .run(projectId, scenarioId, name, kind, method, Number(value), appliesTo, enabled ? 1 : 0, maxOrder + 1);
  res.status(201).json(db.prepare("SELECT * FROM indirect_cost_items WHERE id = ?").get(result.lastInsertRowid));
});

router.put("/indirect-costs/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM indirect_cost_items WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const { name, kind, method, value, appliesTo, enabled, sortOrder } = req.body;
  db.prepare("UPDATE indirect_cost_items SET name = ?, kind = ?, method = ?, value = ?, appliesTo = ?, enabled = ?, sortOrder = ?, updatedAt = datetime('now') WHERE id = ?").run(
    name ?? existing.name,
    kind ?? existing.kind,
    method ?? existing.method,
    value != null ? Number(value) : existing.value,
    appliesTo ?? existing.appliesTo,
    enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled,
    sortOrder != null ? Number(sortOrder) : existing.sortOrder,
    id
  );
  res.json(db.prepare("SELECT * FROM indirect_cost_items WHERE id = ?").get(id));
});

router.delete("/indirect-costs/:id", (req, res) => {
  db.prepare("DELETE FROM indirect_cost_items WHERE id = ?").run(Number(req.params.id));
  res.status(204).end();
});

// Seed a standard set of indirect-cost lines for a project/scenario.
router.post("/indirect-costs/seed-defaults", (req, res) => {
  const { projectId, scenarioId = null } = req.body;
  if (!projectId) return res.status(400).json({ error: "projectId is required" });
  const defaults = [
    { name: "Mobilization", kind: "indirect", method: "percentage", value: 2 },
    { name: "Temporary Facilities", kind: "indirect", method: "percentage", value: 1.5 },
    { name: "General Requirements", kind: "indirect", method: "percentage", value: 3 },
    { name: "Overhead", kind: "indirect", method: "percentage", value: 8 },
    { name: "Profit", kind: "indirect", method: "percentage", value: 10 },
    { name: "Contingency", kind: "indirect", method: "percentage", value: 5 },
    { name: "Escalation", kind: "indirect", method: "percentage", value: 2 },
    { name: "VAT", kind: "vat", method: "percentage", value: 15 },
    { name: "Discount", kind: "discount", method: "percentage", value: 0 },
    { name: "Retention", kind: "retention", method: "percentage", value: 10 },
  ];
  db.exec("BEGIN");
  try {
    const insert = db.prepare("INSERT INTO indirect_cost_items (projectId, scenarioId, name, kind, method, value, appliesTo, enabled, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, 'project', 1, ?, datetime('now'), datetime('now'))");
    defaults.forEach((d, i) => insert.run(projectId, scenarioId, d.name, d.kind, d.method, d.value, i));
    db.exec("COMMIT");
    const items = scenarioId
      ? db.prepare("SELECT * FROM indirect_cost_items WHERE projectId = ? AND scenarioId = ? ORDER BY sortOrder ASC").all(projectId, scenarioId)
      : db.prepare("SELECT * FROM indirect_cost_items WHERE projectId = ? AND scenarioId IS NULL ORDER BY sortOrder ASC").all(projectId);
    res.status(201).json(items.map((i) => ({ ...i, enabled: !!i.enabled })));
  } catch (e) {
    db.exec("ROLLBACK");
    res.status(500).json({ error: e.message });
  }
});

// ── Revisions (frozen snapshots) ────────────────────────────────────────────

function snapshotProject(projectId) {
  const modules = db.prepare("SELECT * FROM work_modules WHERE projectId = ? AND deletedAt IS NULL").all(projectId);
  const tables = ["module_materials", "module_labor", "module_equipment", "module_subcontract", "module_other_costs", "module_assemblies"];
  return modules.map((m) => {
    const lines = {};
    for (const t of tables) lines[t] = db.prepare(`SELECT * FROM ${t} WHERE workModuleId = ?`).all(m.id);
    return { module: m, lines };
  });
}

router.get("/revisions", (req, res) => {
  const projectId = Number(req.query.projectId);
  const scenarioId = req.query.scenarioId ? Number(req.query.scenarioId) : null;
  if (!projectId) return res.status(400).json({ error: "projectId is required" });
  const rows = scenarioId
    ? db.prepare("SELECT id, projectId, scenarioId, revisionNumber, note, totals, createdAt FROM estimate_revisions WHERE projectId = ? AND scenarioId = ? ORDER BY revisionNumber DESC").all(projectId, scenarioId)
    : db.prepare("SELECT id, projectId, scenarioId, revisionNumber, note, totals, createdAt FROM estimate_revisions WHERE projectId = ? ORDER BY revisionNumber DESC").all(projectId);
  res.json(rows.map((r) => ({ ...r, totals: JSON.parse(r.totals) })));
});

router.get("/revisions/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM estimate_revisions WHERE id = ?").get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json({ ...row, snapshot: JSON.parse(row.snapshot), totals: JSON.parse(row.totals) });
});

router.post("/revisions", (req, res) => {
  const { projectId, scenarioId = null, note } = req.body;
  if (!projectId) return res.status(400).json({ error: "projectId is required" });
  const lastRev = scenarioId
    ? db.prepare("SELECT MAX(revisionNumber) AS m FROM estimate_revisions WHERE projectId = ? AND scenarioId = ?").get(projectId, scenarioId).m
    : db.prepare("SELECT MAX(revisionNumber) AS m FROM estimate_revisions WHERE projectId = ?").get(projectId).m;
  const revisionNumber = lastRev == null ? 0 : lastRev + 1;
  const snapshot = snapshotProject(projectId);
  const totals = calculateProject(projectId, { scenarioId, writeAudit: true });
  const result = db
    .prepare("INSERT INTO estimate_revisions (projectId, scenarioId, revisionNumber, note, snapshot, totals, createdAt) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))")
    .run(projectId, scenarioId, revisionNumber, note ?? null, JSON.stringify(snapshot), JSON.stringify(totals));
  res.status(201).json({ id: result.lastInsertRowid, revisionNumber, totals });
});

// ── Audit log ────────────────────────────────────────────────────────────────

router.get("/audit", (req, res) => {
  const projectId = Number(req.query.projectId);
  if (!projectId) return res.status(400).json({ error: "projectId is required" });
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  const rows = db
    .prepare("SELECT * FROM calculation_audit WHERE projectId = ? ORDER BY id DESC LIMIT ?")
    .all(projectId, limit);
  res.json(rows.map((r) => ({ ...r, sourceData: JSON.parse(r.sourceData), totals: JSON.parse(r.totals) })));
});

export default router;
