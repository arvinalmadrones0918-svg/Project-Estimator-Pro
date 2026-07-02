import { useEffect, useState } from "react";
import { api } from "../api";
import { money } from "../utils";
import Spinner from "../components/Spinner";
import ErrorBanner from "../components/ErrorBanner";
import {
  PieChart, Pie, Cell, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from "recharts";

// Phase 9 — project cost control & budget monitoring, integrated into the
// Project Explorer (does not alter the estimating workspace).
const TABS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "budget", label: "Budget" },
  { key: "actuals", label: "Actual Costs" },
  { key: "bva", label: "Budget vs Actual" },
  { key: "changes", label: "Change Orders" },
  { key: "cashflow", label: "Cash Flow" },
  { key: "evm", label: "Earned Value" },
  { key: "alerts", label: "Alerts" },
  { key: "reports", label: "Reports" },
];

const COLORS = ["#2f6feb", "#e8893a", "#1faa59", "#9b51e0", "#e0455f", "#5bc0de", "#f5a623"];
const ACTUAL_CATEGORIES = ["Purchase Orders", "Supplier Invoices", "Payroll", "Equipment Usage", "Subcontract Billing", "Miscellaneous"];
const CHANGE_TYPES = [
  { value: "owner", label: "Owner Change Order" },
  { value: "contractor", label: "Contractor Change Order" },
  { value: "variation", label: "Variation Order" },
  { value: "additional", label: "Additional Works" },
];

// A figure that turns red when it represents an overrun.
function Figure({ value, negativeIsBad = true }) {
  const bad = negativeIsBad ? value < 0 : value > 0;
  return <strong className={bad ? "cc-over" : "cc-ok"}>{money(value)}</strong>;
}

export default function CostControlWorkspace({ projectId }) {
  const [tab, setTab] = useState("dashboard");
  const [error, setError] = useState("");
  return (
    <div className="costcontrol-workspace">
      <div className="catalog-toolbar"><h2 className="catalog-title">Cost Control &amp; Budget Monitoring</h2></div>
      <ErrorBanner message={error} onDismiss={() => setError("")} />
      <div className="proc-tabs">
        {TABS.map((t) => <button key={t.key} className={`proc-tab ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>
      <div className="proc-tab-body">
        {tab === "dashboard" && <DashboardTab projectId={projectId} setError={setError} />}
        {tab === "budget" && <BudgetTab projectId={projectId} setError={setError} />}
        {tab === "actuals" && <ActualsTab projectId={projectId} setError={setError} />}
        {tab === "bva" && <BvaTab projectId={projectId} setError={setError} />}
        {tab === "changes" && <ChangesTab projectId={projectId} setError={setError} />}
        {tab === "cashflow" && <CashFlowTab projectId={projectId} setError={setError} />}
        {tab === "evm" && <EvmTab projectId={projectId} setError={setError} />}
        {tab === "alerts" && <AlertsTab projectId={projectId} setError={setError} />}
        {tab === "reports" && <ReportsTab />}
      </div>
    </div>
  );
}

// ── Dashboard ────────────────────────────────────────────────────────────────
function DashboardTab({ projectId, setError }) {
  const [d, setD] = useState(null);
  const [bva, setBva] = useState(null);
  useEffect(() => {
    api.costControl.dashboard(projectId).then(setD).catch((e) => setError(e.message));
    api.costControl.budgetVsActual(projectId).then(setBva).catch(() => {});
  }, [projectId]);
  if (!d) return <Spinner label="Loading cost dashboard…" />;

  const breakdown = bva ? Object.entries(bva.actualDetail || {}).map(([name, value]) => ({ name, value })) : [];
  const budgetBars = [
    { name: "Original", value: d.originalBudget },
    { name: "Revised", value: d.revisedBudget },
    { name: "Committed", value: d.committed },
    { name: "Actual", value: d.actual },
    { name: "Forecast", value: d.forecastFinalCost },
  ];
  const cards = [
    { label: "Approved Budget", value: d.budget },
    { label: "Committed", value: d.committed },
    { label: "Actual", value: d.actual },
    { label: "Remaining", value: d.remaining },
    { label: "Forecast Final Cost", value: d.forecastFinalCost },
    { label: "Variance", value: d.variance },
  ];
  return (
    <div>
      <div className="proc-cards">
        {cards.map((c) => <div key={c.label} className="proc-card"><div className="proc-card-value">{money(c.value)}</div><div className="proc-card-label">{c.label}</div></div>)}
      </div>
      <div className="cc-charts">
        <div className="cc-chart">
          <h4>Budget / Actual / Forecast</h4>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={budgetBars}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip formatter={(v) => money(v)} /><Bar dataKey="value" fill="#2f6feb" /></BarChart>
          </ResponsiveContainer>
        </div>
        <div className="cc-chart">
          <h4>Actual Cost Breakdown</h4>
          {breakdown.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart><Pie data={breakdown} dataKey="value" nameKey="name" outerRadius={80} label>
                {breakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie><Tooltip formatter={(v) => money(v)} /><Legend /></PieChart>
            </ResponsiveContainer>
          ) : <p className="empty-state">No actual costs recorded.</p>}
        </div>
      </div>
    </div>
  );
}

// ── Budget ───────────────────────────────────────────────────────────────────
function BudgetTab({ projectId, setError }) {
  const [budgets, setBudgets] = useState([]);
  const [bva, setBva] = useState(null);
  const [fd, setFd] = useState(null);
  function load() {
    api.costControl.budgets(projectId).then(setBudgets).catch((e) => setError(e.message));
    api.costControl.budgetVsActual(projectId).then(setBva).catch(() => {});
    api.costControl.dashboard(projectId).then(setFd).catch(() => {});
  }
  useEffect(load, [projectId]);

  async function create(type) {
    try { await api.costControl.createBudget({ projectId, type }); load(); }
    catch (e) { setError(e.message); }
  }

  return (
    <div>
      <div className="cc-actions">
        <button className="primary-button" onClick={() => create("original")}>Create Budget from Approved Estimate</button>
        <button className="secondary-button" onClick={() => create("approved")}>Snapshot Approved</button>
        <button className="secondary-button" onClick={() => create("revised")}>Snapshot Revised</button>
      </div>
      {bva && fd && (
        <div className="proc-cards">
          <div className="proc-card"><div className="proc-card-value">{money(bva.originalBudget)}</div><div className="proc-card-label">Original Budget</div></div>
          <div className="proc-card"><div className="proc-card-value">{money(bva.budget)}</div><div className="proc-card-label">Approved Budget</div></div>
          <div className="proc-card"><div className="proc-card-value">{money(bva.revisedBudget)}</div><div className="proc-card-label">Revised Budget</div></div>
          <div className="proc-card"><div className="proc-card-value">{money(fd.forecastFinalCost)}</div><div className="proc-card-label">Current Forecast</div></div>
          <div className="proc-card"><div className="proc-card-value">{money(bva.remaining)}</div><div className="proc-card-label">Remaining Budget</div></div>
        </div>
      )}
      <h4>Budget Versions</h4>
      <table className="proc-table">
        <thead><tr><th>Type</th><th>Version</th><th>Amount</th><th>Status</th><th>Created</th></tr></thead>
        <tbody>
          {budgets.map((b) => <tr key={b.id}><td>{b.type}</td><td>{b.version}</td><td>{money(b.amount)}</td><td>{b.status || "active"}</td><td>{new Date(b.createdAt).toLocaleDateString()}</td></tr>)}
          {budgets.length === 0 && <tr><td colSpan={5} className="empty-state">No budget yet — create one from the approved estimate.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// ── Actual costs ─────────────────────────────────────────────────────────────
function ActualsTab({ projectId, setError }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ category: ACTUAL_CATEGORIES[0], description: "", amount: "", costDate: "" });
  function load() { api.actualCosts.list({ projectId }).then((r) => setRows(Array.isArray(r) ? r : r.items || [])).catch((e) => setError(e.message)); }
  useEffect(load, [projectId]);

  async function add() {
    if (!form.amount) { setError("Amount is required."); return; }
    try {
      await api.actualCosts.create({ projectId, category: form.category, description: form.description, amount: Number(form.amount), costDate: form.costDate || null });
      setForm({ category: ACTUAL_CATEGORIES[0], description: "", amount: "", costDate: "" });
      load();
    } catch (e) { setError(e.message); }
  }
  async function remove(id) { try { await api.actualCosts.remove(id); load(); } catch (e) { setError(e.message); } }

  return (
    <div>
      <div className="cc-form-row">
        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          {ACTUAL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <input type="number" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        <input type="date" value={form.costDate} onChange={(e) => setForm({ ...form, costDate: e.target.value })} />
        <button className="primary-button" onClick={add}>+ Record Actual Cost</button>
      </div>
      <table className="proc-table">
        <thead><tr><th>Category</th><th>Description</th><th>Amount</th><th>Date</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}><td>{r.category}</td><td>{r.description}</td><td>{money(r.amount)}</td><td>{r.costDate || "—"}</td>
              <td><button className="link-button danger" onClick={() => remove(r.id)}>Delete</button></td></tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5} className="empty-state">No actual costs yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// ── Budget vs Actual ─────────────────────────────────────────────────────────
function BvaTab({ projectId, setError }) {
  const [d, setD] = useState(null);
  const [fd, setFd] = useState(null);
  useEffect(() => {
    api.costControl.budgetVsActual(projectId).then(setD).catch((e) => setError(e.message));
    api.costControl.dashboard(projectId).then(setFd).catch(() => {});
  }, [projectId]);
  if (!d) return <Spinner label="Loading…" />;
  const over = d.variance < 0;
  return (
    <table className="proc-table cc-bva">
      <tbody>
        <tr><td>Budget</td><td>{money(d.budget)}</td></tr>
        <tr><td>Committed</td><td>{money(d.committed)}</td></tr>
        <tr><td>Actual</td><td>{money(d.actual)}</td></tr>
        <tr className={over ? "cc-over-row" : ""}><td>Variance</td><td><Figure value={d.variance} /></td></tr>
        <tr className={over ? "cc-over-row" : ""}><td>Variance %</td><td className={over ? "cc-over" : "cc-ok"}>{d.variancePct != null ? `${d.variancePct.toFixed(1)}%` : "—"}</td></tr>
        <tr><td>Forecast Final Cost</td><td>{fd ? money(fd.forecastFinalCost) : "—"}</td></tr>
        <tr><td>Remaining Budget</td><td><Figure value={d.remaining} /></td></tr>
      </tbody>
    </table>
  );
}

// ── Change orders ────────────────────────────────────────────────────────────
function ChangesTab({ projectId, setError }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ voType: "owner", nature: "additive", amount: "", description: "" });
  function load() { api.variationOrders.list({ projectId }).then((r) => setRows(Array.isArray(r) ? r : r.items || [])).catch((e) => setError(e.message)); }
  useEffect(load, [projectId]);

  async function add() {
    if (!form.amount) { setError("Amount is required."); return; }
    try {
      await api.variationOrders.create({ projectId, voType: form.voType, nature: form.nature, amount: Number(form.amount), description: form.description, status: "pending" });
      setForm({ voType: "owner", nature: "additive", amount: "", description: "" });
      load();
    } catch (e) { setError(e.message); }
  }
  async function setStatus(r, status) {
    try { await api.variationOrders.update(r.id, { status }); load(); } catch (e) { setError(e.message); }
  }

  return (
    <div>
      <p className="proc-hint">Approved change orders automatically adjust the revised project budget (additive increases, deductive decreases).</p>
      <div className="cc-form-row">
        <select value={form.voType} onChange={(e) => setForm({ ...form, voType: e.target.value })}>
          {CHANGE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select value={form.nature} onChange={(e) => setForm({ ...form, nature: e.target.value })}>
          <option value="additive">Additional Works (additive)</option>
          <option value="deductive">Deductive Works</option>
        </select>
        <input type="number" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <button className="primary-button" onClick={add}>+ Add Change Order</button>
      </div>
      <table className="proc-table">
        <thead><tr><th>Type</th><th>Nature</th><th>Amount</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.voType}</td><td>{r.nature}</td>
              <td>{r.nature === "deductive" ? "−" : "+"}{money(r.amount)}</td>
              <td>{r.status}</td>
              <td>
                {r.status !== "approved" && <button className="link-button" onClick={() => setStatus(r, "approved")}>Approve</button>}
                {r.status !== "rejected" && <button className="link-button danger" onClick={() => setStatus(r, "rejected")}>Reject</button>}
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5} className="empty-state">No change orders.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// ── Cash flow ────────────────────────────────────────────────────────────────
function CashFlowTab({ projectId, setError }) {
  const [granularity, setGranularity] = useState("month");
  const [data, setData] = useState(null);
  useEffect(() => { api.costControl.cashFlow(projectId, undefined, granularity).then(setData).catch((e) => setError(e.message)); }, [projectId, granularity]);
  if (!data) return <Spinner label="Loading cash flow…" />;
  return (
    <div>
      <div className="cc-actions">
        <label>Granularity
          <select value={granularity} onChange={(e) => setGranularity(e.target.value)}>
            <option value="month">Monthly</option>
            <option value="week">Weekly</option>
          </select>
        </label>
      </div>
      <div className="cc-chart">
        <h4>S-Curve — Planned vs Actual (cumulative)</h4>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data.series}>
            <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="period" /><YAxis /><Tooltip formatter={(v) => money(v)} /><Legend />
            <Line type="monotone" dataKey="cumulativeCost" name="Planned (S-curve)" stroke="#2f6feb" />
            <Line type="monotone" dataKey="cumulativeActual" name="Actual" stroke="#e0455f" />
            <Line type="monotone" dataKey="cumulativeRevenue" name="Revenue" stroke="#1faa59" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="proc-table">
        <thead><tr><th>Period</th><th>Planned</th><th>Actual</th><th>Cum. Planned</th><th>Cum. Actual</th><th>Net Cash Flow</th></tr></thead>
        <tbody>
          {data.series.map((s) => (
            <tr key={s.period}><td>{s.period}</td><td>{money(s.plannedCost)}</td><td>{money(s.actualCost)}</td>
              <td>{money(s.cumulativeCost)}</td><td>{money(s.cumulativeActual)}</td>
              <td className={s.netCashFlow < 0 ? "cc-over" : "cc-ok"}>{money(s.netCashFlow)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Earned value ─────────────────────────────────────────────────────────────
function EvmTab({ projectId, setError }) {
  const [evm, setEvm] = useState(null);
  useEffect(() => { api.costControl.earnedValue(projectId).then(setEvm).catch((e) => setError(e.message)); }, [projectId]);
  if (!evm) return <Spinner label="Loading EVM…" />;
  const metrics = [
    ["PV — Planned Value", money(evm.PV)], ["EV — Earned Value", money(evm.EV)], ["AC — Actual Cost", money(evm.AC)],
    ["CV — Cost Variance", money(evm.CV)], ["SV — Schedule Variance", money(evm.SV)],
    ["CPI — Cost Perf. Index", evm.CPI != null ? evm.CPI.toFixed(2) : "—"], ["SPI — Schedule Perf. Index", evm.SPI != null ? evm.SPI.toFixed(2) : "—"],
    ["EAC — Est. at Completion", money(evm.EAC)], ["ETC — Est. to Complete", money(evm.ETC)], ["VAC — Variance at Completion", money(evm.VAC)],
  ];
  return (
    <div>
      <p className="proc-hint">% Complete: {evm.percentComplete}% (from latest progress billing). BAC {money(evm.BAC)}.</p>
      <div className="cc-evm-grid">
        {metrics.map(([label, value]) => (
          <div key={label} className="cc-evm-cell"><div className="cc-evm-value">{value}</div><div className="cc-evm-label">{label}</div></div>
        ))}
      </div>
    </div>
  );
}

// ── Alerts ───────────────────────────────────────────────────────────────────
function AlertsTab({ projectId, setError }) {
  const [data, setData] = useState(null);
  useEffect(() => { api.costControl.alerts(projectId).then(setData).catch((e) => setError(e.message)); }, [projectId]);
  if (!data) return <Spinner label="Scanning for alerts…" />;
  if (data.count === 0) return <p className="empty-state">✅ No cost alerts — the project is within budget and cash-flow healthy.</p>;
  return (
    <ul className="cc-alerts">
      {data.alerts.map((a, i) => (
        <li key={i} className={`cc-alert cc-alert-${a.severity}`}>
          <span className="cc-alert-badge">{a.severity}</span>
          <span className="cc-alert-type">{a.type.replace(/_/g, " ")}</span>
          <span className="cc-alert-msg">{a.message}</span>
        </li>
      ))}
    </ul>
  );
}

// ── Reports ──────────────────────────────────────────────────────────────────
function ReportsTab() {
  const REPORTS = [
    ["cc-budget", "Budget Report"], ["cc-actual-cost", "Actual Cost Report"], ["cc-variance", "Variance Report"],
    ["cc-cash-flow", "Cash Flow Report"], ["cc-earned-value", "Earned Value Report"], ["cc-forecast", "Forecast Report"],
  ];
  return (
    <div>
      <p className="proc-hint">Cost-control reports are available in the Reports node (PDF / Excel / CSV export). Report types:</p>
      <ul className="cc-report-list">
        {REPORTS.map(([key, label]) => <li key={key}><span className="cc-report-key">{key}</span> {label}</li>)}
      </ul>
    </div>
  );
}
