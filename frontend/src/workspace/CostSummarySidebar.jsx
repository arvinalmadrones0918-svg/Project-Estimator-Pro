import { money } from "../utils";

// Persistent, always-visible cost summary. Every figure comes from the cost
// engine result (calc), so it updates instantly after any edit.
export default function CostSummarySidebar({ calc, collapsed, onToggle }) {
  const w = calc?.waterfall;
  const b = calc?.directCostBreakdown;

  if (collapsed) {
    return (
      <aside className="cost-summary-sidebar collapsed">
        <button className="css-toggle" onClick={onToggle} title="Show cost summary">◀ $</button>
      </aside>
    );
  }

  const Row = ({ label, value, cls }) => (
    <div className={`css-row ${cls || ""}`}><span>{label}</span><strong>{money(value)}</strong></div>
  );

  return (
    <aside className="cost-summary-sidebar">
      <div className="css-head">
        <span>Cost Summary</span>
        <button className="css-toggle" onClick={onToggle} title="Collapse">▶</button>
      </div>
      {!calc ? (
        <p className="empty-state-small">Calculating…</p>
      ) : (
        <div className="css-body">
          <Row label="Materials" value={b.materialCost} />
          <Row label="Labor" value={b.laborCost} />
          <Row label="Equipment" value={b.equipmentCost} />
          <Row label="Subcontract" value={b.subcontractCost} />
          <Row label="Other Costs" value={b.otherCost} />
          <Row label="Direct Cost" value={w.directCost} cls="subtotal" />
          {w.indirectLines.map((l) => <Row key={l.id} label={l.name} value={l.amount} cls="indirect" />)}
          <Row label="Subtotal" value={w.subtotal} cls="subtotal" />
          {w.vatLines.map((l) => <Row key={l.id} label={l.name} value={l.amount} cls="indirect" />)}
          {w.discountLines.map((l) => <Row key={l.id} label={`− ${l.name}`} value={l.amount} cls="indirect" />)}
          <Row label="Grand Total" value={w.finalTenderPrice} cls="grand" />
          {w.retentionTotal > 0 && <div className="css-note">Retention {money(w.retentionTotal)} · Net {money(w.netPayable)}</div>}
        </div>
      )}
    </aside>
  );
}
