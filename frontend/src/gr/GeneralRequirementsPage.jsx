import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import Spinner from "../components/Spinner";
import ErrorBanner from "../components/ErrorBanner";
import ConfirmDialog from "../components/ConfirmDialog";
import GrItemGrid from "./GrItemGrid";
import GrSummary from "./GrSummary";
import GrStaffModal from "./GrStaffModal";

const PARAMS = [
  { key: "durationDays", label: "Duration (days)" },
  { key: "workingDays", label: "Working Days" },
  { key: "calendarMonths", label: "Calendar Months" },
  { key: "projectArea", label: "Project Area" },
  { key: "buildingCount", label: "Buildings" },
  { key: "floorCount", label: "Floors" },
  { key: "projectValue", label: "Project Value" },
  { key: "personnelCount", label: "Personnel" },
  { key: "inflation", label: "Inflation %" },
  { key: "escalation", label: "Escalation %" },
];

export default function GeneralRequirementsPage() {
  const [sheets, setSheets] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [calc, setCalc] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showStaff, setShowStaff] = useState(false);

  const loadSheets = useCallback(() => {
    setLoading(true);
    api.gr.sheets().then((s) => { setSheets(s); if (!selectedId && s.length) setSelectedId(s[0].id); })
      .catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [selectedId]);

  useEffect(() => { loadSheets(); }, []);
  useEffect(() => { api.gr.templates().then(setTemplates).catch(() => {}); }, []);

  const loadDetail = useCallback(() => {
    if (!selectedId) { setDetail(null); setCalc(null); return; }
    api.gr.sheet(selectedId).then((d) => { setDetail(d); setCalc(d.calc); }).catch((e) => setError(e.message));
  }, [selectedId]);

  useEffect(loadDetail, [loadDetail]);

  function refresh() {
    api.gr.sheet(selectedId).then((d) => { setDetail(d); setCalc(d.calc); }).catch((e) => setError(e.message));
  }

  async function createSheet() {
    const name = window.prompt("General Requirements sheet name:");
    if (!name) return;
    try { const s = await api.gr.createSheet({ name }); setSelectedId(s.id); loadSheets(); }
    catch (e) { setError(e.message); }
  }

  async function duplicateSheet() {
    try { const s = await api.gr.duplicateSheet(selectedId); setSelectedId(s.id); loadSheets(); }
    catch (e) { setError(e.message); }
  }

  async function deleteSheet(s) {
    try { await api.gr.removeSheet(s.id); setConfirmDelete(null); if (selectedId === s.id) setSelectedId(null); loadSheets(); }
    catch (e) { setError(e.message); }
  }

  async function saveParam(key, value) {
    try { const updated = await api.gr.updateSheet(selectedId, { [key]: Number(value) || 0 }); setDetail((d) => ({ ...d, ...updated })); refresh(); }
    catch (e) { setError(e.message); }
  }

  async function applyTemplate(templateId) {
    if (!templateId) return;
    try { await api.gr.applyTemplate(selectedId, templateId); refresh(); }
    catch (e) { setError(e.message); }
  }

  return (
    <div className="gr-page">
      <ErrorBanner message={error} onDismiss={() => setError("")} />
      <div className="catalog-toolbar">
        <h2 className="catalog-title">General Requirements Builder</h2>
        <div className="catalog-toolbar-actions">
          <button className="secondary-button" onClick={() => setShowStaff(true)}>Staff Library</button>
          <button className="primary-button" onClick={createSheet}>+ New Sheet</button>
        </div>
      </div>

      <div className="gr-layout">
        <aside className="gr-sheets-list">
          {loading ? <Spinner label="Loading…" /> : sheets.length === 0 ? (
            <p className="empty-state-small">No GR sheets yet.</p>
          ) : (
            <ul className="upa-list-items">
              {sheets.map((s) => (
                <li key={s.id} className={s.id === selectedId ? "active" : ""} onClick={() => setSelectedId(s.id)}>
                  <div className="upa-list-desc">{s.name}</div>
                  {s.projectId && <div className="upa-list-code">Project #{s.projectId}</div>}
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="gr-editor">
          {!detail ? (
            <p className="empty-state">Select or create a General Requirements sheet.</p>
          ) : (
            <>
              <div className="gr-editor-head">
                <h3>{detail.name}</h3>
                <div className="gr-editor-actions">
                  <select defaultValue="" onChange={(e) => { applyTemplate(e.target.value); e.target.value = ""; }}>
                    <option value="">Apply Template…</option>
                    {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.itemCount})</option>)}
                  </select>
                  <button className="secondary-button" onClick={duplicateSheet}>Duplicate</button>
                  <button className="danger-button" onClick={() => setConfirmDelete(detail)}>Delete</button>
                </div>
              </div>

              {/* Project parameters */}
              <div className="gr-params">
                <h4>Project Parameters</h4>
                <div className="gr-params-grid">
                  {PARAMS.map((p) => (
                    <label key={p.key}>
                      {p.label}
                      <input
                        type="number" step="0.01"
                        defaultValue={detail[p.key]}
                        onBlur={(e) => Number(e.target.value) !== detail[p.key] && saveParam(p.key, e.target.value)}
                      />
                    </label>
                  ))}
                </div>
              </div>

              {/* Items grid by category */}
              <GrItemGrid sheetId={selectedId} items={detail.items} calc={calc} onChange={refresh} setError={setError} />

              {/* Summary + charts */}
              {calc && <GrSummary calc={calc} />}
            </>
          )}
        </section>
      </div>

      {showStaff && <GrStaffModal onClose={() => setShowStaff(false)} setError={setError} />}
      {confirmDelete && (
        <ConfirmDialog title="Delete GR Sheet" message={`Delete "${confirmDelete.name}"?`} confirmLabel="Delete" danger
          onCancel={() => setConfirmDelete(null)} onConfirm={() => deleteSheet(confirmDelete)} />
      )}
    </div>
  );
}
