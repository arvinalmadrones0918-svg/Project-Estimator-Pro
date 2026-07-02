import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { db, dbPath } from "../db.js";
import { logActivity } from "../services/auth.js";

// Phase 11 — Database backup/restore + data import/export (JSON).
const router = Router();

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(path.dirname(dbPath), "backups");
function ensureDir() { fs.mkdirSync(BACKUP_DIR, { recursive: true }); }

// ── Backups ──────────────────────────────────────────────────────────────────
router.get("/backups", (req, res) => {
  res.json(db.prepare("SELECT * FROM backup_history ORDER BY id DESC LIMIT 200").all());
});

router.post("/backups", (req, res) => {
  ensureDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `backup-${stamp}.db`;
  const dest = path.join(BACKUP_DIR, fileName);
  try {
    // node:sqlite has no online-backup API here; the file copy is consistent
    // because writes are synchronous and we are single-threaded.
    fs.copyFileSync(dbPath, dest);
    const sizeBytes = fs.statSync(dest).size;
    const r = db.prepare("INSERT INTO backup_history (fileName, kind, sizeBytes, note, createdBy) VALUES (?, ?, ?, ?, ?)")
      .run(fileName, req.body?.kind || "manual", sizeBytes, req.body?.note ?? null, req.user?.name ?? null);
    logActivity(req.user, "backup", "database", r.lastInsertRowid, fileName, { ipAddress: req.ipAddress, userAgent: req.userAgent });
    res.status(201).json(db.prepare("SELECT * FROM backup_history WHERE id = ?").get(r.lastInsertRowid));
  } catch (e) { res.status(500).json({ error: `Backup failed: ${e.message}` }); }
});

// Download a backup file.
router.get("/backups/:id/download", (req, res) => {
  const row = db.prepare("SELECT * FROM backup_history WHERE id = ?").get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: "Backup not found" });
  const file = path.join(BACKUP_DIR, row.fileName);
  if (!fs.existsSync(file)) return res.status(410).json({ error: "Backup file no longer on disk" });
  res.download(file, row.fileName);
});

// Restore is intentionally guarded — it overwrites the live database and
// requires the server to be restarted afterwards.
router.post("/backups/:id/restore", (req, res) => {
  const row = db.prepare("SELECT * FROM backup_history WHERE id = ?").get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: "Backup not found" });
  const file = path.join(BACKUP_DIR, row.fileName);
  if (!fs.existsSync(file)) return res.status(410).json({ error: "Backup file no longer on disk" });
  if (req.body?.confirm !== true) return res.status(400).json({ error: "Restore requires { confirm: true }" });
  try {
    // Safety copy of the current DB before overwriting.
    ensureDir();
    fs.copyFileSync(dbPath, path.join(BACKUP_DIR, `pre-restore-${Date.now()}.db`));
    fs.copyFileSync(file, dbPath);
    logActivity(req.user, "restore", "database", row.id, row.fileName, { ipAddress: req.ipAddress, userAgent: req.userAgent });
    res.json({ ok: true, message: "Database restored. Restart the server to load the restored data." });
  } catch (e) { res.status(500).json({ error: `Restore failed: ${e.message}` }); }
});

// ── Data import / export (JSON) ──────────────────────────────────────────────
// Scopes: catalogs, users, organization, project (by id), database (everything).
const SCOPES = {
  catalogs: ["materials", "labor_specializations", "equipment", "subcontract_catalog", "other_costs_catalog", "assemblies", "assembly_items"],
  users: ["users", "roles"],
  organization: ["company_profile", "org_branches", "org_departments", "org_business_units", "org_currencies", "org_tax_settings"],
};
const ALL_EXPORT_TABLES = [
  "projects", "wbs_categories", "wbs_subcategories", "work_modules",
  "module_materials", "module_labor", "module_equipment", "module_subcontract", "module_other_costs", "module_assemblies",
  ...SCOPES.catalogs, ...SCOPES.organization, "app_settings",
];

function dumpTables(tables) {
  const data = {};
  for (const t of tables) {
    try { data[t] = db.prepare(`SELECT * FROM ${t}`).all(); } catch { /* table may not exist */ }
  }
  return data;
}

router.get("/export/:scope", (req, res) => {
  const scope = req.params.scope;
  let payload;
  if (scope === "database") payload = { scope, exportedAt: new Date().toISOString(), tables: dumpTables(ALL_EXPORT_TABLES) };
  else if (scope === "project") {
    const projectId = Number(req.query.projectId);
    if (!projectId) return res.status(400).json({ error: "projectId is required for project export" });
    const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });
    const modules = db.prepare("SELECT * FROM work_modules WHERE projectId = ?").all(projectId);
    const modIds = modules.map((m) => m.id);
    const lineFor = (t) => modIds.length ? db.prepare(`SELECT * FROM ${t} WHERE workModuleId IN (${modIds.map(() => "?").join(",")})`).all(...modIds) : [];
    payload = {
      scope, exportedAt: new Date().toISOString(), project, modules,
      lines: {
        module_materials: lineFor("module_materials"), module_labor: lineFor("module_labor"),
        module_equipment: lineFor("module_equipment"), module_subcontract: lineFor("module_subcontract"),
        module_other_costs: lineFor("module_other_costs"), module_assemblies: lineFor("module_assemblies"),
      },
    };
  } else if (SCOPES[scope]) payload = { scope, exportedAt: new Date().toISOString(), tables: dumpTables(SCOPES[scope]) };
  else return res.status(400).json({ error: `Unknown scope. Use: database, project, ${Object.keys(SCOPES).join(", ")}` });

  if (req.query.download === "true") {
    res.setHeader("Content-Disposition", `attachment; filename="export-${scope}.json"`);
    res.setHeader("Content-Type", "application/json");
  }
  res.json(payload);
});

// Import a previously exported catalogs/organization/users bundle (upsert by
// insert-or-ignore to avoid clobbering existing rows).
router.post("/import", (req, res) => {
  const { tables } = req.body || {};
  if (!tables || typeof tables !== "object") return res.status(400).json({ error: "Body must contain a `tables` object (from an export)." });
  let inserted = 0;
  db.exec("BEGIN");
  try {
    for (const [table, rows] of Object.entries(tables)) {
      if (!Array.isArray(rows) || rows.length === 0) continue;
      let cols;
      try { cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name); } catch { continue; }
      if (!cols.length) continue;
      for (const row of rows) {
        const useCols = cols.filter((c) => c in row);
        if (!useCols.length) continue;
        try {
          db.prepare(`INSERT OR IGNORE INTO ${table} (${useCols.join(",")}) VALUES (${useCols.map(() => "?").join(",")})`)
            .run(...useCols.map((c) => row[c]));
          inserted += 1;
        } catch { /* skip incompatible rows */ }
      }
    }
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
  logActivity(req.user, "import", "database", null, `${inserted} rows`, { ipAddress: req.ipAddress, userAgent: req.userAgent });
  res.json({ ok: true, inserted });
});

export default router;
