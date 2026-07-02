import { useEffect, useState, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import { api } from "../api";
import { money } from "../utils";
import Spinner from "../components/Spinner";
import ErrorBanner from "../components/ErrorBanner";
import ConfirmDialog from "../components/ConfirmDialog";
import UpaResourceGrid from "./UpaResourceGrid";
import UpaVersionsPanel from "./UpaVersionsPanel";
import UpaDashboard from "./UpaDashboard";

// Master/detail Rate Analysis library: list of UPAs on the left, a full
// spreadsheet editor for the selected UPA on the right.
export default function UpaPage() {
  const [list, setList] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [q, setQ] = useState("");
  const [tradeFilter, setTradeFilter] = useState("");
  const [filters, setFilters] = useState({ trades: [], categories: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [view, setView] = useState("library"); // "library" | "dashboard"
  const fileRef = useRef(null);

  const loadList = useCallback(() => {
    setLoading(true);
    api.upa.list({ q, trade: tradeFilter })
      .then((data) => {
        setList(data);
        if (!selectedId && data.length) setSelectedId(data[0].id);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [q, tradeFilter]);

  useEffect(() => { const t = setTimeout(loadList, 200); return () => clearTimeout(t); }, [loadList]);
  useEffect(() => { api.upa.filters().then(setFilters).catch(() => {}); }, [list]);

  const loadDetail = useCallback(() => {
    if (!selectedId) { setDetail(null); return; }
    api.upa.get(selectedId).then(setDetail).catch((e) => setError(e.message));
  }, [selectedId]);

  useEffect(loadDetail, [loadDetail]);

  async function handleCreate() {
    try {
      const created = await api.upa.create({ description: "New Unit Price Analysis", unit: "unit" });
      setSelectedId(created.id);
      loadList();
    } catch (e) { setError(e.message); }
  }

  async function handleDuplicate(id) {
    try { const dup = await api.upa.duplicate(id); setSelectedId(dup.id); loadList(); }
    catch (e) { setError(e.message); }
  }

  async function handleDelete(u) {
    try {
      await api.upa.remove(u.id);
      setConfirmDelete(null);
      if (selectedId === u.id) setSelectedId(null);
      loadList();
    } catch (e) { setError(e.message); }
  }

  async function toggleFavorite(e, u) {
    e.stopPropagation();
    try { await api.upa.favorite(u.id); loadList(); if (u.id === selectedId) loadDetail(); }
    catch (err) { setError(err.message); }
  }

  function exportFile(kind) {
    const rows = list.map((u) => ({
      Code: u.code, Description: u.description, Category: u.category, Subcategory: u.subcategory,
      Unit: u.unit, Trade: u.trade, Revision: u.revision, Status: u.status,
      UnitRate: u.unitRate, Favorite: u.isFavorite ? "Yes" : "No", Remarks: u.remarks,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "RateAnalysis");
    if (kind === "json") {
      const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "rate-analysis.json"; a.click();
      URL.revokeObjectURL(a.href);
      return;
    }
    XLSX.writeFile(wb, `rate-analysis.${kind}`);
  }

  async function importFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      let inRows;
      if (file.name.endsWith(".json")) {
        inRows = JSON.parse(await file.text());
      } else {
        const wb = XLSX.read(await file.arrayBuffer());
        inRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      }
      for (const r of inRows) {
        await api.upa.create({
          code: r.Code ?? r.code ?? null,
          description: r.Description ?? r.description ?? "Imported Rate Analysis",
          category: r.Category ?? r.category ?? null,
          subcategory: r.Subcategory ?? r.subcategory ?? null,
          unit: r.Unit ?? r.unit ?? "unit",
          trade: r.Trade ?? r.trade ?? null,
          remarks: r.Remarks ?? r.remarks ?? null,
        });
      }
      loadList();
    } catch (err) { setError(err.message); }
    finally { if (fileRef.current) fileRef.current.value = ""; }
  }

  function refreshAfterChange() {
    loadDetail();
    loadList();
  }

  return (
    <div className="upa-page">
      <ErrorBanner message={error} onDismiss={() => setError("")} />
      <div className="catalog-toolbar">
        <h2 className="catalog-title">Rate Analysis Library</h2>
        <div className="catalog-toolbar-actions">
          <button className={view === "library" ? "primary-button" : "secondary-button"} onClick={() => setView("library")}>Library</button>
          <button className={view === "dashboard" ? "primary-button" : "secondary-button"} onClick={() => setView("dashboard")}>Dashboard</button>
          <button className="secondary-button" onClick={() => exportFile("xlsx")}>Export Excel</button>
          <button className="secondary-button" onClick={() => exportFile("csv")}>Export CSV</button>
          <button className="secondary-button" onClick={() => exportFile("json")}>Export JSON</button>
          <label className="secondary-button matlib-import">Import<input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.json" hidden onChange={importFile} /></label>
          <button className="primary-button" onClick={handleCreate}>+ New Rate Analysis</button>
        </div>
      </div>

      {view === "dashboard" && (
        <UpaDashboard onOpen={(id) => { setSelectedId(id); setView("library"); }} setError={setError} />
      )}

      {view === "library" && (
      <div className="upa-layout">
        {/* ── Library list ─────────────────────────── */}
        <aside className="upa-list">
          <input className="catalog-search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={tradeFilter} onChange={(e) => setTradeFilter(e.target.value)}>
            <option value="">All Trades</option>
            {filters.trades.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          {loading ? <Spinner label="Loading…" /> : list.length === 0 ? (
            <p className="empty-state-small">No UPA records.</p>
          ) : (
            <ul className="upa-list-items">
              {list.map((u) => (
                <li
                  key={u.id}
                  className={u.id === selectedId ? "active" : ""}
                  onClick={() => setSelectedId(u.id)}
                >
                  <div className="upa-list-code">
                    <span
                      className="upa-fav"
                      title={u.isFavorite ? "Unfavorite" : "Favorite"}
                      onClick={(e) => toggleFavorite(e, u)}
                      style={{ cursor: "pointer", marginRight: 4 }}
                    >{u.isFavorite ? "★" : "☆"}</span>
                    {u.code || "(no code)"}
                  </div>
                  <div className="upa-list-desc">{u.description}</div>
                  <div className="upa-list-rate">{money(u.unitRate)}/{u.unit}</div>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* ── Editor ───────────────────────────────── */}
        <section className="upa-editor">
          {!detail ? (
            <p className="empty-state">Select a UPA from the list, or create a new one.</p>
          ) : (
            <UpaEditor
              detail={detail}
              onChange={refreshAfterChange}
              onDuplicate={() => handleDuplicate(detail.id)}
              onDelete={() => setConfirmDelete(detail)}
              setError={setError}
            />
          )}
        </section>
      </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete UPA"
          message={`Delete "${confirmDelete.description}"? It will be hidden but inserted estimates keep their frozen rate.`}
          confirmLabel="Delete" danger
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => handleDelete(confirmDelete)}
        />
      )}
    </div>
  );
}

// ── UPA header + resource grid + regional factors + calculated rate ─────────

const HEAD_FIELDS = [
  { key: "code", label: "Code" },
  { key: "description", label: "Description", span: true },
  { key: "trade", label: "Trade" },
  { key: "category", label: "Category" },
  { key: "subcategory", label: "Subcategory" },
  { key: "unit", label: "Unit" },
];

const REGIONAL_FIELDS = [
  { key: "locationAdjustment", label: "Location Adjustment (×)", step: "0.01" },
  { key: "regionalMultiplier", label: "Regional Multiplier (×)", step: "0.01" },
  { key: "transportation", label: "Transportation (+)", step: "0.01" },
  { key: "mobilization", label: "Mobilization (+)", step: "0.01" },
];

function UpaEditor({ detail, onChange, onDuplicate, onDelete, setError }) {
  const [head, setHead] = useState(detail);
  const [snapshotting, setSnapshotting] = useState(false);
  const [showVersions, setShowVersions] = useState(false);

  useEffect(() => { setHead(detail); }, [detail.id, detail.updatedAt]);

  async function saveHead(patch) {
    try {
      const updated = await api.upa.update(detail.id, { ...head, ...patch });
      setHead(updated);
      onChange();
    } catch (e) { setError(e.message); }
  }

  async function handleSnapshot() {
    setSnapshotting(true);
    try {
      const note = window.prompt("Version note (optional):") ?? "";
      await api.upa.createVersion(detail.id, note);
      onChange();
    } catch (e) { setError(e.message); }
    finally { setSnapshotting(false); }
  }

  const calc = detail.calc;

  return (
    <div className="upa-editor-inner">
      <div className="upa-editor-head-bar">
        <div>
          <strong>{head.code || "(no code)"}</strong> · Rev {detail.revision} · v{detail.version}
          <span className={`status-badge ${detail.status === "active" ? "status-active" : "status-archived"}`} style={{ marginLeft: 8 }}>
            {detail.status}
          </span>
        </div>
        <div className="upa-editor-actions">
          <button className="secondary-button" onClick={() => setShowVersions((v) => !v)}>Versions</button>
          <button className="secondary-button" onClick={handleSnapshot} disabled={snapshotting}>📸 Snapshot Version</button>
          <button className="secondary-button" onClick={onDuplicate}>Duplicate</button>
          <button className="danger-button" onClick={onDelete}>Delete</button>
        </div>
      </div>

      {/* Header fields */}
      <div className="upa-head-grid">
        {HEAD_FIELDS.map((f) => (
          <label key={f.key} className={f.span ? "span-2" : ""}>
            {f.label}
            <input
              value={head[f.key] ?? ""}
              onChange={(e) => setHead({ ...head, [f.key]: e.target.value })}
              onBlur={(e) => e.target.value !== detail[f.key] && saveHead({ [f.key]: e.target.value })}
            />
          </label>
        ))}
        <label>
          Status
          <select value={head.status} onChange={(e) => saveHead({ status: e.target.value })}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <label className="span-2">
          Remarks
          <input
            value={head.remarks ?? ""}
            onChange={(e) => setHead({ ...head, remarks: e.target.value })}
            onBlur={(e) => e.target.value !== detail.remarks && saveHead({ remarks: e.target.value })}
          />
        </label>
      </div>

      {showVersions && <UpaVersionsPanel upaId={detail.id} onClose={() => setShowVersions(false)} />}

      {/* Resource spreadsheet */}
      <UpaResourceGrid upaId={detail.id} resources={detail.resources} onChange={onChange} setError={setError} />

      {/* Regional factors */}
      <div className="upa-regional">
        <h4>Regional Factors</h4>
        <div className="upa-regional-grid">
          {REGIONAL_FIELDS.map((f) => (
            <label key={f.key}>
              {f.label}
              <input
                type="number"
                step={f.step}
                value={head[f.key] ?? ""}
                onChange={(e) => setHead({ ...head, [f.key]: e.target.value })}
                onBlur={(e) => Number(e.target.value) !== detail[f.key] && saveHead({ [f.key]: Number(e.target.value) })}
              />
            </label>
          ))}
        </div>
      </div>

      {/* Calculated unit rate */}
      {calc && (
        <div className="upa-rate-summary">
          <div className="upa-rate-breakdown">
            <div><span>Material</span><strong>{money(calc.materialCost)}</strong></div>
            <div><span>Labor</span><strong>{money(calc.laborCost)}</strong></div>
            <div><span>Equipment</span><strong>{money(calc.equipmentCost)}</strong></div>
            <div><span>Subcontract</span><strong>{money(calc.subcontractCost)}</strong></div>
            <div><span>Other</span><strong>{money(calc.otherCost)}</strong></div>
            <div><span>Direct Cost</span><strong>{money(calc.directCost)}</strong></div>
          </div>
          <div className="upa-unit-rate">
            <span>UNIT RATE / {detail.unit}</span>
            <strong>{money(calc.unitRate)}</strong>
          </div>
        </div>
      )}
    </div>
  );
}
