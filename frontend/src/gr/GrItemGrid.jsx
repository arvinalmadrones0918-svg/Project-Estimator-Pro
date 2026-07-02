import { useEffect, useState } from "react";
import { api } from "../api";
import { money } from "../utils";

const METHODS = [
  { value: "lumpSum", label: "Lump Sum" },
  { value: "unitRate", label: "Unit Rate" },
  { value: "percentageOfDirect", label: "% of Direct Cost" },
  { value: "percentageOfProject", label: "% of Project Cost" },
  { value: "percentageOfCategory", label: "% of Category" },
  { value: "monthly", label: "Monthly" },
  { value: "weekly", label: "Weekly" },
  { value: "daily", label: "Daily" },
  { value: "rental", label: "Rental" },
  { value: "allowance", label: "Allowance" },
  { value: "formula", label: "Formula" },
];

// Spreadsheet of GR items grouped by category. Amounts come from the engine
// (the `calc` prop); this only edits the inputs.
export default function GrItemGrid({ sheetId, items, calc, onChange, setError }) {
  const [categories, setCategories] = useState([]);
  const [addingTo, setAddingTo] = useState(null);
  const [form, setForm] = useState({ description: "", method: "lumpSum", quantity: 1, rate: 0, value: 0, pct: 0, unit: "", formula: "" });

  useEffect(() => { api.gr.categories().then((d) => setCategories(d.categories)).catch(() => {}); }, []);

  // Amount per item id from the engine calc.
  const amountById = {};
  (calc?.lines || []).forEach((l) => { amountById[l.id] = l.amount; });

  const byCategory = {};
  for (const c of categories) byCategory[c] = [];
  for (const it of items) (byCategory[it.category] ||= []).push(it);

  async function patch(item, field, value) {
    const numeric = ["quantity", "rate", "value", "pct", "durationValue", "markup"].includes(field);
    const v = numeric ? Number(value) : value;
    if (item[field] === v) return;
    try { await api.gr.updateItem(item.id, { [field]: v }); onChange(); }
    catch (e) { setError(e.message); }
  }

  async function addItem(category) {
    if (!form.description) { setError("Description is required."); return; }
    try {
      await api.gr.addItem(sheetId, { ...form, category, quantity: Number(form.quantity) || 1, rate: Number(form.rate) || 0, value: Number(form.value) || 0, pct: Number(form.pct) || 0 });
      setForm({ description: "", method: "lumpSum", quantity: 1, rate: 0, value: 0, pct: 0, unit: "", formula: "" });
      setAddingTo(null);
      onChange();
    } catch (e) { setError(e.message); }
  }

  async function remove(item) {
    try { await api.gr.removeItem(item.id); onChange(); }
    catch (e) { setError(e.message); }
  }

  return (
    <div className="gr-items">
      <h4>Items by Category</h4>
      {categories.map((cat) => {
        const catItems = byCategory[cat] || [];
        const catTotal = (calc?.categories || []).find((c) => c.category === cat)?.total ?? 0;
        return (
          <div key={cat} className="gr-category">
            <div className="gr-category-head">
              <span className="gr-category-name">{cat}</span>
              <span className="gr-category-total">{money(catTotal)}</span>
              <button className="link-button" onClick={() => setAddingTo(addingTo === cat ? null : cat)}>＋ Add</button>
            </div>

            {addingTo === cat && (
              <form className="gr-add-row" onSubmit={(e) => { e.preventDefault(); addItem(cat); }}>
                <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} autoFocus />
                <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                  {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <input placeholder="Unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} style={{ width: 60 }} />
                <input type="number" placeholder="Qty" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} style={{ width: 60 }} />
                <input type="number" placeholder="Rate" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} style={{ width: 80 }} />
                <input type="number" placeholder="Value" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} style={{ width: 80 }} />
                <input type="number" placeholder="%" value={form.pct} onChange={(e) => setForm({ ...form, pct: e.target.value })} style={{ width: 60 }} />
                <button type="submit" className="primary-button">Add</button>
              </form>
            )}

            {catItems.length > 0 && (
              <table className="gr-item-table">
                <thead>
                  <tr><th>Description</th><th>Method</th><th>Unit</th><th>Qty</th><th>Rate</th><th>Value</th><th>%</th><th>Amount</th><th></th></tr>
                </thead>
                <tbody>
                  {catItems.map((it) => (
                    <tr key={it.id} className={it.status === "excluded" ? "row-excluded" : ""}>
                      <td><input className="cell-input wide" defaultValue={it.description} onBlur={(e) => patch(it, "description", e.target.value)} /></td>
                      <td>
                        <select value={it.method} onChange={(e) => patch(it, "method", e.target.value)}>
                          {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                      </td>
                      <td><input className="cell-input unit" defaultValue={it.unit ?? ""} onBlur={(e) => patch(it, "unit", e.target.value)} /></td>
                      <td><input className="cell-input num" type="number" defaultValue={it.quantity} onBlur={(e) => patch(it, "quantity", e.target.value)} /></td>
                      <td><input className="cell-input num" type="number" defaultValue={it.rate} onBlur={(e) => patch(it, "rate", e.target.value)} /></td>
                      <td><input className="cell-input num" type="number" defaultValue={it.value} onBlur={(e) => patch(it, "value", e.target.value)} /></td>
                      <td><input className="cell-input num" type="number" defaultValue={it.pct} onBlur={(e) => patch(it, "pct", e.target.value)} /></td>
                      <td className="gr-amount">{money(amountById[it.id] ?? 0)}</td>
                      <td><button className="link-button danger" onClick={() => remove(it)}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}
