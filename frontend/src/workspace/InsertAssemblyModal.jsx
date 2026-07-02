import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { money } from "../utils";

// Insert a Cost Assembly into the current work item (WBS node).
// Workflow: select assembly → enter quantity → choose Copy or Link → insert.
//   Copy — items are copied into this module (independent of the master).
//   Link — references the master (auto-updates when the master changes).
export default function InsertAssemblyModal({ onInsert, onClose }) {
  const [assemblies, setAssemblies] = useState(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [quantity, setQuantity] = useState("1");
  const [mode, setMode] = useState("copy");
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.assemblies.list().then(setAssemblies).catch(() => setAssemblies([])); }, []);

  const filtered = useMemo(() => {
    if (!assemblies) return [];
    const q = search.trim().toLowerCase();
    if (!q) return assemblies;
    return assemblies.filter((a) => [a.name, a.code, a.category].some((v) => (v || "").toLowerCase().includes(q)));
  }, [assemblies, search]);

  async function insert() {
    if (!selectedId) return;
    setBusy(true);
    try { await onInsert({ assemblyId: selectedId, quantity: Number(quantity) || 1, mode }); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal asm-insert-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Insert Assembly</h3>
        <input className="asm-search" placeholder="Search assemblies…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="asm-insert-list">
          {filtered.map((a) => (
            <label key={a.id} className={`asm-insert-row ${selectedId === a.id ? "selected" : ""}`}>
              <input type="radio" name="asm" checked={selectedId === a.id} onChange={() => setSelectedId(a.id)} />
              <span className="asm-insert-name">{a.name}</span>
              <span className="asm-insert-cat">{a.category || "—"}</span>
              <span className="asm-insert-cost">{money(a.totalCost)}/{a.unit}</span>
            </label>
          ))}
          {filtered.length === 0 && <p className="empty-state">No assemblies found.</p>}
        </div>
        <div className="asm-insert-controls">
          <label>Quantity<input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></label>
          <fieldset className="asm-mode">
            <label><input type="radio" name="mode" checked={mode === "copy"} onChange={() => setMode("copy")} /> Copy <em>(independent from master)</em></label>
            <label><input type="radio" name="mode" checked={mode === "link"} onChange={() => setMode("link")} /> Link <em>(updates if master changes)</em></label>
          </fieldset>
        </div>
        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>Cancel</button>
          <button className="primary-button" onClick={insert} disabled={!selectedId || busy}>{busy ? "Inserting…" : "Insert"}</button>
        </div>
      </div>
    </div>
  );
}
