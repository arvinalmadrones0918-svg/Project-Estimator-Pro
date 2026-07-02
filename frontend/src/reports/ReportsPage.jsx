import { useEffect, useState } from "react";
import { api } from "../api";
import { money } from "../utils";
import Spinner from "../components/Spinner";
import ErrorBanner from "../components/ErrorBanner";
import ReportView from "./ReportView";

const GROUP_OPTIONS = [
  { value: "wbs", label: "WBS" },
  { value: "trade", label: "Trade" },
  { value: "category", label: "Category" },
  { value: "subcategory", label: "Subcategory" },
  { value: "project", label: "Project" },
];

const INCLUDE_TYPES = [
  { key: "material", label: "Materials" },
  { key: "labor", label: "Labor" },
  { key: "equipment", label: "Equipment" },
  { key: "subcontract", label: "Subcontract" },
  { key: "other", label: "Other Costs" },
  { key: "assembly", label: "Assemblies" },
  { key: "upa", label: "Unit Price Analysis" },
];

const PAGE_SIZES = ["A4", "Letter", "Legal"];

export default function ReportsPage({ initialProjectId } = {}) {
  const [types, setTypes] = useState([]);
  const [projects, setProjects] = useState([]);
  const [reportType, setReportType] = useState("boq");
  const [projectId, setProjectId] = useState(initialProjectId ? String(initialProjectId) : "");
  const [groupBy, setGroupBy] = useState("wbs");
  const [useMarkup, setUseMarkup] = useState(true);
  const [include, setInclude] = useState(() => Object.fromEntries(INCLUDE_TYPES.map((t) => [t.key, true])));
  const [filters, setFilters] = useState({ status: "", trade: "" });
  const [pageSize, setPageSize] = useState("A4");
  const [landscape, setLandscape] = useState(false);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [templates, setTemplates] = useState([]);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    api.reports.types().then(setTypes).catch((e) => setError(e.message));
    api.projects.list().then((p) => { setProjects(p); if (p.length && !projectId) setProjectId(String(initialProjectId || p[0].id)); }).catch(() => {});
    api.reports.templates().then(setTemplates).catch(() => {});
  }, []);

  const meta = types.find((t) => t.key === reportType);
  const needsProject = meta?.needsProject;

  function buildParams(record) {
    return {
      projectId: needsProject ? projectId : undefined,
      groupBy,
      useMarkup,
      include: JSON.stringify(include),
      filters: JSON.stringify(filters),
      ...(record ? { record: "true", generatedBy: "estimator" } : {}),
    };
  }

  async function runReport() {
    if (needsProject && !projectId) { setError("Select a project."); return; }
    setLoading(true);
    setError("");
    try {
      const data = await api.reports.generate(reportType, buildParams(true));
      setReport(data);
      if (needsProject) api.reports.history(projectId).then(setHistory).catch(() => {});
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  function doExport(format) {
    const url = api.reports.exportUrl(reportType, buildParams(false), format);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${reportType}.${format}`;
    a.click();
  }

  async function saveTemplate() {
    const name = window.prompt("Template name:");
    if (!name) return;
    try {
      await api.reports.saveTemplate({ name, reportType, config: { groupBy, useMarkup, include, filters, pageSize, landscape } });
      api.reports.templates().then(setTemplates);
    } catch (e) { setError(e.message); }
  }

  function applyTemplate(t) {
    setReportType(t.reportType);
    const c = t.config || {};
    if (c.groupBy) setGroupBy(c.groupBy);
    if (c.include) setInclude(c.include);
    if (c.filters) setFilters(c.filters);
    if (c.pageSize) setPageSize(c.pageSize);
    if (typeof c.landscape === "boolean") setLandscape(c.landscape);
    if (typeof c.useMarkup === "boolean") setUseMarkup(c.useMarkup);
  }

  return (
    <div className="reports-page">
      <ErrorBanner message={error} onDismiss={() => setError("")} />

      {/* ── Controls (hidden when printing) ─────────────── */}
      <div className="reports-controls">
        <div className="catalog-toolbar">
          <h2 className="catalog-title">Reports</h2>
        </div>

        <div className="reports-config">
          <label>
            Report Type
            <select value={reportType} onChange={(e) => setReportType(e.target.value)}>
              {types.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </label>

          {needsProject && (
            <label>
              Project
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          )}

          {(reportType === "boq" || reportType === "detailed-estimate") && (
            <label>
              Group By
              <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
                {GROUP_OPTIONS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </label>
          )}

          <label>
            Status Filter
            <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">All</option>
              <option value="included">Included</option>
              <option value="pending">Pending</option>
              <option value="excluded">Excluded</option>
            </select>
          </label>

          <label>
            Page Size
            <select value={pageSize} onChange={(e) => setPageSize(e.target.value)}>
              {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="checkbox-label">
            <input type="checkbox" checked={landscape} onChange={(e) => setLandscape(e.target.checked)} /> Landscape
          </label>
          <label className="checkbox-label">
            <input type="checkbox" checked={useMarkup} onChange={(e) => setUseMarkup(e.target.checked)} /> Apply Markup
          </label>
        </div>

        {(reportType === "boq" || reportType === "detailed-estimate") && (
          <div className="reports-include">
            <span className="reports-include-label">Include:</span>
            {INCLUDE_TYPES.map((t) => (
              <label key={t.key} className="checkbox-label">
                <input type="checkbox" checked={!!include[t.key]} onChange={(e) => setInclude({ ...include, [t.key]: e.target.checked })} />
                {t.label}
              </label>
            ))}
          </div>
        )}

        <div className="reports-actions">
          <button className="primary-button" onClick={runReport}>Generate</button>
          {report && <>
            <button className="secondary-button" onClick={() => window.print()}>Print / PDF</button>
            <button className="secondary-button" onClick={() => doExport("xlsx")}>Export Excel</button>
            <button className="secondary-button" onClick={() => doExport("csv")}>Export CSV</button>
            <button className="secondary-button" onClick={saveTemplate}>Save Template</button>
          </>}
        </div>

        {templates.length > 0 && (
          <div className="reports-templates">
            <span>Templates:</span>
            {templates.map((t) => (
              <button key={t.id} className="link-button" onClick={() => applyTemplate(t)}>{t.name}</button>
            ))}
          </div>
        )}

        {history.length > 0 && (
          <details className="reports-history">
            <summary>Revision History ({history.length})</summary>
            <table className="reports-history-table">
              <thead><tr><th>Report</th><th>Rev</th><th>By</th><th>Date</th></tr></thead>
              <tbody>
                {history.slice(0, 10).map((h) => (
                  <tr key={h.id}><td>{h.reportType}</td><td>{h.revision ?? "—"}</td><td>{h.generatedBy || "—"}</td><td>{new Date(h.createdAt).toLocaleString()}</td></tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </div>

      {/* ── Preview / print area ────────────────────────── */}
      {loading ? <Spinner label="Generating report…" /> : report ? (
        <div className={`report-paper size-${pageSize} ${landscape ? "landscape" : "portrait"}`}>
          <style>{`@page { size: ${pageSize} ${landscape ? "landscape" : "portrait"}; }`}</style>
          <ReportView report={report} project={projects.find((p) => String(p.id) === String(projectId))} />
        </div>
      ) : (
        <p className="empty-state">Configure and generate a report.</p>
      )}
    </div>
  );
}
