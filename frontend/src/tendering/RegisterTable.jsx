import { useEffect, useState } from "react";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import { money } from "../utils";

// Generic register CRUD table driven by a field config. Reused by every
// Phase 9 register (clients, tenders, drawings, specs, addenda, RFIs) so the
// list/search/create/edit/delete logic isn't reimplemented six times.
//
//   api      - register API client ({ list, create, update, remove })
//   title    - heading
//   fields   - [{ key, label, type?, money?, options?, hideInTable?, span? }]
//   columns  - field keys to show as table columns
//   requireReason - if true, edits prompt for a change reason (change log)
export default function RegisterTable({ api, title, fields, columns, requireReason, setError }) {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null); // {} new | {id,...} edit
  const [confirmDelete, setConfirmDelete] = useState(null);

  function load() {
    api.list({ q }).then(setItems).catch((e) => setError(e.message));
  }
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [q]);

  async function handleSave(form) {
    try {
      // Drop empty-string fields so optional FK/numeric columns stay NULL or
      // fall back to their DB default instead of being coerced to 0.
      const payload = {};
      for (const [k, v] of Object.entries(form)) {
        if (v !== "" && v !== undefined) payload[k] = v;
      }
      if (requireReason && form.id) {
        const reason = window.prompt("Reason for change (recorded in change log):") ?? "";
        payload._reason = reason;
      }
      if (form.id) await api.update(form.id, payload);
      else await api.create(payload);
      setEditing(null);
      load();
    } catch (e) { setError(e.message); }
  }

  async function handleDelete(item) {
    try { await api.remove(item.id); setConfirmDelete(null); load(); }
    catch (e) { setError(e.message); }
  }

  const colDefs = columns.map((c) => fields.find((f) => f.key === c)).filter(Boolean);

  return (
    <div className="register-table">
      <div className="register-toolbar">
        <input className="catalog-search" placeholder={`Search ${title.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="primary-button" onClick={() => setEditing({})}>+ New</button>
      </div>

      {items.length === 0 ? (
        <p className="empty-state-small">No records yet.</p>
      ) : (
        <table className="catalog-grid">
          <thead>
            <tr>{colDefs.map((c) => <th key={c.key}>{c.label}</th>)}<th>Actions</th></tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                {colDefs.map((c) => (
                  <td key={c.key}>
                    {c.money ? money(item[c.key]) : (item[c.key] ?? "—") === "" ? "—" : (item[c.key] ?? "—")}
                  </td>
                ))}
                <td className="catalog-row-actions">
                  <button className="link-button" onClick={() => setEditing(item)}>Edit</button>
                  <button className="link-button danger" onClick={() => setConfirmDelete(item)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && <RegisterForm title={title} fields={fields} item={editing} onSave={handleSave} onClose={() => setEditing(null)} />}
      {confirmDelete && (
        <ConfirmDialog title={`Delete ${title}`} message="Delete this record? It will be hidden." confirmLabel="Delete" danger
          onCancel={() => setConfirmDelete(null)} onConfirm={() => handleDelete(confirmDelete)} />
      )}
    </div>
  );
}

function RegisterForm({ title, fields, item, onSave, onClose }) {
  const [form, setForm] = useState(() => {
    const base = {};
    fields.forEach((f) => { base[f.key] = item[f.key] ?? ""; });
    return { ...base, id: item.id };
  });
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    await onSave(form);
    setSaving(false);
  }

  return (
    <Modal title={item.id ? `Edit ${title}` : `New ${title}`} onClose={onClose} width={640}>
      <form className="catalog-form-grid" onSubmit={submit}>
        {fields.map((f) => (
          <label key={f.key} className={f.span ? "span-2" : ""}>
            {f.label}
            {f.type === "textarea" ? (
              <textarea value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} rows={2} />
            ) : f.options ? (
              <select value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input type={f.type || "text"} value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
            )}
          </label>
        ))}
        <div className="modal-actions span-2">
          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving…" : item.id ? "Save Changes" : "Create"}</button>
        </div>
      </form>
    </Modal>
  );
}
