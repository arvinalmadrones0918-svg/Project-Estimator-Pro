import { useState } from "react";
import Modal from "../components/Modal";
import { money } from "../utils";

const CURRENCY_OPTIONS = ["USD", "PHP", "EUR", "GBP", "SGD", "AUD", "CAD", "JPY"];

export default function CatalogForm({ item, priceLabel, priceField, hasUnit, onSave, onClose }) {
  const isEdit = !!item?.id;

  const [form, setForm] = useState({
    code: item?.code ?? "",
    name: item?.name ?? "",
    description: item?.description ?? "",
    category: item?.category ?? "",
    subcategory: item?.subcategory ?? "",
    manufacturer: item?.manufacturer ?? "",
    brand: item?.brand ?? "",
    supplier: item?.supplier ?? "",
    unit: item?.unit ?? "",
    [priceField]: item?.[priceField] ?? "",
    currency: item?.currency ?? "USD",
    remarks: item?.remarks ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set(key, value) { setForm((f) => ({ ...f, [key]: value })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError("");
    try {
      const payload = { ...form, [priceField]: parseFloat(form[priceField]) || 0 };
      await onSave(payload);
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal title={isEdit ? "Edit Item" : "New Catalog Item"} onClose={onClose} width={620}>
      <form className="catalog-form" onSubmit={handleSubmit}>
        {error && <div className="error-banner" style={{ marginBottom: "0.75rem" }}>{error}</div>}

        <div className="catalog-form-grid">
          <label>
            Code
            <input value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="e.g. MAT-001" />
          </label>
          <label>
            Name *
            <input autoFocus value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Item name" required />
          </label>
          <label className="span-2">
            Description
            <input value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Optional description" />
          </label>
          <label>
            Category
            <input value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="e.g. Plumbing" />
          </label>
          <label>
            Subcategory
            <input value={form.subcategory} onChange={(e) => set("subcategory", e.target.value)} placeholder="Optional" />
          </label>
          <label>
            Manufacturer
            <input value={form.manufacturer} onChange={(e) => set("manufacturer", e.target.value)} />
          </label>
          <label>
            Brand
            <input value={form.brand} onChange={(e) => set("brand", e.target.value)} />
          </label>
          <label>
            Supplier
            <input value={form.supplier} onChange={(e) => set("supplier", e.target.value)} />
          </label>
          {hasUnit && (
            <label>
              Unit
              <input value={form.unit} onChange={(e) => set("unit", e.target.value)} placeholder="e.g. m, pcs, kg" />
            </label>
          )}
          <label>
            {priceLabel}
            <input
              type="number"
              step="0.0001"
              min="0"
              value={form[priceField]}
              onChange={(e) => set(priceField, e.target.value)}
              placeholder="0.00"
            />
          </label>
          <label>
            Currency
            <select value={form.currency} onChange={(e) => set("currency", e.target.value)}>
              {CURRENCY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="span-2">
            Remarks
            <textarea
              value={form.remarks}
              onChange={(e) => set("remarks", e.target.value)}
              rows={2}
              placeholder="Optional notes"
            />
          </label>
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Item"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
