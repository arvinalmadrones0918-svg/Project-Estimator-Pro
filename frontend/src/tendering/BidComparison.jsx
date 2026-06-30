import { useEffect, useState } from "react";
import { api } from "../api";
import { money } from "../utils";
import Spinner from "../components/Spinner";

const METRIC_LABELS = {
  directCost: "Direct Cost",
  indirectTotal: "Indirect Costs",
  subtotal: "Subtotal",
  vatTotal: "VAT",
  bidPrice: "Bid Price",
  discountTotal: "Discount",
  finalTenderPrice: "Final Tender Price",
};

// Side-by-side scenario comparison (Original / Revised / VE / Tender), with
// differences vs the first column highlighted. Totals come from the engine.
export default function BidComparison({ setError }) {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.projects.list().then((p) => { setProjects(p); if (p.length) setProjectId(String(p[0].id)); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    api.tendering.bidComparison(projectId).then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [projectId]);

  return (
    <div className="bid-comparison">
      <label className="bid-project-select">
        Project:
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>

      {loading ? <Spinner label="Comparing…" /> : !data ? null : (
        <table className="catalog-grid bid-table">
          <thead>
            <tr>
              <th>Metric</th>
              {data.columns.map((c) => <th key={c.id ?? "default"}>{c.name}<div className="bid-col-type">{c.type}</div></th>)}
            </tr>
          </thead>
          <tbody>
            {data.metrics.map((m) => (
              <tr key={m} className={m === "finalTenderPrice" ? "bid-final-row" : ""}>
                <td>{METRIC_LABELS[m] || m}</td>
                {data.columns.map((c, ci) => (
                  <td key={c.id ?? "default"} className="num">
                    {money(c.values[m])}
                    {ci > 0 && c.deltas[m] !== 0 && (
                      <span className={`bid-delta ${c.deltas[m] > 0 ? "up" : "down"}`}>
                        {c.deltas[m] > 0 ? "▲" : "▼"} {money(Math.abs(c.deltas[m]))}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
