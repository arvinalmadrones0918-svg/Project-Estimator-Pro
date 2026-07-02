import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { api } from "../api";
import { money } from "../utils";
import Spinner from "../components/Spinner";
import ErrorBanner from "../components/ErrorBanner";

// Master Materials Library — enterprise catalog over the shared materials table.
// Search / filter / import / export / CRUD across the full field set. Server-side
// filtering keeps it responsive at 10,000+ records.

const FIELDS = [
  ["code", "Material Code"], ["name", "Description"], ["category", "Category"],
  ["subcategory", "Subcategory"], ["manufacturer", "Manufacturer"], ["brand", "Brand"],
  ["model", "Model"], ["specification", "Specification"], ["standard", "Standard"],
  ["unit", "Unit"], ["unitPrice", "Unit Cost", "number"], ["currency", "Currency"],
  ["preferredSupplier", "Preferred Supplier"], ["leadTime", "Lead Time"],
  ["countryOfOrigin", "Country of Origin"], ["minOrderQty", "Minimum Order Qty", "number"],
  ["wasteFactor", "Waste Factor (%)", "number"], ["weight", "Weight", "number"],
  ["density", "Density", "number"], ["notes", "Notes"],
];
const PAGE = 200;

export default function MaterialLibraryPage() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ search: "", category: "", subcategory: "", supplier: "", unit: "", status: "active" });
  const [options, setOptions] = useState({ categories: [], subcategories: [], suppliers: [], units: [] });
  const [editing, setEditing] = useState(null); // material object or {} for new
  const [page, setPage] = useState(0);
  const fileRef = useRef(null);
  const debounce = useRef(null);

  function load() {
    setLoading(true);
    const params = { ...filters, meta: "true", limit: PAGE, offset: page * PAGE };
    api.materials.list(params)
      .then((r) => { setRows(r.items || []); setTotal(r.total || 0); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(() => { if (debounce.current) clearTimeout(debounce.current); debounce.current = setTimeout(load, 200); return () => clearTimeout(debounce.current); }, [filters, page]);
  useEffect(() => { api.materials.filters().then(setOptions).catch(() => {}); }, []);

  function setFilter(k, v) { setPage(0); setFilters((f) => ({ ...f, [k]: v })); }

  async function save(form) {
    try {
      if (form.id) await api.materials.update(form.id, form);
      else await api.materials.create(form);
      setEditing(null); load();
      api.materials.filters().then(setOptions).catch(() => {});
    } catch (e) { setError(e.message); }
  }
  async function remove(m) {
    if (!window.confirm(`Deactivate "${m.name}"?`)) return;
    try { await api.materials.remove(m.id); load(); } catch (e) { setError(e.message); }
  }

  function exportFile(kind) {
    const data = rows.map((m) => Object.fromEntries(FIELDS.map(([k, label]) => [label, m[k] ?? ""])));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Materials");
    XLSX.writeFile(wb, `master-materials.${kind}`);
  }
  async function importFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      const inRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      const labelToKey = Object.fromEntries(FIELDS.map(([k, label]) => [label.toLowerCase(), k]));
      let created = 0;
      for (const r of inRows) {
        const rec = {};
        for (const [label, val] of Object.entries(r)) {
          const key = labelToKey[String(label).toLowerCase()] || label;
          rec[key] = val;
        }
        if (!rec.name || !rec.category || !rec.unit || rec.unitPrice == null) continue;
        await api.materials.create(rec);
        created += 1;
      }
      window.alert(`Imported ${created} materials.`);
      load();
    } catch (err) { setError(`Import failed: ${err.message}`); }
    e.target.value = "";
  }

  const pages = Math.ceil(total / PAGE) || 1;

  return (
    <div className="matlib-page">
      <div className="catalog-toolbar"><h2 className="catalog-title">Master Materials Library</h2>
        <span className="matlib-count">{total.toLocaleString()} materials</span>
      </div>
      <ErrorBanner message={error} onDismiss={() => setError("")} />

      <div className="matlib-filters">
        <input className="matlib-search" placeholder="Search code, description, brand, category, manufacturer, spec…" value={filters.search} onChange={(e) => setFilter("search", e.target.value)} />
        <select value={filters.category} onChange={(e) => setFilter("category", e.target.value)}><option value="">All Categories</option>{options.categories.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <select value={filters.subcategory} onChange={(e) => setFilter("subcategory", e.target.value)}><option value="">All Subcategories</option>{options.subcategories.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <select value={filters.supplier} onChange={(e) => setFilter("supplier", e.target.value)}><option value="">All Suppliers</option>{options.suppliers.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <select value={filters.unit} onChange={(e) => setFilter("unit", e.target.value)}><option value="">All Units</option>{options.units.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <select value={filters.status} onChange={(e) => setFilter("status", e.target.value)}><option value="active">Active</option><option value="all">All</option><option value="inactive">Inactive</option></select>
      </div>
      <div className="matlib-actions">
        <button className="primary-button" onClick={() => setEditing({})}>+ New Material</button>
        <button className="secondary-button" onClick={() => exportFile("xlsx")}>Export Excel</button>
        <button className="secondary-button" onClick={() => exportFile("csv")}>Export CSV</button>
        <label className="secondary-button matlib-import">Import<input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={importFile} /></label>
      </div>

      {loading ? <Spinner label="Loading materials…" /> : (
        <div className="matlib-table-wrap">
          <table className="proc-table">
            <thead><tr><th>Code</th><th>Description</th><th>Category</th><th>Subcategory</th><th>Brand</th><th>Unit</th><th>Unit Cost</th><th>Supplier</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className={m.isActive ? "" : "asm-archived"}>
                  <td>{m.code || "—"}</td>
                  <td><button className="link-button" onClick={() => setEditing(m)}>{m.name}</button></td>
                  <td>{m.category}</td><td>{m.subcategory || "—"}</td><td>{m.brand || "—"}</td>
                  <td>{m.unit}</td><td>{money(m.unitPrice)}</td><td>{m.preferredSupplier || m.supplier || "—"}</td>
                  <td><span className={`proc-pill ${m.isActive ? "proc-approved" : "proc-cancelled"}`}>{m.isActive ? "Active" : "Inactive"}</span></td>
                  <td className="asm-actions">
                    <button className="link-button" onClick={() => setEditing(m)}>Edit</button>
                    <button className="link-button danger" onClick={() => remove(m)}>Deactivate</button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={10} className="empty-state">No materials match your filters.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="matlib-pager">
          <button className="secondary-button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← Prev</button>
          <span>Page {page + 1} of {pages}</span>
          <button className="secondary-button" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next →</button>
        </div>
      )}

      {editing && <MaterialForm material={editing} onSave={save} onClose={() => setEditing(null)} />}
    </div>
  );
}

function MaterialForm({ material, onSave, onClose }) {
  const [form, setForm] = useState(() => {
    const base = { unit: "", category: "", unitPrice: 0, currency: "USD", wasteFactor: 0 };
    FIELDS.forEach(([k]) => { base[k] = material[k] ?? base[k] ?? ""; });
    return { ...base, ...material };
  });
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal matlib-form" onClick={(e) => e.stopPropagation()}>
        <div className="asm-editor-head"><h3>{material.id ? "Edit Material" : "New Material"}</h3><button className="link-button" onClick={onClose}>✕ Close</button></div>
        <div className="matlib-form-grid">
          {FIELDS.map(([key, label, type]) => (
            <label key={key} className={key === "name" || key === "specification" || key === "notes" ? "span2" : ""}>
              {label}
              <input type={type === "number" ? "number" : "text"} value={form[key] ?? ""}
                onChange={(e) => setForm({ ...form, [key]: type === "number" ? e.target.value : e.target.value })} />
            </label>
          ))}
        </div>
        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>Cancel</button>
          <button className="primary-button" onClick={() => onSave(form)}>Save Material</button>
        </div>
      </div>
    </div>
  );
}
