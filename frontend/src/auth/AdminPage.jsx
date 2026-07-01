import { useEffect, useState } from "react";
import { api } from "../api";
import Modal from "../components/Modal";
import ErrorBanner from "../components/ErrorBanner";
import OrganizationPanel from "./OrganizationPanel";
import { SettingsTab, BackupTab, DataTab, ApiDocsTab } from "./SystemPanel";

const TABS = [
  { key: "users", label: "Users" },
  { key: "roles", label: "Roles & Permissions" },
  { key: "organization", label: "Organization" },
  { key: "settings", label: "Settings" },
  { key: "backup", label: "Backup" },
  { key: "data", label: "Import / Export" },
  { key: "apidocs", label: "API Docs" },
  { key: "audit", label: "Audit Trail" },
  { key: "security", label: "Security Logs" },
  { key: "system", label: "System Logs" },
  { key: "logins", label: "Login History" },
  { key: "approvals", label: "Approval History" },
];

const MODULES = ["Projects", "Catalogs", "UPA", "Assemblies", "GeneralRequirements", "Procurement", "Tender", "Reports", "Administration", "Import", "Export"];
const ACTIONS = ["view", "edit", "delete", "approve"];

export default function AdminPage() {
  const [tab, setTab] = useState("users");
  const [error, setError] = useState("");
  return (
    <div className="admin-page">
      <ErrorBanner message={error} onDismiss={() => setError("")} />
      <div className="catalog-toolbar"><h2 className="catalog-title">Administration</h2></div>
      <nav className="proc-tabs">{TABS.map((t) => <button key={t.key} className={tab === t.key ? "active" : ""} onClick={() => setTab(t.key)}>{t.label}</button>)}</nav>
      {tab === "users" && <UsersTab setError={setError} />}
      {tab === "roles" && <RolesTab setError={setError} />}
      {tab === "organization" && <OrganizationPanel setError={setError} />}
      {tab === "settings" && <SettingsTab setError={setError} />}
      {tab === "backup" && <BackupTab setError={setError} />}
      {tab === "data" && <DataTab setError={setError} />}
      {tab === "apidocs" && <ApiDocsTab />}
      {tab === "audit" && <LogTab loader={() => api.enterprise.audit({ limit: 200 })} columns={["createdAt", "userName", "action", "entityType", "oldValue", "newValue", "ipAddress", "userAgent"]} setError={setError} />}
      {tab === "security" && <LogTab loader={() => api.enterprise.securityLogs()} columns={["createdAt", "userName", "action", "ipAddress", "userAgent"]} setError={setError} />}
      {tab === "system" && <LogTab loader={() => api.enterprise.systemLogs()} columns={["createdAt", "userName", "action", "entityType", "entityId", "detail"]} setError={setError} />}
      {tab === "logins" && <LogTab loader={() => api.enterprise.loginHistory()} columns={["createdAt", "userName", "action", "ipAddress", "detail"]} setError={setError} />}
      {tab === "approvals" && <LogTab loader={() => api.enterprise.approvalHistory()} columns={["createdAt", "projectName", "level", "status", "approverName", "comment"]} setError={setError} />}
    </div>
  );
}

function UsersTab({ setError }) {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [editing, setEditing] = useState(null);

  function load() { api.users.list().then(setUsers).catch((e) => setError(e.message)); }
  useEffect(() => { load(); api.users.roles().then(setRoles).catch(() => {}); }, []);

  async function save(form) {
    try {
      if (form.id) await api.users.update(form.id, form);
      else await api.users.create(form);
      setEditing(null); load();
    } catch (e) { setError(e.message); }
  }

  return (
    <div>
      <div className="register-toolbar"><button className="primary-button" onClick={() => setEditing({})}>+ New User</button></div>
      <table className="catalog-grid">
        <thead><tr><th>Username</th><th>Name</th><th>Email</th><th>Role</th><th>Department</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className={u.status !== "active" ? "row-inactive" : ""}>
              <td>{u.username}</td><td>{u.name}</td><td>{u.email}</td><td>{u.role}</td><td>{u.department || "—"}</td>
              <td><span className={`status-badge ${u.status === "active" ? "status-active" : "status-archived"}`}>{u.status}</span></td>
              <td className="catalog-row-actions"><button className="link-button" onClick={() => setEditing(u)}>Edit</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && <UserForm user={editing} roles={roles} onSave={save} onClose={() => setEditing(null)} />}
    </div>
  );
}

const USER_FIELDS = [
  { key: "employeeId", label: "Employee ID" }, { key: "username", label: "Username" },
  { key: "firstName", label: "First Name" }, { key: "lastName", label: "Last Name" },
  { key: "position", label: "Position" }, { key: "designation", label: "Designation" },
  { key: "department", label: "Department" }, { key: "company", label: "Company" },
  { key: "office", label: "Office" }, { key: "email", label: "Email", type: "email" },
  { key: "mobile", label: "Mobile" },
];

function UserForm({ user, roles, onSave, onClose }) {
  const [form, setForm] = useState(() => { const b = { status: "active", role: "Viewer" }; USER_FIELDS.forEach((f) => b[f.key] = user[f.key] ?? ""); return { ...b, ...user }; });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Modal title={user.id ? "Edit User" : "New User"} onClose={onClose} width={620}>
      <form className="catalog-form-grid" onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
        {USER_FIELDS.map((f) => (
          <label key={f.key}>{f.label}<input type={f.type || "text"} value={form[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} /></label>
        ))}
        <label>Role
          <select value={form.role} onChange={(e) => set("role", e.target.value)}>
            {roles.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
          </select>
        </label>
        <label>Status
          <select value={form.status} onChange={(e) => set("status", e.target.value)}>
            <option value="active">Active</option><option value="inactive">Inactive</option>
          </select>
        </label>
        <label className="span-2">{user.id ? "New Password (optional)" : "Password"}<input type="password" value={form.password ?? ""} onChange={(e) => set("password", e.target.value)} /></label>
        <div className="modal-actions span-2">
          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-button">{user.id ? "Save" : "Create"}</button>
        </div>
      </form>
    </Modal>
  );
}

function RolesTab({ setError }) {
  const [roles, setRoles] = useState([]);
  const [editing, setEditing] = useState(null);
  function load() { api.users.roles().then(setRoles).catch((e) => setError(e.message)); }
  useEffect(load, []);

  async function savePerms(role, perms) {
    try { await api.users.updateRole(role.id, { name: role.name, permissions: perms }); load(); }
    catch (e) { setError(e.message); }
  }

  return (
    <div>
      <table className="catalog-grid">
        <thead><tr><th>Role</th><th>Built-in</th><th>Modules with Access</th><th></th></tr></thead>
        <tbody>
          {roles.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td><td>{r.isBuiltIn ? "✓" : ""}</td>
              <td>{Object.entries(r.permissions).filter(([, a]) => a.length).map(([m]) => m).join(", ") || "—"}</td>
              <td><button className="link-button" onClick={() => setEditing(r)}>Edit Permissions</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && (
        <Modal title={`Permissions — ${editing.name}`} onClose={() => setEditing(null)} width={640}>
          <table className="perm-table">
            <thead><tr><th>Module</th>{ACTIONS.map((a) => <th key={a}>{a}</th>)}</tr></thead>
            <tbody>
              {MODULES.map((m) => (
                <tr key={m}>
                  <td>{m}</td>
                  {ACTIONS.map((a) => (
                    <td key={a}>
                      <input type="checkbox"
                        checked={(editing.permissions[m] || []).includes(a)}
                        onChange={(e) => {
                          const cur = new Set(editing.permissions[m] || []);
                          e.target.checked ? cur.add(a) : cur.delete(a);
                          setEditing({ ...editing, permissions: { ...editing.permissions, [m]: [...cur] } });
                        }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="modal-actions">
            <button className="secondary-button" onClick={() => setEditing(null)}>Cancel</button>
            <button className="primary-button" onClick={() => { savePerms(editing, editing.permissions); setEditing(null); }}>Save Permissions</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function LogTab({ loader, columns, setError }) {
  const [rows, setRows] = useState([]);
  useEffect(() => { loader().then(setRows).catch((e) => setError(e.message)); }, []);
  return (
    <table className="catalog-grid">
      <thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
      <tbody>
        {rows.length === 0 ? <tr><td colSpan={columns.length} className="empty-state-small">No records.</td></tr> :
          rows.map((r, i) => <tr key={i}>{columns.map((c) => <td key={c}>{c === "createdAt" || c === "actedAt" ? new Date((r[c] || "") + "Z").toLocaleString() : (r[c] ?? "—")}</td>)}</tr>)}
      </tbody>
    </table>
  );
}
