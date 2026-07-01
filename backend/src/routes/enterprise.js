import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, isAdmin, logActivity, notify, hasPermission } from "../services/auth.js";

const router = Router();
router.use(requireAuth);

// ── Estimate workflow ───────────────────────────────────────────────────────
// draft → forReview → (returned → resubmitted →) approved → issued → archived

const TRANSITIONS = {
  submit: { from: ["draft", "returned"], to: "forReview", action: "submit_for_review" },
  resubmit: { from: ["returned"], to: "forReview", action: "resubmit" },
  return: { from: ["forReview"], to: "returned", action: "return_for_revision" },
  reject: { from: ["forReview"], to: "returned", action: "reject" },
  issue: { from: ["approved"], to: "issued", action: "issue" },
  archive: { from: ["approved", "issued"], to: "archived", action: "archive" },
};

function getProject(id) { return db.prepare("SELECT * FROM projects WHERE id = ? AND deletedAt IS NULL").get(id); }

router.post("/workflow/:projectId/:transition", (req, res) => {
  const projectId = Number(req.params.projectId);
  const project = getProject(projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });

  // Approve is special (multi-level); handle separately.
  if (req.params.transition === "approve") {
    if (!hasPermission(req.user, "Projects", "approve")) return res.status(403).json({ error: "You do not have approval permission" });
    if (project.workflowStatus !== "forReview") return res.status(400).json({ error: `Cannot approve from status '${project.workflowStatus}'` });
    const requiredLevels = Math.max(1, Number(req.body.requiredLevels) || 1);
    const newLevel = (project.approvalLevel || 0) + 1;
    db.prepare("INSERT INTO approvals (projectId, level, status, approverUserId, approverName, comment, actedAt) VALUES (?, ?, 'approved', ?, ?, ?, datetime('now'))")
      .run(projectId, newLevel, req.user.id, req.user.name, req.body.comment ?? null);
    const finalApproved = newLevel >= requiredLevels;
    db.prepare("UPDATE projects SET approvalLevel = ?, workflowStatus = ?, updatedAt = datetime('now') WHERE id = ?")
      .run(newLevel, finalApproved ? "approved" : "forReview", projectId);
    logActivity(req.user, "approve", "project", projectId, `level ${newLevel}/${requiredLevels}`);
    return res.json({ workflowStatus: finalApproved ? "approved" : "forReview", approvalLevel: newLevel });
  }

  const t = TRANSITIONS[req.params.transition];
  if (!t) return res.status(400).json({ error: "Unknown transition" });
  if (!t.from.includes(project.workflowStatus)) return res.status(400).json({ error: `Cannot ${req.params.transition} from status '${project.workflowStatus}'` });

  // Returning/rejecting records an approval entry as rejected.
  if (req.params.transition === "return" || req.params.transition === "reject") {
    db.prepare("INSERT INTO approvals (projectId, level, status, approverUserId, approverName, comment, actedAt) VALUES (?, ?, 'rejected', ?, ?, ?, datetime('now'))")
      .run(projectId, (project.approvalLevel || 0) + 1, req.user.id, req.user.name, req.body.comment ?? null);
  }
  const resetLevel = (t.to === "forReview" || t.to === "returned") ? 0 : project.approvalLevel;
  db.prepare("UPDATE projects SET workflowStatus = ?, approvalLevel = ?, updatedAt = datetime('now') WHERE id = ?").run(t.to, resetLevel, projectId);
  logActivity(req.user, t.action, "project", projectId, req.body.comment ?? null);

  // Notify on submit: alert approvers.
  if (req.params.transition === "submit" || req.params.transition === "resubmit") {
    const approvers = db.prepare("SELECT id FROM users WHERE status = 'active' AND id != ?").all(req.user.id);
    for (const a of approvers) if (hasPermission(db.prepare("SELECT * FROM users WHERE id = ?").get(a.id), "Projects", "approve"))
      notify(a.id, "review_request", `"${project.name}" submitted for review`, `project:${projectId}`);
  }
  res.json({ workflowStatus: t.to, approvalLevel: resetLevel });
});

router.get("/workflow/:projectId/approvals", (req, res) => {
  res.json(db.prepare("SELECT * FROM approvals WHERE projectId = ? ORDER BY id DESC").all(Number(req.params.projectId)));
});

// ── Project locking ─────────────────────────────────────────────────────────

const LOCK_STALE_MIN = 30;

function activeLock(projectId) {
  const lock = db.prepare("SELECT * FROM project_locks WHERE projectId = ?").get(projectId);
  if (!lock) return null;
  if (Date.now() - new Date(lock.lockedAt + "Z").getTime() > LOCK_STALE_MIN * 60_000) {
    db.prepare("DELETE FROM project_locks WHERE projectId = ?").run(projectId);
    return null;
  }
  return lock;
}

router.get("/locks/:projectId", (req, res) => res.json(activeLock(Number(req.params.projectId)) || { locked: false }));

router.post("/locks/:projectId", (req, res) => {
  const projectId = Number(req.params.projectId);
  const lock = activeLock(projectId);
  // Held by someone else → 200 with a conflict flag (not a 4xx, so the browser
  // doesn't log a console error for an expected, handled condition).
  if (lock && lock.userId !== req.user.id) {
    return res.json({ locked: true, heldByOther: true, userId: lock.userId, userName: lock.userName, lockedAt: lock.lockedAt });
  }
  db.prepare("INSERT INTO project_locks (projectId, userId, userName, lockedAt) VALUES (?, ?, ?, datetime('now')) ON CONFLICT(projectId) DO UPDATE SET userId = excluded.userId, userName = excluded.userName, lockedAt = datetime('now')")
    .run(projectId, req.user.id, req.user.name);
  res.json({ locked: true, heldByOther: false, userId: req.user.id, userName: req.user.name });
});

router.delete("/locks/:projectId", (req, res) => {
  const lock = db.prepare("SELECT * FROM project_locks WHERE projectId = ?").get(Number(req.params.projectId));
  if (lock && lock.userId !== req.user.id && !isAdmin(req.user)) return res.status(403).json({ error: "Not your lock" });
  db.prepare("DELETE FROM project_locks WHERE projectId = ?").run(Number(req.params.projectId));
  res.json({ released: true });
});

router.post("/locks/:projectId/force", (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: "Administrator only" });
  db.prepare("DELETE FROM project_locks WHERE projectId = ?").run(Number(req.params.projectId));
  logActivity(req.user, "force_unlock", "project", Number(req.params.projectId), null);
  res.json({ released: true });
});

// ── Notifications ───────────────────────────────────────────────────────────

router.get("/notifications", (req, res) => {
  res.json(db.prepare("SELECT * FROM notifications WHERE userId = ? ORDER BY id DESC LIMIT 100").all(req.user.id));
});
router.post("/notifications/:id/read", (req, res) => {
  db.prepare("UPDATE notifications SET isRead = 1 WHERE id = ? AND userId = ?").run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});
router.post("/notifications/read-all", (req, res) => {
  db.prepare("UPDATE notifications SET isRead = 1 WHERE userId = ?").run(req.user.id);
  res.json({ ok: true });
});

// ── Favorites ───────────────────────────────────────────────────────────────

router.get("/favorites", (req, res) => {
  res.json(db.prepare(`SELECT p.id, p.name FROM favorites f JOIN projects p ON p.id = f.projectId WHERE f.userId = ? AND p.deletedAt IS NULL`).all(req.user.id));
});
router.post("/favorites/:projectId", (req, res) => {
  db.prepare("INSERT OR IGNORE INTO favorites (userId, projectId) VALUES (?, ?)").run(req.user.id, Number(req.params.projectId));
  res.json({ ok: true });
});
router.delete("/favorites/:projectId", (req, res) => {
  db.prepare("DELETE FROM favorites WHERE userId = ? AND projectId = ?").run(req.user.id, Number(req.params.projectId));
  res.json({ ok: true });
});

// ── User dashboard ──────────────────────────────────────────────────────────

router.get("/dashboard", (req, res) => {
  const canApprove = hasPermission(req.user, "Projects", "approve");
  res.json({
    pendingReviews: db.prepare("SELECT id, name, workflowStatus FROM projects WHERE deletedAt IS NULL AND workflowStatus = 'forReview' ORDER BY updatedAt DESC LIMIT 50").all(),
    pendingApprovals: canApprove ? db.prepare("SELECT id, name, approvalLevel FROM projects WHERE deletedAt IS NULL AND workflowStatus = 'forReview' ORDER BY updatedAt DESC LIMIT 50").all() : [],
    recentProjects: db.prepare("SELECT id, name, workflowStatus, updatedAt FROM projects WHERE deletedAt IS NULL ORDER BY updatedAt DESC LIMIT 10").all(),
    favorites: db.prepare(`SELECT p.id, p.name FROM favorites f JOIN projects p ON p.id = f.projectId WHERE f.userId = ? AND p.deletedAt IS NULL`).all(req.user.id),
    recentActivity: db.prepare("SELECT * FROM activity_log WHERE userId = ? ORDER BY id DESC LIMIT 15").all(req.user.id),
    unreadNotifications: db.prepare("SELECT COUNT(*) AS c FROM notifications WHERE userId = ? AND isRead = 0").get(req.user.id).c,
  });
});

// ── Activity / audit reports ────────────────────────────────────────────────

router.get("/activity", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 1000);
  const { action, userId } = req.query;
  const where = [];
  const params = [];
  if (action) { where.push("action = ?"); params.push(action); }
  if (userId) { where.push("userId = ?"); params.push(Number(userId)); }
  const sql = `SELECT * FROM activity_log ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT ?`;
  res.json(db.prepare(sql).all(...params, limit));
});

router.get("/activity/logins", (req, res) => {
  res.json(db.prepare("SELECT * FROM activity_log WHERE action IN ('login','logout','login_failed') ORDER BY id DESC LIMIT 200").all());
});

router.get("/activity/approvals", (req, res) => {
  res.json(db.prepare(`SELECT a.*, p.name AS projectName FROM approvals a JOIN projects p ON p.id = a.projectId ORDER BY a.id DESC LIMIT 200`).all());
});

// Full audit trail: action, entity, old/new value, user, date, IP and browser.
router.get("/audit", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 2000);
  const { entityType, entityId, category } = req.query;
  const where = [], params = [];
  if (entityType) { where.push("entityType = ?"); params.push(entityType); }
  if (entityId) { where.push("entityId = ?"); params.push(Number(entityId)); }
  if (category) { where.push("category = ?"); params.push(category); }
  const sql = `SELECT id, userId, userName, action, entityType, entityId, detail, oldValue, newValue, ipAddress, userAgent, category, createdAt
               FROM activity_log ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT ?`;
  res.json(db.prepare(sql).all(...params, limit));
});

// Security logs: authentication and permission events only.
router.get("/activity/security", (req, res) => {
  res.json(db.prepare("SELECT * FROM activity_log WHERE category = 'security' ORDER BY id DESC LIMIT 200").all());
});

// System logs: non-security activity (creates/updates/deletes/workflow).
router.get("/activity/system", (req, res) => {
  res.json(db.prepare("SELECT * FROM activity_log WHERE category != 'security' ORDER BY id DESC LIMIT 200").all());
});

export default router;
