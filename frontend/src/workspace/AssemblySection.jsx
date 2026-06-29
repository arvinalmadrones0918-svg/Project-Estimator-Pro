import { useState } from "react";
import { money } from "../utils";
import SaveIndicator from "./SaveIndicator";

// Lets a line reference a reusable cost Assembly instead of a single catalog
// item. unitCost is the price snapshot taken when the assembly was added;
// currentUnitCost is the assembly's live total today, shown as a drift flag.
export default function AssemblySection({ lines, assemblies, onAdd, onUpdateLine, onRemoveLine }) {
  const [assemblyId, setAssemblyId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [rowState, setRowState] = useState({});

  const total = lines.reduce((sum, l) => sum + l.cost, 0);

  async function handleAdd(e) {
    e.preventDefault();
    if (!assemblyId || quantity === "") return;
    await onAdd({ assemblyId: Number(assemblyId), quantity: Number(quantity) });
    setAssemblyId("");
    setQuantity("");
  }

  async function handleQuantityChange(line, value) {
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
        Assembly References <span className="section-total">{money(total)}</span>
      </h4>
      <form className="inline-form" onSubmit={handleAdd}>
        <select value={assemblyId} onChange={(e) => setAssemblyId(e.target.value)}>
          <option value="">Select assembly</option>
          {assemblies.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({money(a.totalCost)}/{a.unit})
            </option>
          ))}
        </select>
        <input placeholder="Quantity" type="number" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        <button type="submit">Add</button>
      </form>
      {lines.length === 0 ? (
        <p className="empty-state-small">No assemblies referenced yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Assembly</th>
              <th>Unit</th>
              <th>Unit Cost</th>
              <th>Quantity</th>
              <th>Amount</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const priceDrift = line.currentUnitCost !== line.unitCost;
              return (
                <tr key={line.id}>
                  <td>{line.name}</td>
                  <td>{line.unit}</td>
                  <td>
                    {money(line.unitCost)}
                    {priceDrift && (
                      <span className="drift-flag" title={`Assembly's current cost is ${money(line.currentUnitCost)}`}>
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
