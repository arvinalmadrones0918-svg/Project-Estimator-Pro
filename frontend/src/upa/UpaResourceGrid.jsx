import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { money } from "../utils";

const RESOURCE_TYPES = [
  { value: "material", label: "Material", catalog: "materials", idField: "materialId", costField: "unitPrice" },
  { value: "labor", label: "Labor", catalog: "laborSpecializations", idField: "specializationId", costField: "hourlyRate" },
  { value: "equipment", label: "Equipment", catalog: "equipment", idField: "equipmentId", costField: "unitPrice" },
  { value: "subcontract", label: "Subcontract", catalog: null },
  { value: "other", label: "Other Cost", catalog: null },
];

// Per-resource amount mirrors the engine: quantity * frozenCost * (1+waste%),
// times (1+idle%) for equipment. Display-only; the server is authoritative.
function resourceAmount(r) {
  const waste = 1 + (Number(r.wastePct) || 0) / 100;
  let amt = (Number(r.quantity) || 0) * (Number(r.frozenCost) || 0) * waste;
  if (r.resourceType === "equipment") amt *= 1 + (Number(r.idleFactor) || 0) / 100;
  return amt;
}

// Editable spreadsheet of UPA resources. Tab/Enter move between cells; rows can
// be dragged to reorder; resources are added by searching the existing catalogs
// (no catalog duplication).
export default function UpaResourceGrid({ upaId, resources, onChange, setError }) {
  const [catalogs, setCatalogs] = useState({ materials: [], laborSpecializations: [], equipment: [] });
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState("material");
  const [newRefId, setNewRefId] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [search, setSearch] = useState("");
  const dragId = useRef(null);

  useEffect(() => {
    Promise.all([api.materials.list(), api.laborSpecializations.list(), api.equipment.list()])
      .then(([materials, laborSpecializations, equipment]) => setCatalogs({ materials, laborSpecializations, equipment }))
      .catch(() => {});
  }, []);

  const typeDef = RESOURCE_TYPES.find((t) => t.value === newType);
  const catalogItems = typeDef?.catalog ? (catalogs[typeDef.catalog] ?? []) : [];
  const filtered = search
    ? catalogItems.filter((i) => `${i.code ?? ""} ${i.name}`.toLowerCase().includes(search.toLowerCase()))
    : catalogItems;

  async function handleAdd(e) {
    e.preventDefault();
    const payload = { resourceType: newType, quantity: 1 };
    if (typeDef.catalog) {
      if (!newRefId) { setError("Select a resource from the catalog."); return; }
      payload[typeDef.idField] = Number(newRefId);
    } else {
      payload.description = newDesc || "New cost";
      payload.frozenCost = 0;
    }
    try {
      await api.upa.addResource(upaId, payload);
      setAdding(false); setNewRefId(""); setNewDesc(""); setSearch("");
      onChange();
    } catch (err) { setError(err.message); }
  }

  async function patchResource(r, field, value) {
    const numeric = ["quantity", "wastePct", "crew", "outputPerDay", "outputPerHour", "laborHours", "manhours", "operatingHours", "idleFactor", "fuelConsumption", "operatorCost", "frozenCost"];
    const val = numeric.includes(field) ? Number(value) : value;
    if (r[field] === val) return;
    try { await api.upa.updateResource(upaId, r.id, { [field]: val }); onChange(); }
    catch (e) { setError(e.message); }
  }

  async function removeResource(r) {
    try { await api.upa.removeResource(upaId, r.id); onChange(); }
    catch (e) { setError(e.message); }
  }

  async function onDrop(target) {
    const srcId = dragId.current;
    dragId.current = null;
    if (!srcId || srcId === target.id) return;
    const ordered = [...resources];
    const from = ordered.findIndex((r) => r.id === srcId);
    const to = ordered.findIndex((r) => r.id === target.id);
    if (from === -1 || to === -1) return;
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    try { await api.upa.sortResources(upaId, ordered.map((r, i) => ({ id: r.id, sortOrder: i }))); onChange(); }
    catch (e) { setError(e.message); }
  }

  // Tab/Enter move focus to the next editable input.
  function onCellKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      const inputs = [...e.currentTarget.closest("tbody").querySelectorAll("input")];
      const idx = inputs.indexOf(e.currentTarget);
      if (idx >= 0 && idx + 1 < inputs.length) inputs[idx + 1].focus();
      e.currentTarget.blur();
    }
  }

  return (
    <div className="upa-resource-grid">
      <div className="upa-resource-head">
        <h4>Resource Breakdown</h4>
        <button className="primary-button" onClick={() => setAdding((v) => !v)}>＋ Add Resource</button>
      </div>

      {adding && (
        <form className="upa-add-resource" onSubmit={handleAdd}>
          <select value={newType} onChange={(e) => { setNewType(e.target.value); setNewRefId(""); }}>
            {RESOURCE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          {typeDef.catalog ? (
            <>
              <input placeholder="Search resources…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <select value={newRefId} onChange={(e) => setNewRefId(e.target.value)}>
                <option value="">Select…</option>
                {filtered.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.code ? `${i.code} — ` : ""}{i.name} ({money(i[typeDef.costField])})
                  </option>
                ))}
              </select>
            </>
          ) : (
            <input placeholder="Description" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
          )}
          <button type="submit" className="primary-button">Add</button>
          <button type="button" className="secondary-button" onClick={() => setAdding(false)}>Cancel</button>
        </form>
      )}

      <div className="upa-grid-scroll">
        <table className="upa-grid">
          <thead>
            <tr>
              <th></th>
              <th>Type</th>
              <th>Code</th>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit</th>
              <th>Waste %</th>
              <th>Crew</th>
              <th>Output/Day</th>
              <th>Idle %</th>
              <th>Frozen Cost</th>
              <th>Current</th>
              <th>Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {resources.length === 0 ? (
              <tr><td colSpan={14} className="empty-state-small">No resources. Add materials, labor, equipment, subcontract or other costs.</td></tr>
            ) : (
              resources.map((r) => {
                const drift = r.currentCost != null && r.currentCost !== r.frozenCost;
                return (
                  <tr
                    key={r.id}
                    draggable
                    onDragStart={() => { dragId.current = r.id; }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onDrop(r)}
                  >
                    <td className="drag-handle" title="Drag to reorder">⠿</td>
                    <td><span className={`res-type res-${r.resourceType}`}>{r.resourceType}</span></td>
                    <td>{r.materialId || r.specializationId || r.equipmentId ? "✓" : "—"}</td>
                    <td>
                      <input className="cell-input wide" defaultValue={r.description ?? ""} placeholder="Description"
                        onKeyDown={onCellKeyDown} onBlur={(e) => patchResource(r, "description", e.target.value)} />
                    </td>
                    <td><input className="cell-input num" type="number" step="0.01" defaultValue={r.quantity}
                      onKeyDown={onCellKeyDown} onBlur={(e) => patchResource(r, "quantity", e.target.value)} /></td>
                    <td><input className="cell-input unit" defaultValue={r.unit ?? ""}
                      onKeyDown={onCellKeyDown} onBlur={(e) => patchResource(r, "unit", e.target.value)} /></td>
                    <td><input className="cell-input num" type="number" step="0.1" defaultValue={r.wastePct}
                      onKeyDown={onCellKeyDown} onBlur={(e) => patchResource(r, "wastePct", e.target.value)} /></td>
                    <td><input className="cell-input num" type="number" step="0.5" defaultValue={r.crew ?? ""}
                      onKeyDown={onCellKeyDown} onBlur={(e) => patchResource(r, "crew", e.target.value)} disabled={r.resourceType !== "labor"} /></td>
                    <td><input className="cell-input num" type="number" step="0.1" defaultValue={r.outputPerDay ?? ""}
                      onKeyDown={onCellKeyDown} onBlur={(e) => patchResource(r, "outputPerDay", e.target.value)} disabled={r.resourceType !== "labor"} /></td>
                    <td><input className="cell-input num" type="number" step="1" defaultValue={r.idleFactor}
                      onKeyDown={onCellKeyDown} onBlur={(e) => patchResource(r, "idleFactor", e.target.value)} disabled={r.resourceType !== "equipment"} /></td>
                    <td><input className="cell-input num" type="number" step="0.01" defaultValue={r.frozenCost}
                      onKeyDown={onCellKeyDown} onBlur={(e) => patchResource(r, "frozenCost", e.target.value)} /></td>
                    <td>{r.currentCost != null ? <>{money(r.currentCost)}{drift && <span className="drift-flag" title="Catalog price changed">⚠</span>}</> : "—"}</td>
                    <td className="upa-amount">{money(resourceAmount(r))}</td>
                    <td><button className="link-button danger" onClick={() => removeResource(r)}>✕</button></td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
