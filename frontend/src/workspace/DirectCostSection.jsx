import { useState } from "react";
import { money } from "../utils";
import SaveIndicator from "./SaveIndicator";

// Shared by Subcontract and Other Costs: both are a free-text description
// plus a direct dollar cost (no catalog reference, no quantity/unit).
export default function DirectCostSection({ title, lines, onAdd, onUpdateLine, onRemoveLine }) {
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("");
  const [rowState, setRowState] = useState({});

  const total = lines.reduce((sum, l) => sum + l.cost, 0);

  async function handleAdd(e) {
    e.preventDefault();
    if (!description.trim() || cost === "") return;
    await onAdd({ description, cost: Number(cost) });
    setDescription("");
    setCost("");
  }

  async function handleNotesChange(line, value) {
    setRowState((s) => ({ ...s, [line.id]: "saving" }));
    await onUpdateLine(line.id, { description: line.description, cost: line.cost, notes: value });
    setRowState((s) => ({ ...s, [line.id]: "saved" }));
  }

  async function handleCostChange(line, value) {
    const costValue = Number(value);
    if (Number.isNaN(costValue)) return;
    setRowState((s) => ({ ...s, [line.id]: "saving" }));
    await onUpdateLine(line.id, { description: line.description, cost: costValue, notes: line.notes });
    setRowState((s) => ({ ...s, [line.id]: "saved" }));
  }

  return (
    <section className="line-section">
      <h4>
        {title} <span className="section-total">{money(total)}</span>
      </h4>
      <form className="inline-form" onSubmit={handleAdd}>
        <input placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
        <input placeholder="Cost" type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
        <button type="submit">Add</button>
      </form>
      {lines.length === 0 ? (
        <p className="empty-state-small">No {title.toLowerCase()} added yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th>Amount</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                <td>{line.description}</td>
                <td>
                  <input
                    className="qty-input"
                    type="number"
                    step="0.01"
                    defaultValue={line.cost}
                    onChange={(e) => handleCostChange(line, e.target.value)}
                  />
                </td>
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
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
