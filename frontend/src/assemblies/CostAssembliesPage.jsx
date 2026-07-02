import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { api } from "../api";
import { money } from "../utils";
import Spinner from "../components/Spinner";
import ErrorBanner from "../components/ErrorBanner";

// Cost Assemblies — reusable groups of Materials / Labor / Equipment /
// Subcontract / Other Costs that can be inserted into any project. Enterprise
// dark theme, consistent with the rest of the app.

export const ASSEMBLY_CATEGORIES = [
  "Concrete", "Masonry", "Structural Steel", "HVAC", "Fire Protection",
  "Electrical", "Plumbing", "Painting", "Civil Works", "Architectural", "General Requirements",
];

const SECTIONS = [
  { type: "material", kind: "materials", label: "Materials", catalog: "materials", idField: "materialId", nameField: "materialName" },
  { type: "labor", kind: "labor", label: "Labor", catalog: "labor", idField: "specializationId", nameField: "specializationName" },
  { type: "equipment", kind: "equipment", label: "Equipment", catalog: "equipment", idField: "equipmentId", nameField: "equipmentName" },
  { type: "subcontract", kind: "subcontract", label: "Subcontract", freeform: true },
  { type: "other", kind: "other-costs", label: "Other Costs", freeform: true },
];

export default function CostAssembliesPage() {
  const [view, setView] = useState("library");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);

  return (
    <div className="assemblies-page">
      <div className="catalog-toolbar"><h2 className="catalog-title">Cost Assemblies</h2></div>
      <ErrorBanner message={error} onDismiss={() => setError("")} />
      <div className="proc-tabs">
        <button className={`proc-tab ${view === "library" ? "active" : ""}`} onClick={() => setView("library")}>Assembly Library</button>
        <button className={`proc-tab ${view === "dashboard" ? "active" : ""}`} onClick={() => setView("dashboard")}>Dashboard</button>
      </div>
      {view === "library"
        ? <Library setError={setError} onEdit={setEditingId} />
        : <Dashboard setError={setError} onEdit={setEditingId} />}
      {editingId != null && (
        <AssemblyEditor assemblyId={editingId} onClose={() => setEditingId(null)} setError={setError} />
      )}
    </div>
  );
}

// ── Library ──────────────────────────────────────────────────────────────────
function Library({ setError, onEdit }) {
  const [rows, setRows] = useState(null);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const fileRef = useRef(null);

  function load() {
    api.assemblies.list({ includeInactive: showArchived ? "true" : undefined })
      .then(setRows).catch((e) => setError(e.message));
  }
  useEffect(load, [showArchived]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((a) =>
      [a.name, a.code, a.category, a.description].some((v) => (v || "").toLowerCase().includes(q)));
  }, [rows, search]);

  async function newAssembly() {
    const name = window.prompt("New assembly name:");
    if (!name) return;
    try { const a = await api.assemblies.create({ name, unit: "unit", category: "Concrete" }); load(); onEdit(a.id); }
    catch (e) { setError(e.message); }
  }
  async function duplicate(a) { try { await api.assemblies.duplicate(a.id); load(); } catch (e) { setError(e.message); } }
  async function archive(a) { try { a.isActive ? await api.assemblies.archive(a.id) : await api.assemblies.restore(a.id); load(); } catch (e) { setError(e.message); } }
  async function remove(a) { if (!window.confirm(`Delete assembly "${a.name}"? It will be archived if in use.`)) return; try { await api.assemblies.remove(a.id); load(); } catch (e) { setError(e.message); } }

  function exportFile(kind) {
    const data = filtered.map((a) => ({
      Code: a.code || "", Name: a.name, Category: a.category || "", Unit: a.unit,
      Description: a.description || "", "Total Unit Cost": a.totalCost ?? 0, Status: a.isActive ? "Active" : "Archived",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Assemblies");
    XLSX.writeFile(wb, `cost-assemblies.${kind}`);
  }
  async function importFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const rowsIn = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      let created = 0;
      for (const r of rowsIn) {
        const name = r.Name || r.name; if (!name) continue;
        await api.assemblies.create({
          name, code: r.Code || r.code || null, category: r.Category || r.category || null,
          unit: r.Unit || r.unit || "unit", description: r.Description || r.description || null,
        });
        created += 1;
      }
      window.alert(`Imported ${created} assemblies.`);
      load();
    } catch (err) { setError(`Import failed: ${err.message}`); }
    e.target.value = "";
  }

  if (!rows) return <Spinner label="Loading assemblies…" />;
  return (
    <div>
      <div className="asm-toolbar">
        <input className="asm-search" placeholder="Search name, code, category, description…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="primary-button" onClick={newAssembly}>+ New Assembly</button>
        <button className="secondary-button" onClick={() => exportFile("xlsx")}>Export Excel</button>
        <button className="secondary-button" onClick={() => exportFile("csv")}>Export CSV</button>
        <label className="secondary-button asm-import">Import<input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={importFile} /></label>
        <label className="checkbox-label"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived</label>
      </div>
      <table className="proc-table">
        <thead><tr><th>Code</th><th>Name</th><th>Category</th><th>Unit</th><th>Description</th><th>Total Unit Cost</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {filtered.map((a) => (
            <tr key={a.id} className={a.isActive ? "" : "asm-archived"}>
              <td>{a.code || "—"}</td>
              <td><button className="link-button" onClick={() => onEdit(a.id)}>{a.isFavorite ? "★ " : ""}{a.name}</button></td>
              <td>{a.category || "—"}</td><td>{a.unit}</td>
              <td className="asm-desc">{a.description || "—"}</td>
              <td>{money(a.totalCost)}</td>
              <td><span className={`proc-pill ${a.isActive ? "proc-approved" : "proc-cancelled"}`}>{a.isActive ? "Active" : "Archived"}</span></td>
              <td className="asm-actions">
                <button className="link-button" onClick={() => onEdit(a.id)}>Edit</button>
                <button className="link-button" onClick={() => duplicate(a)}>Duplicate</button>
                <button className="link-button" onClick={() => archive(a)}>{a.isActive ? "Archive" : "Restore"}</button>
                <button className="link-button danger" onClick={() => remove(a)}>Delete</button>
              </td>
            </tr>
          ))}
          {filtered.length === 0 && <tr><td colSpan={8} className="empty-state">No assemblies. Create one to get started.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// ── Assembly Editor ──────────────────────────────────────────────────────────
function AssemblyEditor({ assemblyId, onClose, setError }) {
  const [assembly, setAssembly] = useState(null);
  const [catalogs, setCatalogs] = useState({ materials: [], labor: [], equipment: [] });

  function load() { api.assemblies.get(assemblyId).then(setAssembly).catch((e) => setError(e.message)); }
  useEffect(load, [assemblyId]);
  useEffect(() => {
    Promise.all([api.materials.list(), api.laborSpecializations.list(), api.equipment.list()])
      .then(([materials, labor, equipment]) => setCatalogs({ materials, labor, equipment })).catch(() => {});
  }, []);

  async function saveHeader(patch) {
    try { const updated = await api.assemblies.update(assemblyId, { ...assembly, ...patch }); setAssembly((a) => ({ ...a, ...updated })); }
    catch (e) { setError(e.message); }
  }
  async function addItem(section, payload) { try { await api.assemblies.addItem(assemblyId, section.kind, payload); load(); } catch (e) { setError(e.message); } }
  async function updateItem(itemId, patch) { try { await api.assemblies.updateItem(assemblyId, itemId, patch); load(); } catch (e) { setError(e.message); } }
  async function removeItem(itemId) { try { await api.assemblies.removeItem(assemblyId, itemId); load(); } catch (e) { setError(e.message); } }

  if (!assembly) return (
    <div className="modal-overlay" onClick={onClose}><div className="modal asm-editor" onClick={(e) => e.stopPropagation()}><Spinner label="Loading assembly…" /></div></div>
  );

  const b = assembly.breakdown || {};
  const itemsByType = (t) => (assembly.items || []).filter((it) => it.itemType === t);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal asm-editor" onClick={(e) => e.stopPropagation()}>
        <div className="asm-editor-head">
          <h3>Assembly Editor</h3>
          <button className="link-button" onClick={onClose}>✕ Close</button>
        </div>

        <div className="asm-header-grid">
          <label>Code<input defaultValue={assembly.code || ""} onBlur={(e) => saveHeader({ code: e.target.value })} /></label>
          <label>Name<input defaultValue={assembly.name} onBlur={(e) => saveHeader({ name: e.target.value })} /></label>
          <label>Category
            <select value={assembly.category || ""} onChange={(e) => saveHeader({ category: e.target.value })}>
              <option value="">—</option>
              {ASSEMBLY_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label>Unit<input defaultValue={assembly.unit} onBlur={(e) => saveHeader({ unit: e.target.value })} /></label>
          <label className="asm-desc-field">Description<input defaultValue={assembly.description || ""} onBlur={(e) => saveHeader({ description: e.target.value })} /></label>
        </div>

        {SECTIONS.map((section) => (
          <Section key={section.type} section={section} items={itemsByType(section.type)}
            catalogs={catalogs} onAdd={addItem} onUpdate={updateItem} onRemove={removeItem} />
        ))}

        <div className="asm-totals">
          <div><span>Material</span><strong>{money(b.material)}</strong></div>
          <div><span>Labor</span><strong>{money(b.labor)}</strong></div>
          <div><span>Equipment</span><strong>{money(b.equipment)}</strong></div>
          <div><span>Subcontract</span><strong>{money(b.subcontract)}</strong></div>
          <div><span>Other</span><strong>{money(b.other)}</strong></div>
          <div className="asm-total-direct"><span>Direct Cost</span><strong>{money((b.material||0)+(b.labor||0)+(b.equipment||0)+(b.subcontract||0)+(b.other||0))}</strong></div>
          <div className="asm-total-grand"><span>Grand Total</span><strong>{money(assembly.totalCost)}</strong></div>
        </div>
      </div>
    </div>
  );
}

function Section({ section, items, catalogs, onAdd, onUpdate, onRemove }) {
  const [sel, setSel] = useState("");
  const [qty, setQty] = useState("1");
  const [desc, setDesc] = useState("");
  const [cost, setCost] = useState("");
  const options = section.freeform ? [] : (catalogs[section.catalog] || []);

  function add() {
    if (section.freeform) {
      if (!desc || cost === "") return;
      onAdd(section, { description: desc, cost: Number(cost) });
      setDesc(""); setCost("");
    } else {
      if (!sel) return;
      onAdd(section, { [section.idField]: Number(sel), quantity: Number(qty) || 1 });
      setSel(""); setQty("1");
    }
  }

  return (
    <div className="asm-section">
      <h4>{section.label}</h4>
      <table className="proc-table asm-items">
        <thead><tr><th>Item</th><th>Qty</th><th>Unit Cost</th><th>Total</th><th></th></tr></thead>
        <tbody>
          {items.map((it) => {
            const unitCost = section.type === "labor" ? it.hourlyRateAtEntry : (section.freeform ? it.cost : it.unitPriceAtEntry);
            const name = section.freeform ? it.description : (it[section.nameField] || "—");
            return (
              <tr key={it.id}>
                <td>{name}</td>
                <td>{section.freeform ? "—" : (
                  <input className="asm-qty" type="number" defaultValue={it.quantity}
                    onBlur={(e) => onUpdate(it.id, { quantity: Number(e.target.value) })} />
                )}</td>
                <td>{section.freeform ? (
                  <input className="asm-qty" type="number" defaultValue={it.cost}
                    onBlur={(e) => onUpdate(it.id, { cost: Number(e.target.value) })} />
                ) : money(unitCost)}</td>
                <td>{money(it.cost)}</td>
                <td><button className="link-button danger" onClick={() => onRemove(it.id)}>Remove</button></td>
              </tr>
            );
          })}
          {items.length === 0 && <tr><td colSpan={5} className="empty-state">No {section.label.toLowerCase()}.</td></tr>}
        </tbody>
      </table>
      <div className="asm-add-row">
        {section.freeform ? (
          <>
            <input placeholder="Description" value={desc} onChange={(e) => setDesc(e.target.value)} />
            <input type="number" placeholder="Cost" value={cost} onChange={(e) => setCost(e.target.value)} />
          </>
        ) : (
          <>
            <select value={sel} onChange={(e) => setSel(e.target.value)}>
              <option value="">Select {section.label.toLowerCase()}…</option>
              {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <input className="asm-qty" type="number" placeholder="Qty" value={qty} onChange={(e) => setQty(e.target.value)} />
          </>
        )}
        <button className="secondary-button" onClick={add}>+ Add</button>
      </div>
    </div>
  );
}

// ── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ setError, onEdit }) {
  const [stats, setStats] = useState(null);
  useEffect(() => { api.assemblies.stats().then(setStats).catch((e) => setError(e.message)); }, []);
  if (!stats) return <Spinner label="Loading dashboard…" />;
  const List = ({ title, rows, empty }) => (
    <div className="asm-dash-card">
      <h4>{title}</h4>
      {rows.length === 0 ? <p className="empty-state">{empty}</p> : (
        <ul className="asm-dash-list">
          {rows.map((r) => (
            <li key={r.id}><button className="link-button" onClick={() => onEdit(r.id)}>{r.name}</button>
              {r.uses != null && <span className="asm-uses">{r.uses} uses</span>}
              {r.category && r.uses == null && <span className="asm-cat">{r.category}</span>}</li>
          ))}
        </ul>
      )}
    </div>
  );
  return (
    <div>
      <div className="proc-cards">
        <div className="proc-card"><div className="proc-card-value">{stats.total}</div><div className="proc-card-label">Total Assemblies</div></div>
        <div className="proc-card"><div className="proc-card-value">{stats.archived}</div><div className="proc-card-label">Archived</div></div>
        <div className="proc-card"><div className="proc-card-value">{stats.favorites.length}</div><div className="proc-card-label">Favorites</div></div>
        <div className="proc-card"><div className="proc-card-value">{stats.byCategory.length}</div><div className="proc-card-label">Categories</div></div>
      </div>
      <div className="asm-dash-grid">
        <List title="Most Used" rows={stats.mostUsed} empty="Not yet used in projects." />
        <List title="Recently Modified" rows={stats.recent} empty="No assemblies." />
        <List title="Favorite Assemblies" rows={stats.favorites} empty="No favorites yet." />
      </div>
    </div>
  );
}
