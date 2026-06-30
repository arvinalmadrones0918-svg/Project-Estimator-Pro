import { useEffect, useState } from "react";
import { api } from "../api";
import { money } from "../utils";
import CostSummaryPanel from "./CostSummaryPanel";
import IndirectCostEditor from "./IndirectCostEditor";

const SCENARIO_TYPES = [
  { value: "budget", label: "Budget Estimate" },
  { value: "tender", label: "Tender Estimate" },
  { value: "revised", label: "Revised Estimate" },
  { value: "value-engineering", label: "Value Engineering" },
];

// Top-level cost view: scenario selector, direct-cost rollup (via engine),
// WBS category totals, indirect-cost configuration, the final-price waterfall,
// and revision snapshots. Every number shown comes from the engine result
// passed in as `calc` — nothing is recomputed here.
export default function CostEnginePanel({
  projectId,
  calc,
  scenarios,
  activeScenarioId,
  onScenarioChange,
  onScenariosChanged,
  onRecalc,
  setError,
}) {
  const [revisions, setRevisions] = useState([]);
  const [newScenario, setNewScenario] = useState(false);
  const [scenarioForm, setScenarioForm] = useState({ name: "", type: "tender" });

  function loadRevisions() {
    api.estimate.revisions(projectId, activeScenarioId)
      .then(setRevisions)
      .catch(() => {});
  }

  useEffect(loadRevisions, [projectId, activeScenarioId, calc]);

  async function handleCreateScenario(e) {
    e.preventDefault();
    if (!scenarioForm.name) return;
    try {
      const created = await api.estimate.createScenario({ projectId, ...scenarioForm });
      setNewScenario(false);
      setScenarioForm({ name: "", type: "tender" });
      onScenariosChanged?.(created.id);
    } catch (err) { setError?.(err.message); }
  }

  async function handleDuplicateScenario() {
    if (!activeScenarioId) return;
    try {
      const dup = await api.estimate.duplicateScenario(activeScenarioId);
      onScenariosChanged?.(dup.id);
    } catch (err) { setError?.(err.message); }
  }

  async function handleSnapshot() {
    try {
      const note = window.prompt("Revision note (optional):") ?? "";
      await api.estimate.createRevision({ projectId, scenarioId: activeScenarioId, note });
      loadRevisions();
    } catch (err) { setError?.(err.message); }
  }

  if (!calc) return <p className="empty-state">Calculating…</p>;

  const w = calc.waterfall;
  const breakdown = calc.directCostBreakdown;

  return (
    <div className="cost-engine-panel">
      {/* ── Scenario bar ─────────────────────────────── */}
      <div className="scenario-bar">
        <label>
          Scenario:
          <select
            value={activeScenarioId ?? ""}
            onChange={(e) => onScenarioChange?.(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Project Default (no scenario)</option>
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} {s.isPrimary ? "★" : ""} ({s.type})
              </option>
            ))}
          </select>
        </label>
        <button className="secondary-button" onClick={() => setNewScenario((v) => !v)}>＋ New Scenario</button>
        {activeScenarioId && <button className="secondary-button" onClick={handleDuplicateScenario}>Duplicate</button>}
        <button className="primary-button" onClick={handleSnapshot}>📸 Snapshot Revision</button>
      </div>

      {newScenario && (
        <form className="scenario-add-form" onSubmit={handleCreateScenario}>
          <input
            placeholder="Scenario name"
            value={scenarioForm.name}
            onChange={(e) => setScenarioForm({ ...scenarioForm, name: e.target.value })}
            autoFocus
          />
          <select value={scenarioForm.type} onChange={(e) => setScenarioForm({ ...scenarioForm, type: e.target.value })}>
            {SCENARIO_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <button type="submit" className="primary-button">Create</button>
        </form>
      )}

      {/* ── Direct cost summary + pie ────────────────── */}
      <CostSummaryPanel
        totals={{
          materialCost: breakdown.materialCost,
          laborCost: breakdown.laborCost,
          equipmentCost: breakdown.equipmentCost,
          subcontractCost: breakdown.subcontractCost,
          otherCost: breakdown.otherCost,
          assemblyCost: 0,
          projectTotal: w.directCost,
        }}
      />

      {/* ── WBS category rollup ──────────────────────── */}
      <div className="wbs-rollup">
        <h3>Cost by WBS Category</h3>
        <table className="wbs-rollup-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Material</th>
              <th>Labor</th>
              <th>Equipment</th>
              <th>Subcontract</th>
              <th>Other</th>
              <th>Direct Cost</th>
            </tr>
          </thead>
          <tbody>
            {calc.wbsCategories.map((c) => (
              <tr key={c.id ?? "uncat"}>
                <td><strong>{c.name}</strong> <span className="muted">({c.moduleCount})</span></td>
                <td>{money(c.materialCost)}</td>
                <td>{money(c.laborCost)}</td>
                <td>{money(c.equipmentCost)}</td>
                <td>{money(c.subcontractCost)}</td>
                <td>{money(c.otherCost)}</td>
                <td><strong>{money(c.directCost)}</strong></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td><strong>Project Direct Cost</strong></td>
              <td colSpan={5}></td>
              <td><strong>{money(w.directCost)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ── Indirect cost editor ─────────────────────── */}
      <IndirectCostEditor
        projectId={projectId}
        scenarioId={activeScenarioId}
        waterfall={w}
        onChange={onRecalc}
        setError={setError}
      />

      {/* ── Final price waterfall ────────────────────── */}
      <div className="waterfall">
        <h3>Final Price Calculation</h3>
        <table className="waterfall-table">
          <tbody>
            <tr><td>Direct Cost</td><td>{money(w.directCost)}</td></tr>
            {w.indirectLines.map((l) => (
              <tr key={l.id} className="waterfall-add"><td className="indent">+ {l.name} {l.method === "percentage" ? `(${l.value}%)` : ""}</td><td>{money(l.amount)}</td></tr>
            ))}
            <tr className="waterfall-subtotal"><td>= Subtotal</td><td>{money(w.subtotal)}</td></tr>
            {w.vatLines.map((l) => (
              <tr key={l.id} className="waterfall-add"><td className="indent">+ {l.name} {l.method === "percentage" ? `(${l.value}%)` : ""}</td><td>{money(l.amount)}</td></tr>
            ))}
            <tr className="waterfall-subtotal"><td>= Bid Price</td><td>{money(w.bidPrice)}</td></tr>
            {w.discountLines.map((l) => (
              <tr key={l.id} className="waterfall-sub"><td className="indent">− {l.name} {l.method === "percentage" ? `(${l.value}%)` : ""}</td><td>−{money(l.amount)}</td></tr>
            ))}
            <tr className="waterfall-total"><td>= Final Tender Price</td><td>{money(w.finalTenderPrice)}</td></tr>
            {w.retentionLines.map((l) => (
              <tr key={l.id} className="waterfall-memo"><td className="indent">(− {l.name} {l.method === "percentage" ? `(${l.value}%)` : ""} retained)</td><td>−{money(l.amount)}</td></tr>
            ))}
            {w.retentionTotal > 0 && (
              <tr className="waterfall-memo"><td>Net Payable (after retention)</td><td>{money(w.netPayable)}</td></tr>
            )}
          </tbody>
        </table>
        <p className="calc-meta">Engine v{calc.calcVersion} · calculated {new Date(calc.calculatedAt).toLocaleString()}</p>
      </div>

      {/* ── Revisions ────────────────────────────────── */}
      <div className="revisions">
        <h3>Revisions</h3>
        {revisions.length === 0 ? (
          <p className="empty-state-small">No revisions snapshotted yet.</p>
        ) : (
          <table className="revisions-table">
            <thead>
              <tr><th>Rev</th><th>Date</th><th>Note</th><th>Final Tender Price</th></tr>
            </thead>
            <tbody>
              {revisions.map((r) => (
                <tr key={r.id}>
                  <td><strong>Rev {r.revisionNumber}</strong></td>
                  <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td>{r.note || "—"}</td>
                  <td>{money(r.totals?.waterfall?.finalTenderPrice ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
