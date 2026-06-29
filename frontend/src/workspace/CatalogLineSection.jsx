import { useState } from "react";
import { money } from "../utils";
import SaveIndicator from "./SaveIndicator";

// Generic line-item table for any line type that references a catalog
// (materials / labor specializations / equipment): a description+unit+rate
// is picked from a catalog, a quantity is entered, and amount = quantity *
// the price snapshot taken at entry. Shared by Materials/Labor/Equipment so
// the three sections don't reimplement identical add/edit/remove logic.
export default function CatalogLineSection({
  title,
  lines,
  catalogItems,
  catalogLabel,
  quantityLabel = "Quantity",
  rateField,
  currentRateField,
  rateSuffix = "",
  onAdd,
  onUpdateLine,
  onRemoveLine,
}) {
  const [refId, setRefId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [rowState, setRowState] = useState({});

  const total = lines.reduce((sum, l) => sum + l.cost, 0);

  async function handleAdd(e) {
    e.preventDefault();
    if (!refId || quantity === "") return;
    await onAdd({ refId: Number(refId), quantity: Number(quantity) });
    setRefId("");
    setQuantity("");
  }

  async function handleQuantityChange(line, value) {
    setRowState((s) => ({ ...s, [line.id]: "dirty" }));
    const quantityValue = Number(value);
    if (Number.isNaN(quantityValue)) return;
    setRowState((s) => ({ ...s, [line.id]: "saving" }));
    await onUpdateLine(line.id, { quantity: quantityValue, notes: line.notes });
    setRowState((s) => ({ ...s, [line.id]: "saved" }));
  }

  async function handleNotesChange(line, value) {
    setRowState((s) => ({ ...s, [line.id]: "saving" }));
    await onUpdateLine(line.id, { quantity: line.quantity, notes: value });
    setRowState((s) => ({ ...s, [line.id]: "saved" }));
  }

  return (
    <section className="line-section">
      <h4>
        {title} <span className="section-total">{money(total)}</span>
      </h4>
      <form className="inline-form" onSubmit={handleAdd}>
        <select value={refId} onChange={(e) => setRefId(e.target.value)}>
          <option value="">{catalogLabel}</option>
          {catalogItems.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} ({money(item[rateField === "unitPrice" ? "unitPrice" : "hourlyRate"])}
              {rateSuffix}
              {item.unit ? `/${item.unit}` : ""})
            </option>
          ))}
        </select>
        <input
          placeholder={quantityLabel}
          type="number"
          step="0.01"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
        <button type="submit">Add</button>
      </form>
      {lines.length === 0 ? (
        <p className="empty-state-small">No {title.toLowerCase()} added yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Description / Catalog Reference</th>
              <th>Unit</th>
              <th>Unit Cost</th>
              <th>{quantityLabel}</th>
              <th>Amount</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const priceDrift = line[currentRateField] !== line[rateField];
              return (
                <tr key={line.id}>
                  <td>{line.name}</td>
                  <td>{line.unit || "—"}</td>
                  <td>
                    {money(line[rateField])}
                    {priceDrift && (
                      <span className="drift-flag" title={`Catalog price has changed to ${money(line[currentRateField])}`}>
                        ⚠
                      </span>
                    )}
                  </td>
                  <td>
                    <input
                      className="qty-input"
                      type="number"
                      step="0.01"
                      defaultValue={line.quantity}
                      onChange={(e) => handleQuantityChange(line, e.target.value)}
                    />
                  </td>
                  <td>{money(line.cost)}</td>
                  <td>
                    <input
                      className="notes-input"
                      defaultValue={line.notes || ""}
                      placeholder="Notes"
                      onBlur={(e) => handleNotesChange(line, e.target.value)}
                    />
                  </td>
                  <td>
                    <SaveIndicator state={rowState[line.id]} />
                    <button className="link-button danger" onClick={() => onRemoveLine(line.id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
