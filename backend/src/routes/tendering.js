import { Router } from "express";
import { db } from "../db.js";
import { makeRegisterRouter, logChange } from "./registerRouter.js";
import { calculateProject } from "../services/costEngine.js";

// ── Register routers (clients, tenders, drawings, specs, addenda, rfis) ─────

export const clientsRouter = makeRegisterRouter("clients", {
  fields: ["company", "owner", "address", "contactPerson", "telephone", "email", "tin", "taxType", "paymentTerms", "preferredContractor", "status"],
  searchCols: ["company", "owner", "contactPerson", "email"],
  requiredCol: "company",
  logEntity: "client",
});

export const tendersRouter = makeRegisterRouter("tenders", {
  fields: ["tenderNo", "projectId", "clientId", "client", "bidTitle", "bidDate", "submissionDate", "openingDate", "engineer", "estimator", "status", "currency", "remarks"],
  searchCols: ["tenderNo", "bidTitle", "client", "engineer", "estimator"],
  requiredCol: "bidTitle",
  numericCols: ["projectId", "clientId"],
  logEntity: "tender",
});

export const drawingsRouter = makeRegisterRouter("drawings", {
  fields: ["projectId", "drawingNumber", "revision", "discipline", "title", "issueDate", "currentRevision", "supersededRevisions", "status"],
  searchCols: ["drawingNumber", "title", "discipline"],
  requiredCol: "drawingNumber",
  numericCols: ["projectId"],
  logEntity: "drawing",
});

export const specificationsRouter = makeRegisterRouter("specifications", {
  fields: ["projectId", "division", "section", "description", "revision", "specDate", "linkedBoqItems"],
  searchCols: ["division", "section", "description"],
  requiredCol: "description",
  numericCols: ["projectId"],
  logEntity: "specification",
});

export const addendaRouter = makeRegisterRouter("addenda", {
  fields: ["projectId", "addendumNumber", "addendumDate", "affectedItems", "costImpact", "description"],
  searchCols: ["addendumNumber", "description", "affectedItems"],
  requiredCol: "addendumNumber",
  numericCols: ["projectId", "costImpact"],
  logEntity: "addendum",
});

export const rfisRouter = makeRegisterRouter("rfis", {
  fields: ["projectId", "requestNumber", "question", "answer", "status", "dateSent", "dateClosed", "linkedBoqItems"],
  searchCols: ["requestNumber", "question", "answer"],
  requiredCol: "requestNumber",
  numericCols: ["projectId"],
  logEntity: "rfi",
});

// ── Documents (polymorphic + version history) ───────────────────────────────

export const documentsRouter = Router();

const ACCEPTED_TYPES = ["pdf", "dwg", "dxf", "docx", "xlsx", "png", "jpg", "jpeg", "gif", "zip"];

documentsRouter.get("/", (req, res) => {
  const { entityType, entityId } = req.query;
  let sql = "SELECT * FROM documents WHERE deletedAt IS NULL";
  const params = [];
  if (entityType) { sql += " AND entityType = ?"; params.push(entityType); }
  if (entityId) { sql += " AND entityId = ?"; params.push(Number(entityId)); }
  sql += " ORDER BY id DESC";
  const docs = db.prepare(sql).all(...params);
  res.json(docs.map((d) => ({
    ...d,
    versions: db.prepare("SELECT * FROM document_versions WHERE documentId = ? ORDER BY version DESC").all(d.id),
  })));
});

documentsRouter.post("/", (req, res) => {
  const { entityType, entityId, name, fileType, description, fileName, fileSize, url, uploadedBy } = req.body;
  if (!entityType || !entityId || !name) return res.status(400).json({ error: "entityType, entityId and name are required" });
  if (fileType && !ACCEPTED_TYPES.includes(String(fileType).toLowerCase()))
    return res.status(400).json({ error: `Unsupported file type. Accepted: ${ACCEPTED_TYPES.join(", ")}` });
  db.exec("BEGIN");
  try {
    const result = db.prepare("INSERT INTO documents (entityType, entityId, name, fileType, description, currentVersion) VALUES (?, ?, ?, ?, ?, 1)")
      .run(entityType, Number(entityId), name, fileType ?? null, description ?? null);
    const docId = result.lastInsertRowid;
    db.prepare("INSERT INTO document_versions (documentId, version, fileName, fileType, fileSize, url, uploadedBy) VALUES (?, 1, ?, ?, ?, ?, ?)")
      .run(docId, fileName ?? name, fileType ?? null, fileSize ?? null, url ?? null, uploadedBy ?? null);
    db.exec("COMMIT");
    res.status(201).json(db.prepare("SELECT * FROM documents WHERE id = ?").get(docId));
  } catch (e) { db.exec("ROLLBACK"); res.status(500).json({ error: e.message }); }
});

// Upload a new version of an existing document.
documentsRouter.post("/:id/versions", (req, res) => {
  const id = Number(req.params.id);
  const doc = db.prepare("SELECT * FROM documents WHERE id = ?").get(id);
  if (!doc) return res.status(404).json({ error: "Not found" });
  const { fileName, fileType, fileSize, url, note, uploadedBy } = req.body;
  if (fileType && !ACCEPTED_TYPES.includes(String(fileType).toLowerCase()))
    return res.status(400).json({ error: `Unsupported file type. Accepted: ${ACCEPTED_TYPES.join(", ")}` });
  const nextVersion = doc.currentVersion + 1;
  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO document_versions (documentId, version, fileName, fileType, fileSize, url, note, uploadedBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, nextVersion, fileName ?? doc.name, fileType ?? doc.fileType, fileSize ?? null, url ?? null, note ?? null, uploadedBy ?? null);
    db.prepare("UPDATE documents SET currentVersion = ?, fileType = ?, updatedAt = datetime('now') WHERE id = ?").run(nextVersion, fileType ?? doc.fileType, id);
    db.exec("COMMIT");
    res.status(201).json(db.prepare("SELECT * FROM documents WHERE id = ?").get(id));
  } catch (e) { db.exec("ROLLBACK"); res.status(500).json({ error: e.message }); }
});

documentsRouter.delete("/:id", (req, res) => {
  db.prepare("UPDATE documents SET deletedAt = datetime('now') WHERE id = ?").run(Number(req.params.id));
  res.status(204).end();
});

documentsRouter.get("/accepted-types", (req, res) => res.json({ types: ACCEPTED_TYPES }));

// ── Change log ──────────────────────────────────────────────────────────────

export const miscRouter = Router();

miscRouter.get("/change-log", (req, res) => {
  const { entityType, entityId } = req.query;
  const limit = Math.min(Number(req.query.limit) || 100, 1000);
  let sql = "SELECT * FROM change_log";
  const params = [];
  const where = [];
  if (entityType) { where.push("entityType = ?"); params.push(entityType); }
  if (entityId) { where.push("entityId = ?"); params.push(Number(entityId)); }
  if (where.length) sql += ` WHERE ${where.join(" AND ")}`;
  sql += " ORDER BY id DESC LIMIT ?";
  params.push(limit);
  res.json(db.prepare(sql).all(...params));
});

miscRouter.post("/change-log", (req, res) => {
  const { entityType, entityId, field, previousValue, newValue, reason, changedBy } = req.body;
  if (!entityType) return res.status(400).json({ error: "entityType is required" });
  logChange(entityType, entityId, field, previousValue, newValue, reason, changedBy);
  res.status(201).json({ ok: true });
});

// ── Bid comparison (reuses the cost engine — no duplicated math) ────────────
// Compares a project's scenarios (Original / Revised / VE / Tender), each
// recalculated via calculateProject, and highlights differences vs the first.

miscRouter.get("/bid-comparison/:projectId", (req, res) => {
  const projectId = Number(req.params.projectId);
  const project = db.prepare("SELECT * FROM projects WHERE id = ? AND deletedAt IS NULL").get(projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const scenarios = db.prepare("SELECT * FROM estimate_scenarios WHERE projectId = ? AND deletedAt IS NULL ORDER BY id").all(projectId);
  // Always include the project default (no scenario) as a baseline column.
  const columns = [{ id: null, name: "Project Default", type: "default" }, ...scenarios.map((s) => ({ id: s.id, name: s.name, type: s.type }))];

  const metrics = ["directCost", "indirectTotal", "subtotal", "vatTotal", "bidPrice", "discountTotal", "finalTenderPrice"];
  const rows = columns.map((col) => {
    const calc = calculateProject(projectId, { scenarioId: col.id });
    const w = calc.waterfall;
    return { ...col, values: Object.fromEntries(metrics.map((m) => [m, w[m]])) };
  });

  // Differences vs the first column.
  const base = rows[0];
  const diffs = rows.map((r) => ({
    ...r,
    deltas: Object.fromEntries(metrics.map((m) => [m, r.values[m] - base.values[m]])),
  }));

  res.json({ project: { id: project.id, name: project.name }, metrics, columns: diffs });
});

// ── Global search ───────────────────────────────────────────────────────────

miscRouter.get("/search", (req, res) => {
  const q = req.query.q;
  if (!q || q.length < 1) return res.json({ results: [] });
  const like = `%${q}%`;
  const results = [];

  const add = (type, rows, labelFn) => rows.forEach((r) => results.push({ type, id: r.id, label: labelFn(r) }));

  add("project", db.prepare("SELECT id, name, projectNumber FROM projects WHERE deletedAt IS NULL AND (name LIKE ? OR projectNumber LIKE ?) LIMIT 10").all(like, like), (r) => r.name);
  add("client", db.prepare("SELECT id, company FROM clients WHERE deletedAt IS NULL AND company LIKE ? LIMIT 10").all(like), (r) => r.company);
  add("supplier", db.prepare("SELECT id, companyName FROM suppliers WHERE deletedAt IS NULL AND companyName LIKE ? LIMIT 10").all(like), (r) => r.companyName);
  add("material", db.prepare("SELECT id, name, code FROM materials WHERE deletedAt IS NULL AND (name LIKE ? OR code LIKE ?) LIMIT 10").all(like, like), (r) => r.name);
  add("assembly", db.prepare("SELECT id, name, code FROM assemblies WHERE name LIKE ? OR code LIKE ? LIMIT 10").all(like, like), (r) => r.name);
  add("upa", db.prepare("SELECT id, description, code FROM unit_price_analyses WHERE deletedAt IS NULL AND (description LIKE ? OR code LIKE ?) LIMIT 10").all(like, like), (r) => r.description);
  add("document", db.prepare("SELECT id, name FROM documents WHERE deletedAt IS NULL AND name LIKE ? LIMIT 10").all(like), (r) => r.name);
  add("specification", db.prepare("SELECT id, description, section FROM specifications WHERE deletedAt IS NULL AND (description LIKE ? OR section LIKE ?) LIMIT 10").all(like, like), (r) => r.description);

  res.json({ query: q, count: results.length, results });
});
