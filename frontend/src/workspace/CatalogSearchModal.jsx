import { useEffect, useRef, useState } from "react";
import Modal from "../components/Modal";
import { money } from "../utils";
import { catalogApis } from "../catalog/catalogApi";

const TABS = [
  { key: "material", label: "Materials", api: catalogApis.materials, priceField: "unitPrice", hasUnit: true },
  { key: "labor", label: "Labor", api: catalogApis.labor, priceField: "hourlyRate", hasUnit: false },
  { key: "equipment", label: "Equipment", api: catalogApis.equipment, priceField: "unitPrice", hasUnit: true },
  { key: "subcontract", label: "Subcontract", api: catalogApis.subcontract, priceField: "unitPrice", hasUnit: true },
  { key: "otherCost", label: "Other Costs", api: catalogApis["other-costs"], priceField: "unitPrice", hasUnit: true },
];

export default function CatalogSearchModal({ onInsert, onClose }) {
  const [activeTab, setActiveTab] = useState("material");
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const searchRef = useRef(null);
  const timerRef = useRef(null);

  const tab = TABS.find((t) => t.key === activeTab);

  useEffect(() => {
    searchRef.current?.focus();
  }, [activeTab]);

  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(doSearch, q ? 300 : 0);
    return () => clearTimeout(timerRef.current);
  }, [q, activeTab]);

  async function doSearch() {
    setLoading(true);
    setSelectedIds(new Set());
    try {
      const data = await tab.api.list({ q, limit: 50, status: "active" });
      setItems(Array.isArray(data) ? data : (data.items ?? []));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleInsert() {
    const toInsert = items.filter((it) => selectedIds.has(it.id));
    if (toInsert.length === 0) return;
    toInsert.forEach((it) => onInsert(activeTab, it));
    onClose();
  }

  function handleRowDoubleClick(it) {
    onInsert(activeTab, it);
    onClose();
  }

  return (
    <Modal title="Insert from Catalog" onClose={onClose} width={760}>
      <div className="catalog-search-modal">
        <div className="csm-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`csm-tab${activeTab === t.key ? " active" : ""}`}
              onClick={() => { setActiveTab(t.key); setQ(""); }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <input
          ref={searchRef}
          className="csm-search"
          placeholder={`Search ${tab.label.toLowerCase()}…`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <div className="csm-results">
          {loading ? (
            <p className="empty-state">Searching…</p>
          ) : items.length === 0 ? (
            <p className="empty-state">No items found.</p>
          ) : (
            <table className="csm-table">
              <thead>
                <tr>
                  <th style={{ width: 32 }}></th>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Category</th>
                  {tab.hasUnit && <th>Unit</th>}
                  <th>Price</th>
                  <th>Supplier</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr
                    key={it.id}
                    className={selectedIds.has(it.id) ? "row-selected" : ""}
                    onClick={() => toggleSelect(it.id)}
                    onDoubleClick={() => handleRowDoubleClick(it)}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(it.id)}
                        onChange={() => toggleSelect(it.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td>{it.code || "—"}</td>
                    <td>{it.name}</td>
                    <td>{it.category || "—"}</td>
                    {tab.hasUnit && <td>{it.unit || "—"}</td>}
                    <td>{money(it[tab.priceField] ?? 0)}</td>
                    <td>{it.supplier || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="modal-actions">
          <span className="csm-hint">Double-click to insert one • Select + Insert for multiple</span>
          <button className="secondary-button" onClick={onClose}>Cancel</button>
          <button
            className="primary-button"
            onClick={handleInsert}
            disabled={selectedIds.size === 0}
          >
            Insert {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
          </button>
        </div>
      </div>
    </Modal>
  );
}
