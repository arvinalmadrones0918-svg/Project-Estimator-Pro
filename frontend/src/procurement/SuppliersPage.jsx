import { useEffect, useState } from "react";
import { api } from "../api";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import ErrorBanner from "../components/ErrorBanner";
import Spinner from "../components/Spinner";

const FIELDS = [
  { key: "code", label: "Supplier Code" },
  { key: "companyName", label: "Company Name", required: true },
  { key: "tradeCategory", label: "Trade Category" },
  { key: "contactPerson", label: "Contact Person" },
  { key: "email", label: "Email", type: "email" },
  { key: "telephone", label: "Telephone" },
  { key: "mobile", label: "Mobile" },
  { key: "website", label: "Website" },
  { key: "address", label: "Address", span: true },
  { key: "tin", label: "TIN" },
  { key: "rating", label: "Rating (0-5)", type: "number" },
  { key: "remarks", label: "Remarks", span: true },
];

function SupplierForm({ supplier, onSave, onClose }) {
  const [form, setForm] = useState(() => ({
    code: "", companyName: "", tradeCategory: "", contactPerson: "", email: "",
    telephone: "", mobile: "", website: "", address: "", tin: "", rating: 0,
    remarks: "", vatRegistered: false, status: "active", ...supplier,
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set(key, value) { setForm((f) => ({ ...f, [key]: value })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.companyName.trim()) { setError("Company name is required"); return; }
    setSaving(true);
    try { await onSave(form); onClose(); }
    catch (err) { setError(err.message); setSaving(false); }
  }

  return (
    <Modal title={supplier?.id ? "Edit Supplier" : "New Supplier"} onClose={onClose} width={640}>
      {error && <div className="error-banner" style={{ marginBottom: "0.75rem" }}>{error}</div>}
      <form onSubmit={handleSubmit} className="catalog-form-grid">
        {FIELDS.map((f) => (
          <label key={f.key} className={f.span ? "span-2" : ""}>
            {f.label}
            <input
              type={f.type || "text"}
              step={f.type === "number" ? "0.1" : undefined}
              value={form[f.key] ?? ""}
              onChange={(e) => set(f.key, e.target.value)}
              autoFocus={f.key === "companyName"}
            />
          </label>
        ))}
        <label className="checkbox-label">
          <input type="checkbox" checked={!!form.vatRegistered} onChange={(e) => set("vatRegistered", e.target.checked)} />
          VAT Registered
        </label>
        <label>
          Status
          <select value={form.status} onChange={(e) => set("status", e.target.value)}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <div className="modal-actions span-2">
          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? "Saving…" : supplier?.id ? "Save Changes" : "Create Supplier"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function SuppliersPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [categories, setCategories] = useState([]);
  const [formItem, setFormItem] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  function load() {
    setLoading(true);
    api.suppliers.list({ q, tradeCategory: categoryFilter })
      .then((data) => setItems(Array.isArray(data) ? data : data.items))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [q, categoryFilter]);

  useEffect(() => { api.suppliers.filters().then((f) => setCategories(f.tradeCategories)).catch(() => {}); }, [items]);

  async function handleSave(data) {
    if (formItem?.id) await api.suppliers.update(formItem.id, data);
    else await api.suppliers.create(data);
    load();
  }

  async function handleToggleStatus(s) {
    try {
      await (s.status === "active" ? api.suppliers.deactivate(s.id) : api.suppliers.activate(s.id));
      load();
    } catch (e) { setError(e.message); }
  }

  async function handleDelete(s) {
    try { await api.suppliers.remove(s.id); setConfirmDelete(null); load(); }
    catch (e) { setError(e.message); }
  }

  async function handleDuplicate(s) {
    try { await api.suppliers.duplicate(s.id); load(); }
    catch (e) { setError(e.message); }
  }

  return (
    <div className="catalog-page">
      <ErrorBanner message={error} onDismiss={() => setError("")} />
      <div className="catalog-toolbar">
        <h2 className="catalog-title">Supplier Management</h2>
        <div className="catalog-toolbar-actions">
          <button className="primary-button" onClick={() => { setFormItem({}); setShowForm(true); }}>+ New Supplier</button>
        </div>
      </div>

      <div className="catalog-filters">
        <input className="catalog-search" placeholder="Search suppliers…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">All Trade Categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="catalog-stats"><span>{items.length} supplier{items.length !== 1 ? "s" : ""}</span></div>

      <div className="catalog-grid-wrap">
        {loading ? <Spinner label="Loading suppliers…" /> : items.length === 0 ? (
          <p className="empty-state">No suppliers found.</p>
        ) : (
          <table className="catalog-grid">
            <thead>
              <tr>
                <th>Code</th><th>Company</th><th>Trade</th><th>Contact</th>
                <th>Email</th><th>Phone</th><th>VAT</th><th>Rating</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id} className={s.status !== "active" ? "row-inactive" : ""}>
                  <td>{s.code || "—"}</td>
                  <td>
                    <button className="link-button" onClick={() => { setFormItem(s); setShowForm(true); }}>{s.companyName}</button>
                  </td>
                  <td>{s.tradeCategory || "—"}</td>
                  <td>{s.contactPerson || "—"}</td>
                  <td>{s.email || "—"}</td>
                  <td>{s.telephone || s.mobile || "—"}</td>
                  <td>{s.vatRegistered ? "✓" : "—"}</td>
                  <td>{s.rating ? `★ ${s.rating}` : "—"}</td>
                  <td>
                    <span className={`status-badge ${s.status === "active" ? "status-active" : "status-archived"}`}>
                      {s.status === "active" ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="catalog-row-actions">
                    <button className="link-button" onClick={() => { setFormItem(s); setShowForm(true); }}>Edit</button>
                    <button className="link-button" onClick={() => handleDuplicate(s)}>Dup</button>
                    <button className="link-button" onClick={() => handleToggleStatus(s)}>{s.status === "active" ? "Deactivate" : "Activate"}</button>
                    <button className="link-button danger" onClick={() => setConfirmDelete(s)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && <SupplierForm supplier={formItem} onSave={handleSave} onClose={() => setShowForm(false)} />}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete Supplier"
          message={`Delete "${confirmDelete.companyName}"? It will be hidden but quotations referencing it are kept.`}
          confirmLabel="Delete" danger
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => handleDelete(confirmDelete)}
        />
      )}
    </div>
  );
}
