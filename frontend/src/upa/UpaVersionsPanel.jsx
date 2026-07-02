import { useEffect, useState } from "react";
import { api } from "../api";
import { money } from "../utils";

// Historical unit rates + side-by-side version comparison.
export default function UpaVersionsPanel({ upaId, onClose }) {
  const [versions, setVersions] = useState([]);
  const [compare, setCompare] = useState([]); // up to 2 selected version ids

  useEffect(() => { api.upa.versions(upaId).then(setVersions).catch(() => {}); }, [upaId]);

  function toggleCompare(id) {
    setCompare((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id].slice(-2);
    });
  }

  const selected = versions.filter((v) => compare.includes(v.id));

  return (
    <div className="upa-versions-panel">
      <div className="upa-versions-head">
        <h4>Versions & Historical Unit Rates</h4>
        <button className="link-button" onClick={onClose}>✕ Close</button>
      </div>
      {versions.length === 0 ? (
        <p className="empty-state-small">No versions snapshotted yet. Use "Snapshot Version" to freeze the current state.</p>
      ) : (
        <table className="upa-versions-table">
          <thead>
            <tr><th>Compare</th><th>Version</th><th>Revision</th><th>Date</th><th>Note</th><th>Unit Rate</th></tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id}>
                <td><input type="checkbox" checked={compare.includes(v.id)} onChange={() => toggleCompare(v.id)} /></td>
                <td>v{v.version}</td>
                <td>Rev {v.revision}</td>
                <td>{new Date(v.createdAt).toLocaleDateString()}</td>
                <td>{v.note || "—"}</td>
                <td>{money(v.totals?.unitRate ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selected.length === 2 && (
        <div className="upa-compare">
          <h5>Comparison</h5>
          <table className="upa-versions-table">
            <thead>
              <tr><th>Metric</th><th>v{selected[0].version}</th><th>v{selected[1].version}</th><th>Δ</th></tr>
            </thead>
            <tbody>
              {["materialCost", "laborCost", "equipmentCost", "directCost", "unitRate"].map((k) => {
                const a = selected[0].totals?.[k] ?? 0;
                const b = selected[1].totals?.[k] ?? 0;
                return (
                  <tr key={k}>
                    <td>{k}</td><td>{money(a)}</td><td>{money(b)}</td>
                    <td className={b - a > 0 ? "delta-up" : b - a < 0 ? "delta-down" : ""}>{money(b - a)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
