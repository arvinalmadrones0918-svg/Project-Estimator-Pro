import { useEffect, useState } from "react";
import { api } from "../api";

// Phase 11 (Production) — System settings, database backup and import/export,
// added to the Administration page (no redesign of the existing UI).

const SETTINGS_FIELDS = [
  ["systemName", "System Name", "text"],
  ["companyLogo", "Company Logo URL", "text"],
  ["baseCurrency", "Currency Code", "text"],
  ["currencySymbol", "Currency Symbol", "text"],
  ["defaultTaxRate", "Default Tax Rate %", "number"],
  ["taxLabel", "Tax Label", "text"],
  ["units", "Units (metric/imperial)", "text"],
  ["dateFormat", "Date Format", "text"],
  ["numberFormat", "Number Format", "text"],
  ["decimalPlaces", "Decimal Places", "number"],
];

export function SettingsTab({ setError }) {
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { api.settings.get().then(setForm).catch((e) => setError(e.message)); }, []);
  if (!form) return <p className="empty-state">Loading settings…</p>;
  async function save() {
    try { const r = await api.settings.save(form); setForm(r); setSaved(true); setTimeout(() => setSaved(false), 1500); }
    catch (e) { setError(e.message); }
  }
  return (
    <div>
      <p className="proc-hint">General preferences, company logo, currency, tax, units, date and number formats.</p>
      <div className="org-company-form">
        {SETTINGS_FIELDS.map(([key, label, type]) => (
          <label key={key}>{label}
            <input type={type} value={form[key] ?? ""} onChange={(e) => setForm({ ...form, [key]: type === "number" ? Number(e.target.value) : e.target.value })} />
          </label>
        ))}
        {form.companyLogo ? <div className="sys-logo-preview"><img src={form.companyLogo} alt="Logo preview" /></div> : null}
        <div className="org-actions">
          <button className="primary-button" onClick={save}>Save Settings</button>
          {saved && <span className="org-saved">✓ Saved</span>}
        </div>
      </div>
    </div>
  );
}

export function BackupTab({ setError }) {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  function load() { api.admin.backups().then(setRows).catch((e) => setError(e.message)); }
  useEffect(load, []);
  async function backup() {
    setBusy(true);
    try { await api.admin.createBackup({ note: "Manual backup" }); load(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function restore(id) {
    if (!window.confirm("Restore this backup? This overwrites the live database. A safety copy is taken first, and the server must be restarted afterwards.")) return;
    try { const r = await api.admin.restoreBackup(id); window.alert(r.message || "Restored."); }
    catch (e) { setError(e.message); }
  }
  return (
    <div>
      <div className="cc-actions">
        <button className="primary-button" onClick={backup} disabled={busy}>{busy ? "Backing up…" : "+ Create Manual Backup"}</button>
        <span className="proc-hint">Automatic backups can be scheduled via BACKUP_DIR + scripts/backup.sh (see DEPLOYMENT.md).</span>
      </div>
      <table className="proc-table">
        <thead><tr><th>File</th><th>Kind</th><th>Size</th><th>Created</th><th></th></tr></thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id}>
              <td>{b.fileName}</td><td>{b.kind}</td><td>{(b.sizeBytes / 1024).toFixed(0)} KB</td>
              <td>{new Date(b.createdAt).toLocaleString()}</td>
              <td>
                <a className="link-button" href={api.admin.backupDownloadUrl(b.id)}>Download</a>
                <button className="link-button danger" onClick={() => restore(b.id)}>Restore</button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5} className="empty-state">No backups yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

const EXPORT_SCOPES = [
  ["database", "Entire Database"], ["catalogs", "Catalogs"], ["users", "Users"], ["organization", "Organization"],
];

export function DataTab({ setError }) {
  const [result, setResult] = useState("");
  function download(scope) { window.location.href = api.admin.exportUrl(scope); }
  async function onImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const r = await api.admin.import(payload);
      setResult(`Imported ${r.inserted} rows.`);
    } catch (err) { setError(`Import failed: ${err.message}`); }
    e.target.value = "";
  }
  return (
    <div>
      <h4>Export (JSON)</h4>
      <p className="proc-hint">Download a JSON snapshot. Excel / CSV export for individual reports and catalogs is available in the Reports and Excel modules.</p>
      <div className="cc-actions">
        {EXPORT_SCOPES.map(([scope, label]) => (
          <button key={scope} className="secondary-button" onClick={() => download(scope)}>Export {label}</button>
        ))}
      </div>
      <h4>Import (JSON)</h4>
      <p className="proc-hint">Import a previously exported bundle. Existing rows are preserved (insert-or-ignore).</p>
      <label className="secondary-button proc-upload">
        Choose JSON file…
        <input type="file" accept="application/json,.json" onChange={onImport} hidden />
      </label>
      {result && <span className="org-saved" style={{ marginLeft: "0.75rem" }}>{result}</span>}
    </div>
  );
}

export function ApiDocsTab() {
  return (
    <div>
      <p className="proc-hint">Interactive API documentation (Swagger UI) and the raw OpenAPI 3.0 specification.</p>
      <div className="cc-actions">
        <a className="primary-button" href={api.admin.docsUrl()} target="_blank" rel="noreferrer">Open Swagger UI ↗</a>
        <a className="secondary-button" href={api.admin.openapiUrl()} target="_blank" rel="noreferrer">OpenAPI JSON ↗</a>
      </div>
    </div>
  );
}
