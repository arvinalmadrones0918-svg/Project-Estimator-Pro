import { useEffect, useState } from "react";
import { api } from "../api";
import { money } from "../utils";
import ErrorBanner from "../components/ErrorBanner";
import Spinner from "../components/Spinner";
import RegisterTable from "../tendering/RegisterTable";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";

const TABS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "budget", label: "Budget" },
  { key: "bva", label: "Budget vs Actual" },
  { key: "po", label: "Purchase Orders" },
  { key: "subs", label: "Subcontracts" },
  { key: "vo", label: "Variation Orders" },
  { key: "billing", label: "Progress Billing" },
  { key: "actuals", label: "Actual Costs" },
  { key: "cashflow", label: "Cash Flow" },
  { key: "evm", label: "Earned Value" },
];

export default function CostControlPage() {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [tab, setTab] = useState("dashboard");
  const [error, setError] = useState("");

  useEffect(() => { api.projects.list().then((p) => { setProjects(p); if (p.length) setProjectId(String(p[0].id)); }).catch((e) => setError(e.message)); }, []);

  const pid = Number(projectId);

  return (
    <div className="costcontrol-page">
      <ErrorBanner message={error} onDismiss={() => setError("")} />
      <div className="catalog-toolbar">
        <h2 className="catalog-title">Cost Control</h2>
        <label className="bid-project-select">Project:
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </div>
      <nav className="proc-tabs">{TABS.map((t) => <button key={t.key} className={tab === t.key ? "active" : ""} onClick={() => setTab(t.key)}>{t.label}</button>)}</nav>

      {!pid ? <p className="empty-state">Select a project.</p> : (
        <>
          {tab === "dashboard" && <DashboardView projectId={pid} />}
          {tab === "budget" && <BudgetView projectId={pid} setError={setError} />}
          {tab === "bva" && <BvaView projectId={pid} />}
          {tab === "po" && <PoTable projectId={pid} setError={setError} />}
          {tab === "subs" && <SubsTable projectId={pid} setError={setError} />}
          {tab === "vo" && <VoTable projectId={pid} setError={setError} />}
          {tab === "billing" && <BillingTable projectId={pid} setError={setError} />}
          {tab === "actuals" && <ActualsTable projectId={pid} setError={setError} />}
          {tab === "cashflow" && <CashFlowView projectId={pid} />}
          {tab === "evm" && <EvmView projectId={pid} />}
        </>
      )}
    </div>
  );
}

function Metric({ label, value, accent }) {
  return <div className={`proc-stat-card ${accent || ""}`}><div className="proc-stat-value">{typeof value === "number" ? money(value) : value}</div><div className="proc-stat-label">{label}</div></div>;
}

function DashboardView({ projectId }) {
  const [d, setD] = useState(null);
  useEffect(() => { api.costControl.dashboard(projectId).then(setD).catch(() => {}); }, [projectId]);
  if (!d) return <Spinner label="Loading…" />;
  return (
    <div className="proc-stats-grid">
      <Metric label="Budget" value={d.budget} />
      <Metric label="Committed" value={d.committed} accent="warn" />
      <Metric label="Actual Cost" value={d.actual} />
      <Metric label="Remaining" value={d.remaining} accent={d.remaining >= 0 ? "ok" : "danger"} />
      <Metric label="Revenue" value={d.revenue} accent="ok" />
      <Metric label="Profit" value={d.profit} accent={d.profit >= 0 ? "ok" : "danger"} />
      <Metric label="Forecast Final Cost" value={d.forecastFinalCost} />
      <Metric label="Forecast Final Profit" value={d.forecastFinalProfit} accent={d.forecastFinalProfit >= 0 ? "ok" : "danger"} />
      <Metric label="% Complete" value={`${d.percentComplete ?? 0}%`} />
      <Metric label="CPI" value={d.CPI != null ? d.CPI.toFixed(2) : "—"} />
      <Metric label="SPI" value={d.SPI != null ? d.SPI.toFixed(2) : "—"} />
      <Metric label="Variance" value={d.variance} accent={d.variance >= 0 ? "ok" : "danger"} />
    </div>
  );
}

function BudgetView({ projectId, setError }) {
  const [budgets, setBudgets] = useState([]);
  function load() { api.costControl.budgets(projectId).then(setBudgets).catch((e) => setError(e.message)); }
  useEffect(load, [projectId]);

  async function create(type) {
    try { await api.costControl.createBudget({ projectId, type }); load(); }
    catch (e) { setError(e.message); }
  }
  async function freeze(id) { try { await api.costControl.freezeBudget(id); load(); } catch (e) { setError(e.message); } }

  return (
    <div>
      <div className="register-toolbar">
        <button className="primary-button" onClick={() => create("original")}>Create Original Budget</button>
        <button className="secondary-button" onClick={() => create("revised")}>Create Revised Budget</button>
        <button className="secondary-button" onClick={() => create("approved")}>Create Approved Budget</button>
        <span className="import-hint">Budgets are generated from the project's approved estimate (cost engine).</span>
      </div>
      {budgets.length === 0 ? <p className="empty-state-small">No budgets yet.</p> : (
        <table className="catalog-grid">
          <thead><tr><th>Type</th><th>Version</th><th>Amount</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
          <tbody>
            {budgets.map((b) => (
              <tr key={b.id}>
                <td>{b.type}</td><td>v{b.version}</td><td>{money(b.amount)}</td>
                <td><span className={`status-badge ${b.status === "frozen" ? "status-archived" : "status-active"}`}>{b.status}</span></td>
                <td>{new Date(b.createdAt + "Z").toLocaleDateString()}</td>
                <td>{b.status !== "frozen" && <button className="link-button" onClick={() => freeze(b.id)}>Freeze</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function BvaView({ projectId }) {
  const [d, setD] = useState(null);
  useEffect(() => { api.costControl.budgetVsActual(projectId).then(setD).catch(() => {}); }, [projectId]);
  if (!d) return <Spinner label="Loading…" />;
  return (
    <table className="catalog-grid bva-table">
      <tbody>
        <tr><td>Original Budget</td><td className="num">{money(d.originalBudget)}</td></tr>
        <tr><td>Revised Budget (incl. approved VOs)</td><td className="num">{money(d.revisedBudget)}</td></tr>
        <tr className="bid-final-row"><td>Budget</td><td className="num">{money(d.budget)}</td></tr>
        <tr><td>Committed</td><td className="num">{money(d.committed)}</td></tr>
        <tr><td>Actual</td><td className="num">{money(d.actual)}</td></tr>
        <tr><td>Remaining</td><td className="num">{money(d.remaining)}</td></tr>
        <tr><td>Variance</td><td className="num">{money(d.variance)} ({d.variancePct != null ? d.variancePct.toFixed(1) : "—"}%)</td></tr>
      </tbody>
    </table>
  );
}

function CashFlowView({ projectId }) {
  const [d, setD] = useState(null);
  useEffect(() => { api.costControl.cashFlow(projectId).then(setD).catch(() => {}); }, [projectId]);
  if (!d) return <Spinner label="Loading…" />;
  return (
    <div>
      <p className="import-hint">S-curve of cumulative planned cost vs cumulative revenue over {d.months} months. BAC {money(d.BAC)}.</p>
      <ResponsiveContainer width="100%" height={360}>
        <LineChart data={d.series} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="month" tickFormatter={(m) => `M${m}`} />
          <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
          <Tooltip formatter={(v) => money(v)} />
          <Legend />
          <Line type="monotone" dataKey="cumulativeCost" name="Cumulative Cost (S-Curve)" stroke="#2f6feb" strokeWidth={2} />
          <Line type="monotone" dataKey="cumulativeRevenue" name="Cumulative Revenue" stroke="#1faa59" strokeWidth={2} />
          <Line type="monotone" dataKey="netCashFlow" name="Net Cash Flow" stroke="#e8893a" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function EvmView({ projectId }) {
  const [d, setD] = useState(null);
  useEffect(() => { api.costControl.earnedValue(projectId).then(setD).catch(() => {}); }, [projectId]);
  if (!d) return <Spinner label="Loading…" />;
  const rows = [
    ["BAC (Budget at Completion)", money(d.BAC)], ["% Complete", `${d.percentComplete}%`],
    ["PV (Planned Value)", money(d.PV)], ["EV (Earned Value)", money(d.EV)], ["AC (Actual Cost)", money(d.AC)],
    ["CV (Cost Variance)", money(d.CV)], ["SV (Schedule Variance)", money(d.SV)],
    ["CPI (Cost Performance)", d.CPI != null ? d.CPI.toFixed(3) : "—"], ["SPI (Schedule Performance)", d.SPI != null ? d.SPI.toFixed(3) : "—"],
    ["EAC (Estimate at Completion)", money(d.EAC)], ["ETC (Estimate to Complete)", money(d.ETC)], ["VAC (Variance at Completion)", money(d.VAC)],
  ];
  return (
    <table className="catalog-grid bva-table">
      <tbody>{rows.map(([k, v]) => <tr key={k}><td>{k}</td><td className="num">{v}</td></tr>)}</tbody>
    </table>
  );
}

// ── CRUD tables (reuse the generic RegisterTable) ──────────────────────────

function withProject(projectId, fields) {
  return fields.map((f) => f.key === "projectId" ? { ...f, defaultValue: projectId } : f);
}

const PO_FIELDS = [
  { key: "poNumber", label: "PO Number" }, { key: "supplier", label: "Supplier" }, { key: "wbs", label: "WBS" },
  { key: "amount", label: "Amount", type: "number", money: true }, { key: "poDate", label: "Date", type: "date" },
  { key: "deliveryDate", label: "Delivery Date", type: "date" }, { key: "status", label: "Status", options: ["open", "partial", "received", "cancelled"] },
  { key: "currency", label: "Currency" }, { key: "terms", label: "Terms" }, { key: "remarks", label: "Remarks", type: "textarea", span: true },
  { key: "projectId", label: "Project ID", type: "number" },
];
function PoTable({ projectId, setError }) { return <RegisterTable api={api.purchaseOrders} title="Purchase Order" fields={PO_FIELDS} columns={["poNumber", "supplier", "wbs", "amount", "status", "deliveryDate"]} setError={setError} fixed={{ projectId }} />; }

const SUB_FIELDS = [
  { key: "packageName", label: "Package Name", span: true }, { key: "contractAmount", label: "Contract Amount", type: "number", money: true },
  { key: "retentionPct", label: "Retention %", type: "number" }, { key: "advancePayment", label: "Advance Payment", type: "number", money: true },
  { key: "status", label: "Status", options: ["active", "completed", "cancelled"] }, { key: "remarks", label: "Remarks", type: "textarea", span: true },
  { key: "projectId", label: "Project ID", type: "number" },
];
function SubsTable({ projectId, setError }) { return <RegisterTable api={api.subcontracts} title="Subcontract" fields={SUB_FIELDS} columns={["packageName", "contractAmount", "retentionPct", "advancePayment", "status"]} setError={setError} fixed={{ projectId }} />; }

const VO_FIELDS = [
  { key: "voNumber", label: "VO Number" }, { key: "voType", label: "Type", options: ["client", "internal"] },
  { key: "nature", label: "Nature", options: ["additive", "deductive"] }, { key: "amount", label: "Amount", type: "number", money: true },
  { key: "status", label: "Status", options: ["pending", "approved", "rejected"] }, { key: "description", label: "Description", type: "textarea", span: true },
  { key: "projectId", label: "Project ID", type: "number" },
];
function VoTable({ projectId, setError }) { return <RegisterTable api={api.variationOrders} title="Variation Order" fields={VO_FIELDS} columns={["voNumber", "voType", "nature", "amount", "status"]} setError={setError} fixed={{ projectId }} />; }

const BILL_FIELDS = [
  { key: "billingNo", label: "Billing No." }, { key: "billingDate", label: "Date", type: "date" },
  { key: "percentComplete", label: "% Complete", type: "number" }, { key: "grossAmount", label: "Gross Amount", type: "number", money: true },
  { key: "retentionPct", label: "Retention %", type: "number" }, { key: "vatPct", label: "VAT %", type: "number" },
  { key: "previousBilling", label: "Previous Billing", type: "number", money: true }, { key: "status", label: "Status", options: ["draft", "submitted", "paid"] },
  { key: "projectId", label: "Project ID", type: "number" },
];
function BillingTable({ projectId, setError }) { return <RegisterTable api={api.progressBillings} title="Progress Billing" fields={BILL_FIELDS} columns={["billingNo", "billingDate", "percentComplete", "grossAmount", "status"]} setError={setError} fixed={{ projectId }} />; }

const ACTUAL_FIELDS = [
  { key: "category", label: "Category", options: ["material", "labor", "equipment", "subcontract", "other", "generalRequirements"] },
  { key: "description", label: "Description", span: true }, { key: "amount", label: "Amount", type: "number", money: true },
  { key: "costDate", label: "Date", type: "date" }, { key: "projectId", label: "Project ID", type: "number" },
];
function ActualsTable({ projectId, setError }) { return <RegisterTable api={api.actualCosts} title="Actual Cost" fields={ACTUAL_FIELDS} columns={["category", "description", "amount", "costDate"]} setError={setError} fixed={{ projectId }} />; }
