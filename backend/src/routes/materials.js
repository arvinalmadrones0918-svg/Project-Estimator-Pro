import { Router } from "express";
import { db } from "../db.js";

const router = Router();

router.get("/", (req, res) => {
  const materials = db.prepare("SELECT * FROM materials ORDER BY name ASC").all();
  res.json(materials);
});

router.post("/", (req, res) => {
  const { name, category, unit, unitPrice } = req.body;
  if (!name || !category || !unit || unitPrice == null) {
    return res.status(400).json({ error: "name, category, unit, unitPrice are required" });
  }
  const result = db
    .prepare("INSERT INTO materials (name, category, unit, unitPrice) VALUES (?, ?, ?, ?)")
    .run(name, category, unit, Number(unitPrice));
  const material = db.prepare("SELECT * FROM materials WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(material);
});

router.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM materials WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const { name, category, unit, unitPrice } = req.body;
  db.prepare("UPDATE materials SET name = ?, category = ?, unit = ?, unitPrice = ? WHERE id = ?").run(
    name ?? existing.name,
    category ?? existing.category,
    unit ?? existing.unit,
    unitPrice != null ? Number(unitPrice) : existing.unitPrice,
    id
  );
  res.json(db.prepare("SELECT * FROM materials WHERE id = ?").get(id));
});

router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  db.prepare("DELETE FROM materials WHERE id = ?").run(id);
  res.status(204).end();
});

export default router;
