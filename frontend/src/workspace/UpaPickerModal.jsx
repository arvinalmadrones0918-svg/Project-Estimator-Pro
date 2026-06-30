import { useEffect, useState } from "react";
import { api } from "../api";
import Modal from "../components/Modal";
import { money } from "../utils";

// Picks a Unit Price Analysis to insert into a work module. Inserting freezes
// the UPA's current rate (handled server-side).
export default function UpaPickerModal({ onInsert, onClose }) {
  const [list, setList] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.upa.list({ q, status: "active" }).then(setList).finally(() => setLoading(false));
  }, [q]);

  return (
    <Modal title="Insert Unit Price Analysis" onClose={onClose} width={720}>
      <input
        className="catalog-search"
        placeholder="Search UPA by code or description…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
        style={{ marginBottom: "0.75rem", width: "100%" }}
      />
      {loading ? <p className="empty-state-small">Loading…</p> : list.length === 0 ? (
        <p className="empty-state-small">No UPA records found. Create some in the Rate Analysis tab.</p>
      ) : (
        <table className="catalog-grid">
          <thead><tr><th>Code</th><th>Description</th><th>Trade</th><th>Unit</th><th>Unit Rate</th><th></th></tr></thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id}>
                <td>{u.code || "—"}</td>
                <td>{u.description}</td>
                <td>{u.trade || "—"}</td>
                <td>{u.unit}</td>
                <td>{money(u.unitRate)}</td>
                <td><button className="primary-button" onClick={() => onInsert(u)}>Insert</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
