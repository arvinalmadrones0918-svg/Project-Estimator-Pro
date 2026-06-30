import { useEffect, useState } from "react";
import { api } from "../api";
import Modal from "../components/Modal";
import { money, formatDate } from "../utils";

const QUOTE_FIELDS = [
  { key: "quotedUnitCost", label: "Quoted Unit Cost", type: "number", required: true },
  { key: "currency", label: "Currency" },
  { key: "validityDate", label: "Validity Date", type: "date" },
  { key: "leadTime", label: "Lead Time" },
  { key: "deliveryTerms", label: "Delivery Terms" },
  { key: "paymentTerms", label: "Payment Terms" },
  { key: "quotationReference", label: "Quotation Reference" },
  { key: "remarks", label: "Remarks", span: true },
];

const SELECTION_METHODS = [
  { value: "lowest", label: "Lowest Price" },
  { value: "preferred", label: "Preferred Supplier" },
  { value: "approved", label: "Approved Supplier" },
  { value: "manual", label: "Manual Selection" },
];

function isExpired(validityDate) {
  return validityDate && validityDate < new Date().toISOString().slice(0, 10);
}

// Manage all supplier quotations for one material: add quotes, view the price
// comparison, and select a supplier (which updates the estimate's catalog
// price). All numbers come from the procurement comparison API.
export default function QuotationModal({ material, onClose, onChanged }) {
  const [comparison, setComparison] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ supplierId: "", quotedUnitCost: "", currency: "USD", validityDate: "", leadTime: "", deliveryTerms: "", paymentTerms: "", quotationReference: "", remarks: "" });
  const [error, setError] = useState("");

  function load() {
    api.procurement.comparison(material.id).then(setComparison).catch((e) => setError(e.message));
  }

  useEffect(() => {
    load();
    api.suppliers.list({ status: "active" }).then((d) => setSuppliers(Array.isArray(d) ? d : d.items)).catch(() => {});
  }, [material.id]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.supplierId || form.quotedUnitCost === "") { setError("Supplier and quoted cost are required"); return; }
    try {
      await api.procurement.createQuotation({ materialId: material.id, ...form, quotedUnitCost: Number(form.quotedUnitCost), supplierId: Number(form.supplierId) });
      setForm({ supplierId: "", quotedUnitCost: "", currency: "USD", validityDate: "", leadTime: "", deliveryTerms: "", paymentTerms: "", quotationReference: "", remarks: "" });
      setAdding(false);
      load();
      onChanged?.();
    } catch (err) { setError(err.message); }
  }

  async function handleSelect(quotationId, selectionMethod) {
    try {
      await api.procurement.select({ materialId: material.id, quotationId, selectionMethod });
      load();
      onChanged?.();
    } catch (err) { setError(err.message); }
  }

  async function handleRemove(id) {
    try { await api.procurement.removeQuotation(id); load(); onChanged?.(); }
    catch (err) { setError(err.message); }
  }

  const c = comparison;

  return (
    <Modal title={`Quotations — ${material.name}`} onClose={onClose} width={900}>
      {error && <div className="error-banner" style={{ marginBottom: "0.75rem" }}>{error}</div>}

      {/* Comparison summary */}
      {c && (
        <div className="comparison-summary">
          <div className="comp-stat"><span>Lowest</span><strong>{c.lowest != null ? money(c.lowest) : "—"}</strong><small>{c.lowestSupplier}</small></div>
          <div className="comp-stat"><span>Highest</span><strong>{c.highest != null ? money(c.highest) : "—"}</strong><small>{c.highestSupplier}</small></div>
          <div className="comp-stat"><span>Average</span><strong>{c.average != null ? money(c.average) : "—"}</strong></div>
          <div className="comp-stat"><span>Preferred</span><strong>{c.preferred ? money(c.preferred.quotedUnitCost) : "—"}</strong><small>{c.preferred?.supplierName}</small></div>
          <div className="comp-stat"><span>Prev. Purchase</span><strong>{c.previousPurchasePrice != null ? money(c.previousPurchasePrice) : "—"}</strong></div>
          <div className="comp-stat"><span>Price Variance</span><strong>{c.priceVariance != null ? money(c.priceVariance) : "—"}</strong><small>{c.priceVariancePct != null ? `${c.priceVariancePct.toFixed(1)}% vs lowest` : ""}</small></div>
        </div>
      )}

      <div className="quote-toolbar">
        <span>Current catalog price: <strong>{money(c?.currentUnitPrice ?? material.unitPrice)}</strong></span>
        <button className="primary-button" onClick={() => setAdding((v) => !v)}>＋ Add Quotation</button>
      </div>

      {adding && (
        <form className="quote-add-form" onSubmit={handleAdd}>
          <label className="span-2">
            Supplier
            <select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })} autoFocus>
              <option value="">Select supplier…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.companyName} {s.rating ? `(★${s.rating})` : ""}</option>)}
            </select>
          </label>
          {QUOTE_FIELDS.map((f) => (
            <label key={f.key} className={f.span ? "span-2" : ""}>
              {f.label}
              <input
                type={f.type || "text"}
                step={f.type === "number" ? "0.01" : undefined}
                value={form[f.key]}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              />
            </label>
          ))}
          <div className="modal-actions span-2">
            <button type="button" className="secondary-button" onClick={() => setAdding(false)}>Cancel</button>
            <button type="submit" className="primary-button">Add Quotation</button>
          </div>
        </form>
      )}

      {/* Quotation table */}
      <table className="quote-table">
        <thead>
          <tr>
            <th>Supplier</th><th>Unit Cost</th><th>Validity</th><th>Lead Time</th>
            <th>Terms</th><th>Ref</th><th>Status</th><th>Select</th><th></th>
          </tr>
        </thead>
        <tbody>
          {(c?.quotations ?? []).length === 0 ? (
            <tr><td colSpan={9} className="empty-state-small">No quotations yet. Add one to compare suppliers.</td></tr>
          ) : (
            c.quotations.map((q) => (
              <tr key={q.id} className={q.isSelected ? "quote-selected" : ""}>
                <td>{q.supplierName} {q.supplierRating ? <span className="muted">★{q.supplierRating}</span> : null}</td>
                <td className={q.quotedUnitCost === c.lowest ? "quote-lowest" : ""}>{money(q.quotedUnitCost)} {q.currency}</td>
                <td>{q.validityDate ? <span className={isExpired(q.validityDate) ? "quote-expired" : ""}>{q.validityDate}{isExpired(q.validityDate) ? " ⚠" : ""}</span> : "—"}</td>
                <td>{q.leadTime || "—"}</td>
                <td>{q.deliveryTerms || q.paymentTerms || "—"}</td>
                <td>{q.quotationReference || "—"}</td>
                <td>
                  {q.isSelected
                    ? <span className="status-badge status-active">Selected ({q.selectionMethod})</span>
                    : <span className="status-badge">{q.status}</span>}
                </td>
                <td>
                  <select
                    value=""
                    onChange={(e) => e.target.value && handleSelect(q.id, e.target.value)}
                    disabled={q.isSelected}
                  >
                    <option value="">Select as…</option>
                    {SELECTION_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </td>
                <td><button className="link-button danger" onClick={() => handleRemove(q.id)}>✕</button></td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </Modal>
  );
}
