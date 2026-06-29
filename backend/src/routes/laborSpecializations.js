import { Router } from "express";
import { db } from "../db.js";

const router = Router();

router.get("/", (req, res) => {
  const specs = db.prepare("SELECT * FROM labor_specializations ORDER BY name ASC").all();
  res.json(specs);
});

router.post("/", (req, res) => {
  const { name, hourlyRate } = req.body;
  if (!name || hourlyRate == null) {
    return res.status(400).json({ error: "name and hourlyRate are required" });
  }
  const result = db
    .prepare("INSERT INTO labor_specializations (name, hourlyRate) VALUES (?, ?)")
    .run(name, Number(hourlyRate));
  const spec = db.prepare("SELECT * FROM labor_specializations WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(spec);
});

router.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM labor_specializations WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const { name, hourlyRate } = req.body;
  db.prepare("UPDATE labor_specializations SET name = ?, hourlyRate = ? WHERE id = ?").run(
    name ?? existing.name,
    hourlyRate != null ? Number(hourlyRate) : existing.hourlyRate,
    id
  );
  res.json(db.prepare("SELECT * FROM labor_specializations WHERE id = ?").get(id));
});

router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  db.prepare("DELETE FROM labor_specializations WHERE id = ?").run(id);
  res.status(204).end();
});

export default router;
