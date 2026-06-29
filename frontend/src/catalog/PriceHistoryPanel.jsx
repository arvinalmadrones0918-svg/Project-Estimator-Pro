import { useEffect, useState } from "react";
import { money, formatDate } from "../utils";

export default function PriceHistoryPanel({ item, priceField, api, onClose }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!item) return;
    setLoading(true);
    api.priceHistory(item.id)
      .then(setHistory)
      .finally(() => setLoading(false));
  }, [item?.id]);

  if (!item) return null;

  const trend = history.length >= 2
    ? history[0].newPrice > history[1].newPrice ? "up" : history[0].newPrice < history[1].newPrice ? "down" : "flat"
    : null;

  return (
    <div className="price-history-panel">
      <div className="price-history-header">
        <div>
          <h3 className="price-history-title">{item.name}</h3>
          <div className="price-history-current">
            Current: <strong>{money(item[priceField])}</strong>
            {trend === "up" && <span className="trend trend-up"> ▲ Rising</span>}
            {trend === "down" && <span className="trend trend-down"> ▼ Falling</span>}
            {trend === "flat" && <span className="trend trend-flat"> — Stable</span>}
          </div>
        </div>
        <button className="link-button" onClick={onClose} aria-label="Close">✕</button>
      </div>

      {loading ? (
        <p className="empty-state-small">Loading…</p>
      ) : history.length === 0 ? (
        <p className="empty-state-small">No price history yet.</p>
      ) : (
        <table className="price-history-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Previous</th>
              <th>New Price</th>
              <th>Change</th>
              <th>Updated By</th>
              <th>Supplier</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => {
              const diff = h.oldPrice != null ? h.newPrice - h.oldPrice : null;
              const pct = diff != null && h.oldPrice ? ((diff / h.oldPrice) * 100).toFixed(1) : null;
              return (
                <tr key={h.id}>
                  <td>{formatDate(h.effectiveDate)}</td>
                  <td>{h.oldPrice != null ? money(h.oldPrice) : "—"}</td>
                  <td><strong>{money(h.newPrice)}</strong></td>
                  <td>
                    {diff != null && (
                      <span className={diff > 0 ? "trend-up" : diff < 0 ? "trend-down" : ""}>
                        {diff > 0 ? "+" : ""}{money(diff)} {pct ? `(${diff > 0 ? "+" : ""}${pct}%)` : ""}
                      </span>
                    )}
                  </td>
                  <td>{h.updatedBy || "—"}</td>
                  <td>{h.supplier || "—"}</td>
                  <td>{h.notes || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
