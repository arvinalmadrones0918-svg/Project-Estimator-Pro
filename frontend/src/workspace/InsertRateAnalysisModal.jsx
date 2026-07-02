import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { money } from "../utils";

// Insert a Rate Analysis (UPA) into the current work item (WBS node).
// Workflow: select rate analysis → enter quantity → choose Expand or Link → insert.
//   Expand — copies all materials/labor/equipment into this work item (editable).
//   Link   — keeps a live connection to the Rate Analysis (frozen unit rate at entry).
export default function InsertRateAnalysisModal({ onInsert, onClose }) {
  const [list, setList] = useState(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [quantity, setQuantity] = useState("1");
  const [mode, setMode] = useState("expand");
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.upa.list().then(setList).catch(() => setList([])); }, []);

  const filtered = useMemo(() => {
    if (!list) return [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((u) => [u.description, u.code, u.category, u.trade].some((v) => (v || "").toLowerCase().includes(q)));
  }, [list, search]);

  async function insert() {
    if (!selectedId) return;
    setBusy(true);
    try { await onInsert({ upaId: selectedId, quantity: Number(quantity) || 1, mode }); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal asm-insert-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Insert Rate Analysis</h3>
        <input className="asm-search" placeholder="Search rate analyses…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="asm-insert-list">
          {filtered.map((u) => (
            <label key={u.id} className={`asm-insert-row ${selectedId === u.id ? "selected" : ""}`}>
              <input type="radio" name="upa" checked={selectedId === u.id} onChange={() => setSelectedId(u.id)} />
              <span className="asm-insert-name">{u.code ? `${u.code} · ` : ""}{u.description}</span>
              <span className="asm-insert-cat">{u.category || "—"}</span>
              <span className="asm-insert-cost">{money(u.unitRate)}/{u.unit}</span>
            </label>
          ))}
          {filtered.length === 0 && <p className="empty-state">No rate analyses found.</p>}
        </div>
        <div className="asm-insert-controls">
          <label>Quantity<input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></label>
          <fieldset className="asm-mode">
            <label><input type="radio" name="upamode" checked={mode === "expand"} onChange={() => setMode("expand")} /> Expand <em>(copy items into estimate)</em></label>
            <label><input type="radio" name="upamode" checked={mode === "link"} onChange={() => setMode("link")} /> Link <em>(live connection, frozen rate)</em></label>
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
