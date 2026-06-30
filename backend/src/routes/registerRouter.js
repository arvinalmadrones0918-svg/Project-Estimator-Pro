import { Router } from "express";
import { db } from "../db.js";

/**
 * Generic CRUD router for the Phase 9 "register" tables (clients, tenders,
 * drawings, specifications, addenda, rfis). They share the same shape:
 * a soft-deletable list with search + create/update/delete. This factory keeps
 * all six from re-implementing identical handlers.
 *
 *   table        - SQL table name
 *   fields       - writable columns
 *   searchCols   - columns matched by ?q=
 *   requiredCol  - column that must be present on create
 *   numericCols  - columns coerced to Number
 *   logEntity    - entity name used in the change log
 */
export function makeRegisterRouter(table, { fields, searchCols = [], requiredCol, numericCols = [], logEntity }) {
  const router = Router();

  function coerce(field, value) {
    if (numericCols.includes(field)) return value == null || value === "" ? 0 : Number(value);
    return value ?? null;
  }

  router.get("/", (req, res) => {
    const { q, projectId, status, includeDeleted } = req.query;
    const where = [];
    const params = [];
    if (!includeDeleted) where.push("deletedAt IS NULL");
    if (projectId && fields.includes("projectId")) { where.push("projectId = ?"); params.push(Number(projectId)); }
    if (status && fields.includes("status")) { where.push("status = ?"); params.push(status); }
    if (q && searchCols.length) {
      where.push(`(${searchCols.map((c) => `${c} LIKE ?`).join(" OR ")})`);
      searchCols.forEach(() => params.push(`%${q}%`));
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    res.json(db.prepare(`SELECT * FROM ${table} ${whereSql} ORDER BY id DESC`).all(...params));
  });

  router.get("/:id", (req, res) => {
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(Number(req.params.id));
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  });

  router.post("/", (req, res) => {
    if (requiredCol && !req.body[requiredCol]) return res.status(400).json({ error: `${requiredCol} is required` });
    // Only insert columns that were actually provided, so NOT NULL columns with
    // a DEFAULT (e.g. status) fall back to their default instead of NULL.
    const provided = fields.filter((f) => req.body[f] !== undefined);
    const cols = provided.length ? provided : [requiredCol].filter(Boolean);
    const values = cols.map((f) => coerce(f, req.body[f]));
    const placeholders = cols.map(() => "?").join(", ");
    const result = db.prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`).run(...values);
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(result.lastInsertRowid);
    if (logEntity) logChange(logEntity, row.id, null, null, JSON.stringify(req.body), req.body._reason, req.body._changedBy);
    res.status(201).json(row);
  });

  router.put("/:id", (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    if (!existing) return res.status(404).json({ error: "Not found" });
    const values = fields.map((f) => (req.body[f] !== undefined ? coerce(f, req.body[f]) : existing[f]));
    const assignments = fields.map((f) => `${f} = ?`).join(", ");
    db.prepare(`UPDATE ${table} SET ${assignments}, updatedAt = datetime('now') WHERE id = ?`).run(...values, id);
    // Log any changed field individually for the change log.
    if (logEntity) {
      for (const f of fields) {
        if (req.body[f] !== undefined && String(req.body[f]) !== String(existing[f] ?? "")) {
          logChange(logEntity, id, f, existing[f], req.body[f], req.body._reason, req.body._changedBy);
        }
      }
    }
    res.json(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id));
  });

  router.delete("/:id", (req, res) => {
    db.prepare(`UPDATE ${table} SET deletedAt = datetime('now') WHERE id = ?`).run(Number(req.params.id));
    if (logEntity) logChange(logEntity, Number(req.params.id), "deletedAt", null, "deleted", req.query.reason, req.query.changedBy);
    res.status(204).end();
  });

  return router;
}

// Shared change-log writer (also used directly elsewhere).
export function logChange(entityType, entityId, field, previousValue, newValue, reason, changedBy) {
  db.prepare(
    `INSERT INTO change_log (entityType, entityId, field, previousValue, newValue, reason, changedBy, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(entityType, entityId ?? null, field ?? null,
    previousValue == null ? null : String(previousValue),
    newValue == null ? null : String(newValue),
    reason ?? null, changedBy ?? null);
}
