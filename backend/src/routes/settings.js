import { Router } from "express";
import { db } from "../db.js";
import { logActivity } from "../services/auth.js";

// Phase 11 — application settings (system prefs, currency, tax, units, formats).
const router = Router();

function allSettings() {
  const rows = db.prepare("SELECT key, value FROM app_settings").all();
  const out = {};
  for (const r of rows) { try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; } }
  return out;
}

router.get("/", (req, res) => res.json(allSettings()));

router.put("/", (req, res) => {
  const before = allSettings();
  const put = db.prepare(
    "INSERT INTO app_settings (key, value, updatedAt) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = datetime('now')"
  );
  db.exec("BEGIN");
  try {
    for (const [k, v] of Object.entries(req.body || {})) put.run(k, JSON.stringify(v));
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
  const after = allSettings();
  logActivity(req.user, "update", "app_settings", null, "Settings updated",
    { oldValue: before, newValue: after, ipAddress: req.ipAddress, userAgent: req.userAgent });
  res.json(after);
});

export default router;
