import { Router } from "express";
import { db } from "../db.js";
import { hashPassword, publicUser, requirePermission, logActivity } from "../services/auth.js";

const router = Router();

const FIELDS = ["employeeId", "username", "firstName", "lastName", "name", "position", "designation", "department", "company", "office", "email", "mobile", "status", "photo", "signature", "role", "roleId"];

// All user management requires the Administration permission.
router.use(requirePermission("Administration", "view"));

router.get("/", (req, res) => {
  res.json(db.prepare("SELECT * FROM users ORDER BY id").all().map(publicUser));
});

router.get("/roles", (req, res) => {
  res.json(db.prepare("SELECT * FROM roles ORDER BY id").all().map((r) => ({ ...r, permissions: JSON.parse(r.permissions) })));
});

router.post("/roles", requirePermission("Administration", "edit"), (req, res) => {
  const { name, permissions } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });
  const r = db.prepare("INSERT INTO roles (name, permissions, isBuiltIn) VALUES (?, ?, 0)").run(name, JSON.stringify(permissions || {}));
  logActivity(req.user, "create", "role", r.lastInsertRowid, name);
  res.status(201).json({ ...db.prepare("SELECT * FROM roles WHERE id = ?").get(r.lastInsertRowid), permissions: permissions || {} });
});

router.put("/roles/:id", requirePermission("Administration", "edit"), (req, res) => {
  const e = db.prepare("SELECT * FROM roles WHERE id = ?").get(Number(req.params.id));
  if (!e) return res.status(404).json({ error: "Not found" });
  db.prepare("UPDATE roles SET name = ?, permissions = ? WHERE id = ?")
    .run(req.body.name ?? e.name, JSON.stringify(req.body.permissions ?? JSON.parse(e.permissions)), e.id);
  logActivity(req.user, "edit", "role", e.id, e.name);
  res.json({ ...db.prepare("SELECT * FROM roles WHERE id = ?").get(e.id), permissions: req.body.permissions ?? JSON.parse(e.permissions) });
});

router.post("/", requirePermission("Administration", "edit"), (req, res) => {
  const { username, password, email } = req.body;
  if (!username || !password || !email) return res.status(400).json({ error: "username, password and email are required" });
  if (db.prepare("SELECT id FROM users WHERE username = ?").get(username)) return res.status(409).json({ error: "Username already exists" });
  const { hash, salt } = hashPassword(password);
  const name = req.body.name || [req.body.firstName, req.body.lastName].filter(Boolean).join(" ") || username;
  const roleName = req.body.role || (req.body.roleId ? db.prepare("SELECT name FROM roles WHERE id = ?").get(Number(req.body.roleId))?.name : "Viewer") || "Viewer";
  const provided = FIELDS.filter((f) => req.body[f] !== undefined && req.body[f] !== "");
  const cols = [...new Set([...provided, "name", "role", "email", "passwordHash", "passwordSalt"])];
  const valueFor = (f) => f === "name" ? name : f === "role" ? roleName : f === "passwordHash" ? hash : f === "passwordSalt" ? salt : f === "roleId" ? Number(req.body.roleId) || null : req.body[f];
  const r = db.prepare(`INSERT INTO users (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`).run(...cols.map(valueFor));
  logActivity(req.user, "create", "user", r.lastInsertRowid, username);
  res.status(201).json(publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(r.lastInsertRowid)));
});

router.put("/:id", requirePermission("Administration", "edit"), (req, res) => {
  const e = db.prepare("SELECT * FROM users WHERE id = ?").get(Number(req.params.id));
  if (!e) return res.status(404).json({ error: "Not found" });
  const values = FIELDS.map((f) => {
    if (req.body[f] === undefined) return e[f];
    if (f === "roleId") return Number(req.body[f]) || null;
    return req.body[f];
  });
  db.prepare(`UPDATE users SET ${FIELDS.map((f) => `${f} = ?`).join(", ")}, updatedAt = datetime('now') WHERE id = ?`).run(...values, e.id);
  if (req.body.password) {
    const { hash, salt } = hashPassword(req.body.password);
    db.prepare("UPDATE users SET passwordHash = ?, passwordSalt = ? WHERE id = ?").run(hash, salt, e.id);
  }
  logActivity(req.user, "edit", "user", e.id, e.username);
  res.json(publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(e.id)));
});

router.delete("/:id", requirePermission("Administration", "delete"), (req, res) => {
  const id = Number(req.params.id);
  if (req.user.id === id) return res.status(400).json({ error: "You cannot delete your own account" });
  db.prepare("UPDATE users SET status = 'inactive' WHERE id = ?").run(id);
  logActivity(req.user, "delete", "user", id, null);
  res.status(204).end();
});

export default router;
