import { Router } from "express";
import { db } from "../db.js";

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

router.get("/", (req, res) => {
  const projects = db
    .prepare("SELECT * FROM projects WHERE deletedAt IS NULL ORDER BY updatedAt DESC")
    .all();
  res.json(projects);
});

router.get("/:id", (req, res) => {
  const id = Number(req.params.id);
  const project = db.prepare("SELECT * FROM projects WHERE id = ? AND deletedAt IS NULL").get(id);
  if (!project) return res.status(404).json({ error: "Not found" });
  res.json(project);
});

router.post("/", (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });

  const values = FIELDS.map((f) => (f === "currency" ? req.body[f] || "USD" : req.body[f] ?? null));
  const placeholders = FIELDS.map(() => "?").join(", ");
  const result = db
    .prepare(`INSERT INTO projects (${FIELDS.join(", ")}) VALUES (${placeholders})`)
    .run(...values);

  res.status(201).json(db.prepare("SELECT * FROM projects WHERE id = ?").get(result.lastInsertRowid));
});

router.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const values = FIELDS.map((f) => req.body[f] ?? existing[f]);
  const assignments = FIELDS.map((f) => `${f} = ?`).join(", ");
  db.prepare(`UPDATE projects SET ${assignments}, updatedAt = datetime('now') WHERE id = ?`).run(...values, id);

  res.json(db.prepare("SELECT * FROM projects WHERE id = ?").get(id));
});

// Soft delete: archive the project instead of removing it, so historical
// estimates and reports referencing it stay intact.
router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  db.prepare("UPDATE projects SET deletedAt = datetime('now') WHERE id = ?").run(id);
  res.status(204).end();
});

export default router;
