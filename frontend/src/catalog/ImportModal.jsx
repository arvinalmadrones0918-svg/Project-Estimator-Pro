import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import Modal from "../components/Modal";
import { money } from "../utils";

export default function ImportModal({ api, priceField, onDone, onClose }) {
  const [step, setStep] = useState("upload"); // upload | preview | done
  const [preview, setPreview] = useState([]);
  const [mergeExisting, setMergeExisting] = useState(false);
  const [skipDuplicates, setSkipDuplicates] = useState({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      if (rows.length === 0) { setError("No data rows found in file."); return; }
      const previewRows = await api.importPreview(rows);
      setPreview(previewRows);
      setStep("preview");
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleConfirm() {
    setImporting(true);
    setError("");
    try {
      const rows = preview.map((r) => ({ ...r, _skip: !!skipDuplicates[r._rowIndex] && !mergeExisting }));
      const res = await api.importConfirm(rows, mergeExisting);
      setResult(res);
      setStep("done");
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  const duplicates = preview.filter((r) => r._duplicate);
  const newItems = preview.filter((r) => !r._duplicate);

  return (
    <Modal title="Import Catalog Items" onClose={onClose} width={720}>
      {error && <div className="error-banner" style={{ marginBottom: "0.75rem" }}>{error}</div>}

      {step === "upload" && (
        <div className="import-upload">
          <p className="import-hint">Upload an Excel (.xlsx) or CSV (.csv) file. Required column: <strong>name</strong>. Optional: code, category, subcategory, manufacturer, brand, supplier, unit, {priceField}, currency, remarks.</p>
          <label className="import-file-label">
            <span className="primary-button">Choose File</span>
            <input ref={fileRef} type="file" accept=".xlsx,.csv,.xls" onChange={handleFile} style={{ display: "none" }} />
          </label>
        </div>
      )}

      {step === "preview" && (
        <div className="import-preview">
          <div className="import-summary">
            <span className="import-stat new">{newItems.length} new items</span>
            <span className="import-stat dup">{duplicates.length} duplicates detected</span>
          </div>

          {duplicates.length > 0 && (
            <div className="import-dup-options">
              <label>
                <input type="radio" checked={!mergeExisting} onChange={() => setMergeExisting(false)} />
                {" "}Skip all duplicates
              </label>
              <label>
                <input type="radio" checked={mergeExisting} onChange={() => setMergeExisting(true)} />
                {" "}Merge / overwrite duplicates
              </label>
            </div>
          )}

          <div className="import-table-wrap">
            <table className="import-preview-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Code</th>
                  <th>Category</th>
                  <th>Supplier</th>
                  <th>Price</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 200).map((row) => (
                  <tr key={row._rowIndex} className={row._duplicate ? "import-dup-row" : ""}>
                    <td>{row.name}</td>
                    <td>{row.code || "—"}</td>
                    <td>{row.category || "—"}</td>
                    <td>{row.supplier || "—"}</td>
                    <td>{money(row[priceField] ?? 0)}</td>
                    <td>
                      {row._duplicate ? (
                        <span className="import-dup-badge" title={`Matches existing: ${row._duplicate.name}`}>
                          ⚠ Duplicate
                        </span>
                      ) : (
                        <span className="import-new-badge">✓ New</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.length > 200 && <p className="empty-state-small">Showing first 200 of {preview.length} rows.</p>}
          </div>

          <div className="modal-actions">
            <button className="secondary-button" onClick={() => { setStep("upload"); setPreview([]); }}>Back</button>
            <button className="primary-button" onClick={handleConfirm} disabled={importing}>
              {importing ? "Importing…" : `Import ${preview.length} rows`}
            </button>
          </div>
        </div>
      )}

      {step === "done" && result && (
        <div className="import-done">
          <div className="import-done-stats">
            <div className="import-stat-card">
              <strong>{result.inserted}</strong>
              <span>Inserted</span>
            </div>
            <div className="import-stat-card">
              <strong>{result.merged}</strong>
              <span>Merged</span>
            </div>
            <div className="import-stat-card">
              <strong>{result.skipped}</strong>
              <span>Skipped</span>
            </div>
          </div>
          <div className="modal-actions">
            <button className="primary-button" onClick={() => { onDone(); onClose(); }}>Done</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
