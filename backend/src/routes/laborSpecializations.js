import { Router } from "express";
import { db } from "../db.js";

const router = Router();

router.get("/", (req, res) => {
  const includeInactive = req.query.includeInactive === "true";
  const specs = includeInactive
    ? db.prepare("SELECT * FROM labor_specializations ORDER BY name ASC").all()
    : db.prepare("SELECT * FROM labor_specializations WHERE isActive = 1 ORDER BY name ASC").all();
  res.json(specs);
});

router.post("/", (req, res) => {
  const { name, hourlyRate, code } = req.body;
  if (!name || hourlyRate == null) {
    return res.status(400).json({ error: "name and hourlyRate are required" });
  }
  const result = db
    .prepare(
      `INSERT INTO labor_specializations (name, hourlyRate, code, createdAt, updatedAt)
       VALUES (?, ?, ?, datetime('now'), datetime('now'))`
    )
    .run(name, Number(hourlyRate), code ?? null);
  const spec = db.prepare("SELECT * FROM labor_specializations WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(spec);
});

router.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM labor_specializations WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const { name, hourlyRate, code, isActive } = req.body;
  db.prepare(
    `UPDATE labor_specializations
     SET name = ?, hourlyRate = ?, code = ?, isActive = ?, updatedAt = datetime('now')
     WHERE id = ?`
  ).run(
    name ?? existing.name,
    hourlyRate != null ? Number(hourlyRate) : existing.hourlyRate,
    code !== undefined ? code : existing.code,
    isActive !== undefined ? Number(Boolean(isActive)) : existing.isActive,
    id
  );
  res.json(db.prepare("SELECT * FROM labor_specializations WHERE id = ?").get(id));
});

router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  db.prepare("UPDATE labor_specializations SET isActive = 0, updatedAt = datetime('now') WHERE id = ?").run(id);
  res.status(204).end();
});

export default router;
