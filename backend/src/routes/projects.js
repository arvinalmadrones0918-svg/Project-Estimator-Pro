import { Router } from "express";
import { db } from "../db.js";
import { getProjectTotalCost } from "./modules.js";

const router = Router();

const FIELDS = [
  "name",
  "projectNumber",
  "client",
  "owner",
  "consultant",
  "location",
  "estimator",
  "revision",
  "date",
  "currency",
];

function withRollup(project) {
  return { ...project, totalEstimatedCost: getProjectTotalCost(project.id) };
}

router.get("/", (req, res) => {
  const { q, status } = req.query;
  let sql = "SELECT * FROM projects WHERE deletedAt IS NULL";
  const params = [];
  if (status) {
    sql += " AND status = ?";
    params.push(status);
  }
  if (q) {
    sql += " AND (name LIKE ? OR projectNumber LIKE ? OR client LIKE ?)";
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  sql += " ORDER BY updatedAt DESC";
  const projects = db.prepare(sql).all(...params);
  res.json(projects.map(withRollup));
});

router.get("/:id", (req, res) => {
  const id = Number(req.params.id);
  const project = db.prepare("SELECT * FROM projects WHERE id = ? AND deletedAt IS NULL").get(id);
  if (!project) return res.status(404).json({ error: "Not found" });
  res.json(withRollup(project));
});

router.post("/", (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });

  const values = FIELDS.map((f) => (f === "currency" ? req.body[f] || "USD" : req.body[f] ?? null));
  const placeholders = FIELDS.map(() => "?").join(", ");
  const result = db
    .prepare(`INSERT INTO projects (${FIELDS.join(", ")}) VALUES (${placeholders})`)
    .run(...values);

  res.status(201).json(withRollup(db.prepare("SELECT * FROM projects WHERE id = ?").get(result.lastInsertRowid)));
});

router.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const values = FIELDS.map((f) => req.body[f] ?? existing[f]);
  const assignments = FIELDS.map((f) => `${f} = ?`).join(", ");
  db.prepare(`UPDATE projects SET ${assignments}, updatedAt = datetime('now') WHERE id = ?`).run(...values, id);

  res.json(withRollup(db.prepare("SELECT * FROM projects WHERE id = ?").get(id)));
});

// Soft delete: archive the project instead of removing it, so historical
// estimates and reports referencing it stay intact.
router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  db.prepare("UPDATE projects SET deletedAt = datetime('now') WHERE id = ?").run(id);
  res.status(204).end();
});

// Archive/restore are distinct from delete: an archived project stays fully
// visible (read-only in the UI) and searchable, it just drops out of the
// "active" filter on the dashboard.
router.put("/:id/archive", (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM projects WHERE id = ? AND deletedAt IS NULL").get(id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  db.prepare("UPDATE projects SET status = 'archived', updatedAt = datetime('now') WHERE id = ?").run(id);
  res.json(withRollup(db.prepare("SELECT * FROM projects WHERE id = ?").get(id)));
});

router.put("/:id/restore", (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM projects WHERE id = ? AND deletedAt IS NULL").get(id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  db.prepare("UPDATE projects SET status = 'active', updatedAt = datetime('now') WHERE id = ?").run(id);
  res.json(withRollup(db.prepare("SELECT * FROM projects WHERE id = ?").get(id)));
});

const LINE_ITEM_TABLES = [
  { table: "module_materials", cols: ["materialId", "quantity", "unitPriceAtEntry", "notes", "sortOrder"] },
  { table: "module_labor", cols: ["specializationId", "quantity", "hourlyRateAtEntry", "notes", "sortOrder"] },
  { table: "module_equipment", cols: ["equipmentId", "quantity", "unitPriceAtEntry", "notes", "sortOrder"] },
  { table: "module_subcontract", cols: ["description", "cost", "notes", "sortOrder"] },
  { table: "module_other_costs", cols: ["description", "cost", "notes", "sortOrder"] },
  { table: "module_assemblies", cols: ["assemblyId", "quantity", "unitCostAtEntry", "notes", "sortOrder"] },
];

// Deep-copies a project: the project row, every (non-deleted) work module,
// and every line item on those modules, all with fresh ids. Price snapshots
// are copied verbatim so the duplicate's cost matches the original exactly
// at the moment of duplication.
router.post("/:id/duplicate", (req, res) => {
  const id = Number(req.params.id);
  const source = db.prepare("SELECT * FROM projects WHERE id = ? AND deletedAt IS NULL").get(id);
  if (!source) return res.status(404).json({ error: "Not found" });

  const values = FIELDS.map((f) => (f === "name" ? `${source.name} (Copy)` : source[f]));
  const placeholders = FIELDS.map(() => "?").join(", ");
  const projectResult = db
    .prepare(`INSERT INTO projects (${FIELDS.join(", ")}) VALUES (${placeholders})`)
    .run(...values);
  const newProjectId = projectResult.lastInsertRowid;

  const modules = db
    .prepare("SELECT * FROM work_modules WHERE projectId = ? AND deletedAt IS NULL")
    .all(id);

  for (const sourceModule of modules) {
    const moduleResult = db
      .prepare(
        `INSERT INTO work_modules (name, description, projectId, wbsCategoryId, wbsSubcategoryId, sortOrder, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
      )
      .run(
        sourceModule.name,
        sourceModule.description,
        newProjectId,
        sourceModule.wbsCategoryId,
        sourceModule.wbsSubcategoryId,
        sourceModule.sortOrder
      );
    const newModuleId = moduleResult.lastInsertRowid;

    for (const { table, cols } of LINE_ITEM_TABLES) {
      const rows = db.prepare(`SELECT * FROM ${table} WHERE workModuleId = ?`).all(sourceModule.id);
      const insert = db.prepare(
        `INSERT INTO ${table} (workModuleId, ${cols.join(", ")}, createdAt, updatedAt)
         VALUES (?, ${cols.map(() => "?").join(", ")}, datetime('now'), datetime('now'))`
      );
      for (const row of rows) {
        insert.run(newModuleId, ...cols.map((c) => row[c]));
      }
    }
  }

  res.status(201).json(withRollup(db.prepare("SELECT * FROM projects WHERE id = ?").get(newProjectId)));
});

export default router;
