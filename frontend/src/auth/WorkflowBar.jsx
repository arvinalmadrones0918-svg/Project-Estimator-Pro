import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "./AuthContext";

const STATUS_LABELS = {
  draft: "Draft", forReview: "For Review", returned: "Returned for Revision",
  resubmitted: "Resubmitted", approved: "Approved", issued: "Issued", archived: "Archived",
};

// Workflow + project-lock controls shown in the project workspace header.
// Acquires an edit lock on mount; shows who else holds it.
export default function WorkflowBar({ projectId, workflowStatus, onChanged }) {
  const { user, can, isAdmin } = useAuth();
  const [status, setStatus] = useState(workflowStatus || "draft");
  const [lock, setLock] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setStatus(workflowStatus || "draft"); }, [workflowStatus]);

  useEffect(() => {
    let alive = true;
    api.enterprise.acquireLock(projectId)
      .then((l) => alive && setLock(l))
      .catch(() => alive && setLock({ heldByOther: true, userName: "another user" }));
    return () => { alive = false; api.enterprise.releaseLock(projectId).catch(() => {}); };
  }, [projectId]);

  async function doTransition(transition, opts) {
    setBusy(true); setError("");
    try {
      const r = await api.enterprise.transition(projectId, transition, opts);
      setStatus(r.workflowStatus);
      onChanged?.(r.workflowStatus);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function forceUnlock() {
    try { await api.enterprise.forceUnlock(projectId); const l = await api.enterprise.acquireLock(projectId); setLock(l); }
    catch (e) { setError(e.message); }
  }

  const lockedByOther = lock && lock.userId && lock.userId !== user.id;

  const buttons = [];
  if (["draft", "returned"].includes(status) && can("Projects", "edit")) buttons.push(["submit", "Submit for Review", "primary-button"]);
  if (status === "forReview" && can("Projects", "approve")) { buttons.push(["approve", "Approve", "primary-button"]); buttons.push(["return", "Return", "secondary-button"]); }
  if (status === "approved") buttons.push(["issue", "Issue", "primary-button"]);
  if (["approved", "issued"].includes(status)) buttons.push(["archive", "Archive", "secondary-button"]);

  return (
    <div className="workflow-bar">
      <span className={`workflow-status ws-${status}`}>{STATUS_LABELS[status] || status}</span>
      {error && <span className="workflow-error">{error}</span>}
      {lockedByOther ? (
        <span className="workflow-lock">🔒 Editing locked by {lock.userName} {isAdmin && <button className="link-button" onClick={forceUnlock}>Force Unlock</button>}</span>
      ) : (
        <span className="workflow-lock ok">🔓 You hold the edit lock</span>
      )}
      <div className="workflow-actions">
        {buttons.map(([t, label, cls]) => (
          <button key={t} className={cls} disabled={busy} onClick={() => doTransition(t, t === "approve" ? { requiredLevels: 1 } : {})}>{label}</button>
        ))}
      </div>
    </div>
  );
}
