import { useState } from "react";
import Modal from "../components/Modal";

const ACTIONS = [
  { key: "priceIncrease", label: "Increase Price by %", hasValue: true, valuePlaceholder: "e.g. 10", valueLabel: "Percentage (%)" },
  { key: "priceReduction", label: "Reduce Price by %", hasValue: true, valuePlaceholder: "e.g. 5", valueLabel: "Percentage (%)" },
  { key: "setPrice", label: "Set Fixed Price", hasValue: true, valuePlaceholder: "New price", valueLabel: "New Unit Price" },
  { key: "setSupplier", label: "Change Supplier", hasValue: true, valuePlaceholder: "Supplier name", valueLabel: "Supplier" },
  { key: "deactivate", label: "Deactivate", hasValue: false },
  { key: "activate", label: "Activate", hasValue: false },
  { key: "delete", label: "Soft Delete", hasValue: false, danger: true },
];

export default function BulkUpdateModal({ selectedIds, onApply, onClose }) {
  const [action, setAction] = useState("priceIncrease");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const selected = ACTIONS.find((a) => a.key === action);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await onApply({ action, value });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Bulk Update — ${selectedIds.length} item${selectedIds.length !== 1 ? "s" : ""}`} onClose={onClose} width={420}>
      <form className="stacked-form" onSubmit={handleSubmit}>
        <label>
          Action
          <select value={action} onChange={(e) => { setAction(e.target.value); setValue(""); }}>
            {ACTIONS.map((a) => (
              <option key={a.key} value={a.key}>{a.label}</option>
            ))}
          </select>
        </label>

        {selected?.hasValue && (
          <label>
            {selected.valueLabel}
            <input
              autoFocus
              type={action === "setPrice" || action === "priceIncrease" || action === "priceReduction" ? "number" : "text"}
              step="0.01"
              min="0"
              placeholder={selected.valuePlaceholder}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
            />
          </label>
        )}

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
          <button
            type="submit"
            className={selected?.danger ? "danger-button" : "primary-button"}
            disabled={saving || (selected?.hasValue && !value)}
          >
            {saving ? "Applying…" : `Apply to ${selectedIds.length} item${selectedIds.length !== 1 ? "s" : ""}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
