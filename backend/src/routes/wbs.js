import { Router } from "express";
import { db } from "../db.js";

const router = Router();

router.get("/categories", (req, res) => {
  const categories = db.prepare("SELECT * FROM wbs_categories ORDER BY sortOrder ASC").all();
  const subcategories = db.prepare("SELECT * FROM wbs_subcategories ORDER BY sortOrder ASC").all();
  const withSubcategories = categories.map((category) => ({
    ...category,
    subcategories: subcategories.filter((s) => s.wbsCategoryId === category.id),
  }));
  res.json(withSubcategories);
});

router.post("/categories", (req, res) => {
  const { name, sortOrder } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });
  const result = db
    .prepare("INSERT INTO wbs_categories (name, sortOrder) VALUES (?, ?)")
    .run(name, Number(sortOrder ?? 0));
  res.status(201).json(db.prepare("SELECT * FROM wbs_categories WHERE id = ?").get(result.lastInsertRowid));
});

router.post("/categories/:id/subcategories", (req, res) => {
  const wbsCategoryId = Number(req.params.id);
  const { name, sortOrder } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });
  const result = db
    .prepare("INSERT INTO wbs_subcategories (wbsCategoryId, name, sortOrder) VALUES (?, ?, ?)")
    .run(wbsCategoryId, name, Number(sortOrder ?? 0));
  res.status(201).json(db.prepare("SELECT * FROM wbs_subcategories WHERE id = ?").get(result.lastInsertRowid));
});

router.delete("/subcategories/:id", (req, res) => {
  const id = Number(req.params.id);
  db.prepare("DELETE FROM wbs_subcategories WHERE id = ?").run(id);
  res.status(204).end();
});

router.delete("/categories/:id", (req, res) => {
  const id = Number(req.params.id);
  db.prepare("DELETE FROM wbs_categories WHERE id = ?").run(id);
  res.status(204).end();
});

export default router;
