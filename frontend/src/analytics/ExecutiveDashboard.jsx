import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { money } from "../utils";
import Spinner from "../components/Spinner";
import ErrorBanner from "../components/ErrorBanner";
import AnimatedNumber from "./AnimatedNumber";
import {
  PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from "recharts";

const COLORS = ["#2f6feb", "#e8893a", "#1faa59", "#9b51e0", "#e0455f", "#5bc0de", "#f5a623"];
const LIGHT = { green: "#1faa59", yellow: "#e8893a", red: "#e0455f" };

export default function ExecutiveDashboard({ onOpenProject }) {
  const [data, setData] = useState(null);
  const [filterOpts, setFilterOpts] = useState({ estimators: [], clients: [], years: [], statuses: [], workflowStatuses: [] });
  const [filters, setFilters] = useState({});
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef(null);

  const load = useCallback(() => {
    api.analytics.all(filters).then(setData).catch((e) => setError(e.message));
  }, [filters]);

  useEffect(load, [load]);
  useEffect(() => { api.analytics.filters().then(setFilterOpts).catch(() => {}); }, []);
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [autoRefresh, load]);

  function setFilter(k, v) { setFilters((f) => ({ ...f, [k]: v || undefined })); }

  function exportPng() {
    // Serialize the first chart SVG to a PNG download.
    const svg = rootRef.current?.querySelector(".recharts-surface");
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = svg.clientWidth || 600; canvas.height = svg.clientHeight || 400;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = "dashboard-chart.png";
      a.click();
    };
    img.src = url;
  }

  if (!data) return <Spinner label="Loading executive dashboard…" />;

  const { executive: ex, health, cost, procurement, tender, resources, portfolio, kpi } = data;

  const resourceData = [
    { name: "Material", value: resources.material }, { name: "Labor", value: resources.labor },
    { name: "Equipment", value: resources.equipment }, { name: "Subcontract", value: resources.subcontract },
    { name: "Other", value: resources.other }, { name: "General Reqs", value: resources.generalRequirements },
  ].filter((d) => d.value > 0);

  const tenderData = [
    { name: "Won", value: tender.won }, { name: "Lost", value: tender.lost },
    { name: "Submitted", value: tender.submitted }, { name: "Pending", value: tender.pending },
  ].filter((d) => d.value > 0);

  const costWaterfall = [
    { name: "Budget", value: cost.budget }, { name: "Committed", value: cost.committed },
    { name: "Actual", value: cost.actual }, { name: "Forecast", value: cost.forecast },
    { name: "Remaining", value: cost.remaining },
  ];

  return (
    <div className="exec-dashboard" ref={rootRef}>
      <ErrorBanner message={error} onDismiss={() => setError("")} />
      <div className="exec-toolbar">
        <h2 className="catalog-title">Executive Dashboard</h2>
        <div className="exec-actions">
          <label className="exec-refresh"><input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} /> Auto-refresh</label>
          <button className="secondary-button" onClick={load}>↻ Refresh</button>
          <button className="secondary-button" onClick={() => window.print()}>Print / PDF</button>
          <button className="secondary-button" onClick={exportPng}>Export PNG</button>
          <a className="secondary-button" href="/api/reports/export/cc-forecast?projectId=&format=xlsx" onClick={(e) => { if (!filters.projectId) e.preventDefault(); }} title="Pick a project filter to export its forecast">Excel</a>
        </div>
      </div>

      {/* Filters */}
      <div className="exec-filters">
        <select value={filters.estimator || ""} onChange={(e) => setFilter("estimator", e.target.value)}><option value="">All Estimators</option>{filterOpts.estimators.map((x) => <option key={x}>{x}</option>)}</select>
        <select value={filters.client || ""} onChange={(e) => setFilter("client", e.target.value)}><option value="">All Clients</option>{filterOpts.clients.map((x) => <option key={x}>{x}</option>)}</select>
        <select value={filters.year || ""} onChange={(e) => setFilter("year", e.target.value)}><option value="">All Years</option>{filterOpts.years.map((x) => <option key={x}>{x}</option>)}</select>
        <select value={filters.status || ""} onChange={(e) => setFilter("status", e.target.value)}><option value="">All Statuses</option>{filterOpts.statuses.map((x) => <option key={x}>{x}</option>)}</select>
        {Object.keys(filters).some((k) => filters[k]) && <button className="link-button" onClick={() => setFilters({})}>Clear filters</button>}
      </div>

      {/* Executive KPI cards */}
      <div className="exec-kpi-grid">
        <KpiCard label="Active Projects" value={ex.activeProjects} raw />
        <KpiCard label="Completed" value={ex.completedProjects} raw />
        <KpiCard label="Tender Value" value={ex.tenderValue} money accent="blue" />
        <KpiCard label="Awarded Value" value={ex.awardedValue} money accent="blue" />
        <KpiCard label="Revenue" value={ex.currentRevenue} money accent="green" />
        <KpiCard label="Cost" value={ex.currentCost} money accent="orange" />
        <KpiCard label="Profit" value={ex.currentProfit} money accent={ex.currentProfit >= 0 ? "green" : "red"} />
        <KpiCard label="Cash Flow" value={ex.cashFlow} money accent={ex.cashFlow >= 0 ? "green" : "red"} />
        <KpiCard label="Outstanding POs" value={ex.outstandingPurchaseOrders.count} raw />
        <KpiCard label="Outstanding RFQs" value={ex.outstandingRFQs} raw />
        <KpiCard label="Pending Approvals" value={ex.pendingApprovals} raw accent="orange" />
        <KpiCard label="Delayed Projects" value={ex.delayedProjects} raw accent={ex.delayedProjects ? "red" : undefined} />
      </div>

      <div className="exec-charts-grid">
        {/* Cost dashboard (bar) */}
        <Panel title="Cost Dashboard">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={costWaterfall}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="name" /><YAxis tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} /><Tooltip formatter={(v) => money(v)} /><Bar dataKey="value">{costWaterfall.map((d, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar></BarChart>
          </ResponsiveContainer>
          <div className="exec-mini-metrics"><span>Margin: <strong>{cost.margin}%</strong></span><span>Variance: <strong>{money(cost.variance)}</strong></span></div>
        </Panel>

        {/* Resource distribution (donut) */}
        <Panel title="Resource Distribution">
          {resourceData.length === 0 ? <p className="empty-state-small">No cost data.</p> : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart><Pie data={resourceData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} label={({ name, percent }) => `${name.split(" ")[0]} ${(percent*100).toFixed(0)}%`}>{resourceData.map((d, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip formatter={(v) => money(v)} /></PieChart>
            </ResponsiveContainer>
          )}
        </Panel>

        {/* Tender (pie) */}
        <Panel title="Tender Dashboard">
          {tenderData.length === 0 ? <p className="empty-state-small">No tenders.</p> : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart><Pie data={tenderData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>{tenderData.map((d, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /></PieChart>
            </ResponsiveContainer>
          )}
          <div className="exec-mini-metrics"><span>Success Rate: <strong>{tender.successRate}%</strong></span><span>Avg Margin: <strong>{tender.avgBidMargin}%</strong></span></div>
        </Panel>

        {/* Portfolio (bar) */}
        <Panel title="Top Projects by Profit">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={portfolio.topProfitable} layout="vertical" margin={{ left: 20 }}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis type="number" tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} /><YAxis type="category" dataKey="name" width={120} /><Tooltip formatter={(v) => money(v)} /><Bar dataKey="profit" fill="#1faa59" /></BarChart>
          </ResponsiveContainer>
        </Panel>

        {/* Procurement (bar) */}
        <Panel title="Procurement">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={[{ name: "Pending RFQ", value: procurement.pendingRFQ }, { name: "Quoted", value: procurement.quoted }, { name: "Awarded", value: procurement.awarded }, { name: "Expired", value: procurement.expired }]}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="name" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="value" fill="#9b51e0" /></BarChart>
          </ResponsiveContainer>
        </Panel>

        {/* KPI center */}
        <Panel title="KPI Center">
          <div className="kpi-center-grid">
            {[["CPI", kpi.CPI], ["SPI", kpi.SPI], ["Profit %", kpi.profitPct], ["Markup %", kpi.markupPct], ["Overhead %", kpi.overheadPct], ["Material %", kpi.materialPct], ["Labor %", kpi.laborPct], ["Equipment %", kpi.equipmentPct], ["GR %", kpi.grPct], ["Forecast Margin", kpi.forecastMargin]].map(([k, v]) => (
              <div key={k} className="kpi-center-item"><span>{k}</span><strong>{v != null ? v : "—"}</strong></div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Project health traffic lights (heat-map style grid) */}
      <Panel title="Project Health">
        <table className="health-table">
          <thead><tr><th>Project</th><th>Score</th><th>Overall</th><th>Budget</th><th>Procurement</th><th>Cash Flow</th><th>Profit</th><th>Risk</th><th>Margin</th></tr></thead>
          <tbody>
            {health.map((h) => (
              <tr key={h.id} className="health-row" onClick={() => onOpenProject?.(h.id)} title="Click to open project">
                <td>{h.name}</td>
                <td><strong>{h.healthScore}</strong></td>
                {["overall", "budget", "procurement", "cashFlow", "profit", "risk"].map((d) => (
                  <td key={d}><span className="health-dot" style={{ background: LIGHT[h[d]] }} title={h[d]} /></td>
                ))}
                <td>{h.margin}%</td>
              </tr>
            ))}
            {health.length === 0 && <tr><td colSpan={9} className="empty-state-small">No projects in scope.</td></tr>}
          </tbody>
        </table>
      </Panel>

      <p className="calc-meta">Updated {new Date(data.generatedAt).toLocaleString()} · all figures from the cost engine.</p>
    </div>
  );
}

function KpiCard({ label, value, money: isMoney, raw, accent }) {
  return (
    <div className={`exec-kpi-card ${accent || ""}`}>
      <div className="exec-kpi-value">
        {isMoney ? <>$<AnimatedNumber value={value} format={(v) => v.toLocaleString(undefined, { maximumFractionDigits: 0 })} /></> : <AnimatedNumber value={value} />}
      </div>
      <div className="exec-kpi-label">{label}</div>
    </div>
  );
}

function Panel({ title, children }) {
  return <div className="exec-panel"><h3>{title}</h3>{children}</div>;
}
