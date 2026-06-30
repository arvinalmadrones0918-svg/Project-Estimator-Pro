import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { api } from "../api";
import ErrorBanner from "../components/ErrorBanner";

const STEPS = ["Upload", "Preview", "Map Columns", "Validation", "Duplicates", "Import"];

const IMPORT_OPTIONS = [
  { value: "append", label: "Append (insert all valid rows)" },
  { value: "updateExisting", label: "Update Existing (match unique key)" },
  { value: "ignoreDuplicates", label: "Ignore Duplicates (insert new only)" },
  { value: "replace", label: "Replace (soft-delete existing, then insert)" },
];

export default function ExcelPage() {
  const [mode, setMode] = useState("import");
  return (
    <div className="excel-page">
      <div className="catalog-toolbar"><h2 className="catalog-title">Excel Import &amp; Export</h2></div>
      <nav className="proc-tabs">
        <button className={mode === "import" ? "active" : ""} onClick={() => setMode("import")}>Import</button>
        <button className={mode === "export" ? "active" : ""} onClick={() => setMode("export")}>Export</button>
      </nav>
      {mode === "import" ? <ImportWizard /> : <ExportPanel />}
    </div>
  );
}

function ImportWizard() {
  const [entities, setEntities] = useState([]);
  const [entity, setEntity] = useState("materials");
  const [step, setStep] = useState(0);
  const [rawRows, setRawRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({});
  const [preview, setPreview] = useState(null);
  const [option, setOption] = useState("append");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  useEffect(() => { api.excel.entities().then(setEntities).catch((e) => setError(e.message)); }, []);

  const entityDef = entities.find((e) => e.key === entity);

  function reset() { setStep(0); setRawRows([]); setHeaders([]); setMapping({}); setPreview(null); setResult(null); }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      if (!rows.length) { setError("No data rows found."); return; }
      setRawRows(rows);
      setHeaders(Object.keys(rows[0]));
      // Auto-map: match field label/key to a header (case-insensitive).
      const autoMap = {};
      const hs = Object.keys(rows[0]);
      for (const f of entityDef?.fields || []) {
        const hit = hs.find((h) => h.toLowerCase() === f.label.toLowerCase() || h.toLowerCase() === f.key.toLowerCase());
        if (hit) autoMap[f.key] = hit;
      }
      setMapping(autoMap);
      setStep(1);
    } catch (err) { setError(err.message); }
  }

  async function runValidation() {
    try {
      const p = await api.excel.preview(entity, rawRows, mapping);
      setPreview(p);
      setStep(3);
    } catch (e) { setError(e.message); }
  }

  async function downloadErrorReport() {
    const res = await fetch(`/api/excel/error-report/${entity}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: rawRows, mapping }),
    });
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${entity}-errors.xlsx`;
    a.click();
  }

  async function commit() {
    try {
      const r = await api.excel.commit(entity, rawRows, mapping, option);
      setResult(r);
      setStep(5);
    } catch (e) { setError(e.message); }
  }

  return (
    <div className="import-wizard">
      <ErrorBanner message={error} onDismiss={() => setError("")} />

      <div className="wizard-steps">
        {STEPS.map((s, i) => (
          <div key={s} className={`wizard-step ${i === step ? "active" : ""} ${i < step ? "done" : ""}`}>
            <span className="wizard-step-num">{i + 1}</span>{s}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="wizard-body">
          <label>Entity to Import
            <select value={entity} onChange={(e) => { setEntity(e.target.value); reset(); }}>
              {entities.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
            </select>
          </label>
          <p className="import-hint">
            Required columns: {(entityDef?.fields || []).filter((f) => f.required).map((f) => f.label).join(", ") || "none"}.
            {" "}<a href={api.excel.templateUrl(entity)}>Download template</a>
          </p>
          <label className="import-file-label">
            <span className="primary-button">Choose Excel / CSV File</span>
            <input ref={fileRef} type="file" accept=".xlsx,.csv,.xls" onChange={handleFile} style={{ display: "none" }} />
          </label>
        </div>
      )}

      {step === 1 && (
        <div className="wizard-body">
          <p>{rawRows.length} rows parsed. Columns: {headers.join(", ")}</p>
          <PreviewTable rows={rawRows.slice(0, 20)} headers={headers} />
          <div className="modal-actions">
            <button className="secondary-button" onClick={reset}>Back</button>
            <button className="primary-button" onClick={() => setStep(2)}>Next: Map Columns</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="wizard-body">
          <h4>Map Columns</h4>
          <table className="map-table">
            <thead><tr><th>Field</th><th>Required</th><th>Source Column</th></tr></thead>
            <tbody>
              {(entityDef?.fields || []).map((f) => (
                <tr key={f.key}>
                  <td>{f.label}</td>
                  <td>{f.required ? "Yes" : ""}</td>
                  <td>
                    <select value={mapping[f.key] ?? ""} onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value })}>
                      <option value="">— not mapped —</option>
                      {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="modal-actions">
            <button className="secondary-button" onClick={() => setStep(1)}>Back</button>
            <button className="primary-button" onClick={runValidation}>Next: Validate</button>
          </div>
        </div>
      )}

      {step === 3 && preview && (
        <div className="wizard-body">
          <div className="import-summary">
            <span className="import-stat new">{preview.summary.ok} valid</span>
            <span className="import-stat dup">{preview.summary.duplicates} duplicates</span>
            <span className="import-stat" style={{ color: "var(--danger)" }}>{preview.summary.errors} errors</span>
          </div>
          {preview.summary.errors > 0 && (
            <button className="secondary-button" onClick={downloadErrorReport}>Download Error Report</button>
          )}
          <div className="import-table-wrap">
            <table className="import-preview-table">
              <thead><tr><th>Row</th><th>Status</th><th>Problems</th></tr></thead>
              <tbody>
                {preview.rows.filter((r) => r.status !== "ok").slice(0, 100).map((r) => (
                  <tr key={r.rowIndex} className={r.status === "error" ? "import-dup-row" : ""}>
                    <td>{r.rowIndex}</td>
                    <td><span className={r.status === "error" ? "import-dup-badge" : "import-new-badge"}>{r.status}</span></td>
                    <td>{r.problems.map((p) => `${p.column}: ${p.problem}`).join("; ") || "—"}</td>
                  </tr>
                ))}
                {preview.rows.every((r) => r.status === "ok") && <tr><td colSpan={3} className="empty-state-small">All rows valid.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="modal-actions">
            <button className="secondary-button" onClick={() => setStep(2)}>Back</button>
            <button className="primary-button" onClick={() => setStep(4)}>Next: Duplicates</button>
          </div>
        </div>
      )}

      {step === 4 && preview && (
        <div className="wizard-body">
          <h4>Duplicate Detection &amp; Import Options</h4>
          <p>{preview.summary.duplicates} row(s) match existing records. Choose how to handle the import:</p>
          <div className="import-dup-options">
            {IMPORT_OPTIONS.map((o) => (
              <label key={o.value}>
                <input type="radio" name="opt" checked={option === o.value} onChange={() => setOption(o.value)} /> {o.label}
              </label>
            ))}
          </div>
          <div className="modal-actions">
            <button className="secondary-button" onClick={() => setStep(3)}>Back</button>
            <button className="primary-button" onClick={commit}>Import {preview.summary.total} rows</button>
          </div>
        </div>
      )}

      {step === 5 && result && (
        <div className="wizard-body">
          <div className="import-done-stats">
            <div className="import-stat-card"><strong>{result.inserted}</strong><span>Inserted</span></div>
            <div className="import-stat-card"><strong>{result.updated}</strong><span>Updated</span></div>
            <div className="import-stat-card"><strong>{result.skipped}</strong><span>Skipped</span></div>
            <div className="import-stat-card"><strong>{result.errors}</strong><span>Errors</span></div>
          </div>
          <div className="modal-actions">
            <button className="primary-button" onClick={reset}>Import Another File</button>
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewTable({ rows, headers }) {
  return (
    <div className="import-table-wrap">
      <table className="import-preview-table">
        <thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => <tr key={i}>{headers.map((h) => <td key={h}>{String(r[h] ?? "")}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

function ExportPanel() {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.projects.list().then((p) => { setProjects(p); if (p.length) setProjectId(String(p[0].id)); }).catch((e) => setError(e.message));
  }, []);

  // Report exports reuse the existing /api/reports/export endpoints.
  const REPORTS = [
    { key: "boq", label: "BOQ", needsProject: true },
    { key: "detailed-estimate", label: "Detailed Estimate", needsProject: true },
    { key: "cost-breakdown", label: "Cost Breakdown", needsProject: true },
    { key: "material-summary", label: "Material Summary", needsProject: true },
    { key: "labor-summary", label: "Labor Summary", needsProject: true },
    { key: "equipment-summary", label: "Equipment Summary", needsProject: true },
    { key: "assembly-summary", label: "Assembly Summary", needsProject: true },
    { key: "upa-report", label: "UPA", needsProject: false },
    { key: "procurement-summary", label: "Procurement Summary", needsProject: false },
    { key: "supplier-comparison", label: "Supplier Comparison", needsProject: false },
    { key: "project-cost-summary", label: "Project Summary", needsProject: true },
  ];

  function reportUrl(key, format) {
    return `/api/reports/export/${key}${key && projectId ? `?projectId=${projectId}&format=${format}` : `?format=${format}`}`;
  }

  return (
    <div className="export-panel">
      <ErrorBanner message={error} onDismiss={() => setError("")} />
      <label className="bid-project-select">Project:
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>

      <div className="export-grid">
        <a className="export-card multi" href={api.excel.summaryWorkbookUrl(projectId)} download>
          <strong>📊 Summary Workbook</strong>
          <span>Multi-sheet: BOQ, cost breakdown, all summaries</span>
        </a>
        {REPORTS.map((r) => (
          <div key={r.key} className="export-card">
            <strong>{r.label}</strong>
            <div className="export-card-actions">
              <a className="link-button" href={reportUrl(r.key, "xlsx")} download>Excel</a>
              <a className="link-button" href={reportUrl(r.key, "csv")} download>CSV</a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
