import { useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { api } from "../api";
import Modal from "../components/Modal";

// Header user menu: identity, change password, logout + a notifications bell.
export default function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const ref = useRef(null);

  function loadNotifs() { api.enterprise.notifications().then(setNotifs).catch(() => {}); }
  useEffect(() => { loadNotifs(); const t = setInterval(loadNotifs, 60_000); return () => clearInterval(t); }, []);
  useEffect(() => {
    function onClick(e) { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setShowNotifs(false); } }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  const unread = notifs.filter((n) => !n.isRead).length;

  async function markAll() { await api.enterprise.markAllRead(); loadNotifs(); }

  return (
    <div className="user-menu" ref={ref}>
      <button className="notif-bell" onClick={() => { setShowNotifs((v) => !v); setOpen(false); }} title="Notifications">
        🔔{unread > 0 && <span className="notif-badge">{unread}</span>}
      </button>
      {showNotifs && (
        <div className="notif-dropdown">
          <div className="notif-head"><strong>Notifications</strong>{unread > 0 && <button className="link-button" onClick={markAll}>Mark all read</button>}</div>
          {notifs.length === 0 ? <div className="notif-empty">No notifications.</div> : notifs.slice(0, 20).map((n) => (
            <div key={n.id} className={`notif-item ${n.isRead ? "" : "unread"}`} onClick={() => api.enterprise.markRead(n.id).then(loadNotifs)}>
              <div className="notif-msg">{n.message}</div>
              <div className="notif-time">{new Date(n.createdAt + "Z").toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}

      <button className="user-chip" onClick={() => { setOpen((v) => !v); setShowNotifs(false); }}>
        <span className="user-avatar">{(user.firstName || user.name || "?")[0]}</span>
        <span className="user-name">{user.name || user.username}</span>
        <span className="user-role">{user.role}</span>
      </button>
      {open && (
        <div className="user-dropdown">
          <div className="user-dropdown-head">
            <strong>{user.name}</strong>
            <span>{user.email}</span>
            <span className="user-role">{user.role}</span>
          </div>
          <button className="user-dropdown-item" onClick={() => { setShowPw(true); setOpen(false); }}>Change Password</button>
          <button className="user-dropdown-item danger" onClick={() => logout()}>Sign Out</button>
        </div>
      )}

      {showPw && <ChangePasswordModal onClose={() => setShowPw(false)} />}
    </div>
  );
}

function ChangePasswordModal({ onClose }) {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    setErr(""); setMsg("");
    try { await api.auth.changePassword({ currentPassword, newPassword }); setMsg("Password changed."); setCurrent(""); setNew(""); }
    catch (e2) { setErr(e2.message); }
  }
  return (
    <Modal title="Change Password" onClose={onClose} width={400}>
      {err && <div className="error-banner" style={{ marginBottom: "0.5rem" }}>{err}</div>}
      {msg && <div className="login-info">{msg}</div>}
      <form className="stacked-form" onSubmit={submit}>
        <label>Current Password<input type="password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} /></label>
        <label>New Password (min 6)<input type="password" value={newPassword} onChange={(e) => setNew(e.target.value)} /></label>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Close</button>
          <button type="submit" className="primary-button">Update</button>
        </div>
      </form>
    </Modal>
  );
}
