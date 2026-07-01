import crypto from "node:crypto";
import { db } from "../db.js";

// ── Password hashing (scrypt, no external deps) ─────────────────────────────

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

export function verifyPassword(password, hash, salt) {
  if (!hash || !salt) return false;
  const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ── Sessions ────────────────────────────────────────────────────────────────

const SESSION_MINUTES = 30;          // inactivity timeout
const REMEMBER_DAYS = 30;

const REFRESH_DAYS = 30;

export function createSession(userId, rememberMe) {
  const token = crypto.randomBytes(32).toString("hex");
  const refreshToken = crypto.randomBytes(32).toString("hex");
  const ms = rememberMe ? REMEMBER_DAYS * 86400_000 : SESSION_MINUTES * 60_000;
  const expiresAt = new Date(Date.now() + ms).toISOString();
  const refreshExpiresAt = new Date(Date.now() + REFRESH_DAYS * 86400_000).toISOString();
  db.prepare("INSERT INTO sessions (userId, token, rememberMe, expiresAt, refreshToken, refreshExpiresAt) VALUES (?, ?, ?, ?, ?, ?)")
    .run(userId, token, rememberMe ? 1 : 0, expiresAt, refreshToken, refreshExpiresAt);
  return { token, expiresAt, refreshToken, refreshExpiresAt };
}

// Rotate an access token using a valid refresh token. Returns the new access
// token (and a rotated refresh token) or null if the refresh token is invalid.
export function refreshSession(refreshToken) {
  if (!refreshToken) return null;
  const s = db.prepare("SELECT * FROM sessions WHERE refreshToken = ?").get(refreshToken);
  if (!s) return null;
  if (s.refreshExpiresAt && new Date(s.refreshExpiresAt).getTime() < Date.now()) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(s.id);
    return null;
  }
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(s.userId);
  if (!user || user.status !== "active") return null;
  const token = crypto.randomBytes(32).toString("hex");
  const newRefresh = crypto.randomBytes(32).toString("hex");
  const ms = s.rememberMe ? REMEMBER_DAYS * 86400_000 : SESSION_MINUTES * 60_000;
  const expiresAt = new Date(Date.now() + ms).toISOString();
  const refreshExpiresAt = new Date(Date.now() + REFRESH_DAYS * 86400_000).toISOString();
  db.prepare("UPDATE sessions SET token = ?, expiresAt = ?, refreshToken = ?, refreshExpiresAt = ? WHERE id = ?")
    .run(token, expiresAt, newRefresh, refreshExpiresAt, s.id);
  return { token, expiresAt, refreshToken: newRefresh, refreshExpiresAt, user };
}

// Validate a token and slide the expiry forward (activity-based timeout).
export function validateSession(token) {
  if (!token) return null;
  const s = db.prepare("SELECT * FROM sessions WHERE token = ?").get(token);
  if (!s) return null;
  if (new Date(s.expiresAt).getTime() < Date.now()) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(s.id);
    return null;
  }
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(s.userId);
  if (!user || user.status !== "active") return null;
  // Slide expiry (skip for remember-me long sessions to avoid churn).
  if (!s.rememberMe) {
    const expiresAt = new Date(Date.now() + SESSION_MINUTES * 60_000).toISOString();
    db.prepare("UPDATE sessions SET expiresAt = ? WHERE id = ?").run(expiresAt, s.id);
  }
  return user;
}

export function destroySession(token) {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

// ── Permissions ─────────────────────────────────────────────────────────────

export function getPermissions(user) {
  if (!user) return {};
  const role = user.roleId ? db.prepare("SELECT * FROM roles WHERE id = ?").get(user.roleId)
    : db.prepare("SELECT * FROM roles WHERE name = ?").get(user.role);
  if (!role) return {};
  try { return JSON.parse(role.permissions); } catch { return {}; }
}

export function hasPermission(user, module, action) {
  const perms = getPermissions(user);
  return Array.isArray(perms[module]) && perms[module].includes(action);
}

export function isAdmin(user) {
  return user && (user.role === "Administrator" || hasPermission(user, "Administration", "edit"));
}

// ── Audit log ───────────────────────────────────────────────────────────────

// Log an activity/audit entry. `meta` may carry oldValue, newValue, ipAddress,
// userAgent and a category (general | security | system) for the audit trail.
export function logActivity(user, action, entityType, entityId, detail, meta = {}) {
  const security = ["login", "logout", "login_failed", "password_change", "password_reset", "token_refresh", "permission_denied"].includes(action);
  const category = meta.category || (security ? "security" : "general");
  db.prepare(
    `INSERT INTO activity_log (userId, userName, action, entityType, entityId, detail, oldValue, newValue, ipAddress, userAgent, category, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(user?.id ?? null, user?.name ?? user?.username ?? "system", action, entityType ?? null, entityId ?? null, detail ?? null,
    meta.oldValue != null ? (typeof meta.oldValue === "string" ? meta.oldValue : JSON.stringify(meta.oldValue)) : null,
    meta.newValue != null ? (typeof meta.newValue === "string" ? meta.newValue : JSON.stringify(meta.newValue)) : null,
    meta.ipAddress ?? null, meta.userAgent ?? null, category);
}

// ── Notifications helper ────────────────────────────────────────────────────

export function notify(userId, type, message, link) {
  if (!userId) return;
  db.prepare("INSERT INTO notifications (userId, type, message, link) VALUES (?, ?, ?, ?)").run(userId, type, message, link ?? null);
}

// ── Express middleware ──────────────────────────────────────────────────────

// Attaches req.user when a valid token is present; never blocks (backward
// compatible — existing routes keep working unauthenticated).
export function authOptional(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : (req.headers["x-auth-token"] || null);
  req.authToken = token;
  req.user = token ? validateSession(token) : null;
  // Capture request origin for the audit trail.
  req.ipAddress = (req.headers["x-forwarded-for"]?.split(",")[0].trim()) || req.socket?.remoteAddress || null;
  req.userAgent = req.headers["user-agent"] || null;
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  next();
}

export function requirePermission(module, action) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Authentication required" });
    if (!hasPermission(req.user, module, action)) return res.status(403).json({ error: `Permission denied: ${module}:${action}` });
    next();
  };
}

export function publicUser(user) {
  if (!user) return null;
  const { passwordHash, passwordSalt, ...safe } = user;
  return { ...safe, permissions: getPermissions(user) };
}
