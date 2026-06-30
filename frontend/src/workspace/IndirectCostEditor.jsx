import { useEffect, useState } from "react";
import { api } from "../api";
import { money } from "../utils";

const KIND_LABELS = {
  indirect: "Indirect",
  vat: "VAT",
  discount: "Discount",
  retention: "Retention",
};

// Editor for a project/scenario's configurable indirect-cost lines. All cost
// math is the engine's job; this only edits the configuration and reads back
// computed amounts from the supplied waterfall.
export default function IndirectCostEditor({ projectId, scenarioId, waterfall, onChange, setError }) {
  const [items, setItems] = useState([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", kind: "indirect", method: "percentage", value: "", appliesTo: "project" });

  function load() {
    api.estimate.indirectCosts(projectId, scenarioId)
      .then(setItems)
      .catch((e) => setError?.(e.message));
  }

  useEffect(load, [projectId, scenarioId]);

  // Map computed amounts from the waterfall back onto each config row by id.
  const amountById = {};
  if (waterfall) {
    [...waterfall.indirectLines, ...waterfall.vatLines, ...waterfall.discountLines, ...waterfall.retentionLines]
      .forEach((l) => { amountById[l.id] = l.amount; });
  }

  async function handleToggle(item) {
    try {
      await api.estimate.updateIndirect(item.id, { enabled: !item.enabled });
      load();
      onChange?.();
    } catch (e) { setError?.(e.message); }
  }

  async function handleEdit(item, field, value) {
    try {
      await api.estimate.updateIndirect(item.id, { [field]: field === "value" ? Number(value) : value });
      load();
      onChange?.();
    } catch (e) { setError?.(e.message); }
  }

  async function handleRemove(item) {
    try {
      await api.estimate.removeIndirect(item.id);
      load();
      onChange?.();
    } catch (e) { setError?.(e.message); }
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.name) return;
    try {
      await api.estimate.createIndirect({ projectId, scenarioId, ...form, value: Number(form.value) || 0 });
      setForm({ name: "", kind: "indirect", method: "percentage", value: "", appliesTo: "project" });
      setAdding(false);
      load();
      onChange?.();
    } catch (e) { setError?.(e.message); }
  }

  async function handleSeed() {
    try {
      await api.estimate.seedDefaultIndirect({ projectId, scenarioId });
      load();
      onChange?.();
    } catch (e) { setError?.(e.message); }
  }

  return (
    <div className="indirect-editor">
      <div className="indirect-editor-head">
        <h3>Indirect Costs</h3>
        <div className="indirect-editor-actions">
          {items.length === 0 && (
            <button className="secondary-button" onClick={handleSeed}>Seed Standard Set</button>
          )}
          <button className="primary-button" onClick={() => setAdding((v) => !v)}>＋ Add Item</button>
        </div>
      </div>

      {adding && (
        <form className="indirect-add-form" onSubmit={handleAdd}>
          <input
            placeholder="Name (e.g. Overhead)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            autoFocus
          />
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            <option value="indirect">Indirect</option>
            <option value="vat">VAT</option>
            <option value="discount">Discount</option>
            <option value="retention">Retention</option>
          </select>
          <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
            <option value="percentage">Percentage</option>
            <option value="fixed">Fixed Amount</option>
          </select>
          <input
            type="number"
            step="0.01"
            placeholder={form.method === "percentage" ? "%" : "Amount"}
            value={form.value}
            onChange={(e) => setForm({ ...form, value: e.target.value })}
          />
          <select value={form.appliesTo} onChange={(e) => setForm({ ...form, appliesTo: e.target.value })}>
            <option value="project">Per Project</option>
            <option value="module">Per Module</option>
          </select>
          <button type="submit" className="primary-button">Add</button>
        </form>
      )}

      {items.length === 0 ? (
        <p className="empty-state-small">No indirect costs configured. Add items or seed the standard set.</p>
      ) : (
        <table className="indirect-table">
          <thead>
            <tr>
              <th></th>
              <th>Name</th>
              <th>Type</th>
              <th>Method</th>
              <th>Value</th>
              <th>Scope</th>
              <th>Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className={item.enabled ? "" : "row-disabled"}>
                <td>
                  <input type="checkbox" checked={item.enabled} onChange={() => handleToggle(item)} title="Enable/disable" />
                </td>
                <td>
                  <input
                    className="inline-edit"
                    defaultValue={item.name}
                    onBlur={(e) => e.target.value !== item.name && handleEdit(item, "name", e.target.value)}
                  />
                </td>
                <td>
                  <select className={`kind-badge kind-${item.kind}`} value={item.kind} onChange={(e) => handleEdit(item, "kind", e.target.value)}>
                    {Object.entries(KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </td>
                <td>
                  <select value={item.method} onChange={(e) => handleEdit(item, "method", e.target.value)}>
                    <option value="percentage">%</option>
                    <option value="fixed">Fixed</option>
                  </select>
                </td>
                <td>
                  <input
                    className="inline-edit value-edit"
                    type="number"
                    step="0.01"
                    defaultValue={item.value}
                    onBlur={(e) => Number(e.target.value) !== item.value && handleEdit(item, "value", e.target.value)}
                  />
                  {item.method === "percentage" ? "%" : ""}
                </td>
                <td>
                  <select value={item.appliesTo} onChange={(e) => handleEdit(item, "appliesTo", e.target.value)}>
                    <option value="project">Project</option>
                    <option value="module">Module</option>
                  </select>
                </td>
                <td className="indirect-amount">{amountById[item.id] != null ? money(amountById[item.id]) : "—"}</td>
                <td>
                  <button className="link-button danger" onClick={() => handleRemove(item)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
