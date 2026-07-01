import { Router } from "express";
import { db } from "../db.js";
import { logActivity } from "../services/auth.js";

// Phase 10 (Enterprise) — Organization: company profile, branches, departments,
// business units, currencies and tax settings.
const router = Router();

// ── Company profile (singleton, id = 1) ──────────────────────────────────────
router.get("/company", (req, res) => {
  res.json(db.prepare("SELECT * FROM company_profile WHERE id = 1").get());
});

const COMPANY_FIELDS = ["name", "legalName", "registrationNo", "taxId", "address", "city", "country", "phone", "email", "website", "logo", "baseCurrency"];
router.put("/company", (req, res) => {
  const current = db.prepare("SELECT * FROM company_profile WHERE id = 1").get();
  const values = COMPANY_FIELDS.map((f) => (req.body[f] !== undefined ? req.body[f] : current[f]));
  db.prepare(`UPDATE company_profile SET ${COMPANY_FIELDS.map((f) => `${f} = ?`).join(", ")}, updatedAt = datetime('now') WHERE id = 1`).run(...values);
  logActivity(req.user, "update", "company_profile", 1, "Company profile updated",
    { oldValue: current, newValue: req.body, ipAddress: req.ipAddress, userAgent: req.userAgent });
  res.json(db.prepare("SELECT * FROM company_profile WHERE id = 1").get());
});

// ── Generic CRUD for the simple org collections ──────────────────────────────
function collection(path, table, fields, required) {
  router.get(`/${path}`, (req, res) => res.json(db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()));

  router.post(`/${path}`, (req, res) => {
    if (required && !req.body[required]) return res.status(400).json({ error: `${required} is required` });
    const cols = fields.filter((f) => req.body[f] !== undefined);
    if (cols.length === 0) return res.status(400).json({ error: "No fields provided" });
    const r = db.prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`).run(...cols.map((c) => req.body[c]));
    logActivity(req.user, "create", table, r.lastInsertRowid, null, { newValue: req.body, ipAddress: req.ipAddress, userAgent: req.userAgent });
    res.status(201).json(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(r.lastInsertRowid));
  });

  router.put(`/${path}/:id`, (req, res) => {
    const existing = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(Number(req.params.id));
    if (!existing) return res.status(404).json({ error: "Not found" });
    const cols = fields.filter((f) => req.body[f] !== undefined);
    if (cols.length) {
      db.prepare(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`).run(...cols.map((c) => req.body[c]), existing.id);
    }
    logActivity(req.user, "update", table, existing.id, null, { oldValue: existing, newValue: req.body, ipAddress: req.ipAddress, userAgent: req.userAgent });
    res.json(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(existing.id));
  });

  router.delete(`/${path}/:id`, (req, res) => {
    const existing = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(Number(req.params.id));
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(Number(req.params.id));
    logActivity(req.user, "delete", table, Number(req.params.id), null, { oldValue: existing, ipAddress: req.ipAddress, userAgent: req.userAgent });
    res.status(204).end();
  });
}

collection("branches", "org_branches", ["name", "code", "address", "city", "country", "phone", "manager", "isHeadOffice", "status"], "name");
collection("departments", "org_departments", ["name", "code", "branchId", "head", "status"], "name");
collection("business-units", "org_business_units", ["name", "code", "manager", "status"], "name");
collection("currencies", "org_currencies", ["code", "name", "symbol", "exchangeRate", "isBase", "status"], "code");
collection("tax-settings", "org_tax_settings", ["name", "taxType", "ratePct", "isDefault", "status"], "name");

export default router;
