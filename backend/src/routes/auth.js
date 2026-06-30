import { Router } from "express";
import crypto from "node:crypto";
import { db } from "../db.js";
import {
  hashPassword, verifyPassword, createSession, destroySession,
  logActivity, publicUser, requireAuth,
} from "../services/auth.js";

const router = Router();

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

router.post("/login", (req, res) => {
  const { username, password, rememberMe } = req.body;
  if (!username || !password) return res.status(400).json({ error: "username and password are required" });

  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username)
    || db.prepare("SELECT * FROM users WHERE email = ?").get(username);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
    return res.status(423).json({ error: `Account locked. Try again after ${new Date(user.lockedUntil).toLocaleTimeString()}` });
  }
  if (user.status !== "active") return res.status(403).json({ error: "Account is inactive" });

  if (!verifyPassword(password, user.passwordHash, user.passwordSalt)) {
    const failed = (user.failedLogins || 0) + 1;
    const lockedUntil = failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null;
    db.prepare("UPDATE users SET failedLogins = ?, lockedUntil = ? WHERE id = ?").run(failed, lockedUntil, user.id);
    logActivity(user, "login_failed", "user", user.id, `attempt ${failed}`);
    return res.status(401).json({ error: lockedUntil ? "Too many failed attempts. Account locked for 15 minutes." : "Invalid credentials" });
  }

  db.prepare("UPDATE users SET failedLogins = 0, lockedUntil = NULL, lastLoginAt = datetime('now') WHERE id = ?").run(user.id);
  const { token, expiresAt } = createSession(user.id, !!rememberMe);
  logActivity(user, "login", "user", user.id, null);
  res.json({ token, expiresAt, user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(user.id)) });
});

router.post("/logout", (req, res) => {
  if (req.authToken) destroySession(req.authToken);
  if (req.user) logActivity(req.user, "logout", "user", req.user.id, null);
  res.json({ ok: true });
});

router.get("/me", (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  res.json({ user: publicUser(req.user) });
});

router.post("/change-password", requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: "New password must be at least 6 characters" });
  if (!verifyPassword(currentPassword, req.user.passwordHash, req.user.passwordSalt))
    return res.status(401).json({ error: "Current password is incorrect" });
  const { hash, salt } = hashPassword(newPassword);
  db.prepare("UPDATE users SET passwordHash = ?, passwordSalt = ? WHERE id = ?").run(hash, salt, req.user.id);
  logActivity(req.user, "change_password", "user", req.user.id, null);
  res.json({ ok: true });
});

// Forgot password: issue a reset token (returned directly here since there is
// no mail service; in production this would be emailed).
router.post("/forgot-password", (req, res) => {
  const { username } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE username = ? OR email = ?").get(username, username);
  // Always respond ok to avoid user enumeration.
  if (!user) return res.json({ ok: true });
  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 3600_000).toISOString();
  db.prepare("INSERT INTO password_resets (userId, token, expiresAt) VALUES (?, ?, ?)").run(user.id, token, expiresAt);
  logActivity(user, "forgot_password", "user", user.id, null);
  res.json({ ok: true, resetToken: token });
});

router.post("/reset-password", (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword || newPassword.length < 6) return res.status(400).json({ error: "token and a 6+ char newPassword are required" });
  const pr = db.prepare("SELECT * FROM password_resets WHERE token = ? AND used = 0").get(token);
  if (!pr || new Date(pr.expiresAt).getTime() < Date.now()) return res.status(400).json({ error: "Invalid or expired reset token" });
  const { hash, salt } = hashPassword(newPassword);
  db.prepare("UPDATE users SET passwordHash = ?, passwordSalt = ?, failedLogins = 0, lockedUntil = NULL WHERE id = ?").run(hash, salt, pr.userId);
  db.prepare("UPDATE password_resets SET used = 1 WHERE id = ?").run(pr.id);
  logActivity({ id: pr.userId, name: "user" }, "reset_password", "user", pr.userId, null);
  res.json({ ok: true });
});

export default router;
