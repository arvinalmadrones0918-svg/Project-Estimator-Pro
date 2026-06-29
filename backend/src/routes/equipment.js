import { Router } from "express";
import { db } from "../db.js";

const router = Router();

router.get("/", (req, res) => {
  const includeInactive = req.query.includeInactive === "true";
  const equipment = includeInactive
    ? db.prepare("SELECT * FROM equipment ORDER BY name ASC").all()
    : db.prepare("SELECT * FROM equipment WHERE isActive = 1 ORDER BY name ASC").all();
  res.json(equipment);
});

router.post("/", (req, res) => {
  const { name, category, unit, unitPrice, code } = req.body;
  if (!name || !category || !unit || unitPrice == null) {
    return res.status(400).json({ error: "name, category, unit, unitPrice are required" });
  }
  const result = db
    .prepare(
      `INSERT INTO equipment (name, category, unit, unitPrice, code, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
    .run(name, category, unit, Number(unitPrice), code ?? null);
  res.status(201).json(db.prepare("SELECT * FROM equipment WHERE id = ?").get(result.lastInsertRowid));
});

router.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM equipment WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const { name, category, unit, unitPrice, code, isActive } = req.body;
  db.prepare(
    `UPDATE equipment
     SET name = ?, category = ?, unit = ?, unitPrice = ?, code = ?, isActive = ?, updatedAt = datetime('now')
     WHERE id = ?`
  ).run(
    name ?? existing.name,
    category ?? existing.category,
    unit ?? existing.unit,
    unitPrice != null ? Number(unitPrice) : existing.unitPrice,
    code !== undefined ? code : existing.code,
    isActive !== undefined ? Number(Boolean(isActive)) : existing.isActive,
    id
  );
  res.json(db.prepare("SELECT * FROM equipment WHERE id = ?").get(id));
});

router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  db.prepare("UPDATE equipment SET isActive = 0, updatedAt = datetime('now') WHERE id = ?").run(id);
  res.status(204).end();
});

export default router;
