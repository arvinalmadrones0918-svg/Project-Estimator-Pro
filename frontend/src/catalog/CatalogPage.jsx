import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Spinner from "../components/Spinner";
import ErrorBanner from "../components/ErrorBanner";
import ConfirmDialog from "../components/ConfirmDialog";
import CatalogFilters from "./CatalogFilters";
import CatalogForm from "./CatalogForm";
import PriceHistoryPanel from "./PriceHistoryPanel";
import BulkUpdateModal from "./BulkUpdateModal";
import ImportModal from "./ImportModal";
import { money, formatDate } from "../utils";

const PAGE_SIZE_OPTIONS = [25, 50, 100, 250];

const COLUMNS = [
  { key: "code", label: "Code", width: 90 },
  { key: "name", label: "Name / Description", width: 220 },
  { key: "category", label: "Category", width: 130 },
  { key: "subcategory", label: "Subcategory", width: 130 },
  { key: "supplier", label: "Supplier", width: 140 },
  { key: "unit", label: "Unit", width: 70 },
  { key: "_price", label: "Unit Cost", width: 100 },
  { key: "currency", label: "Currency", width: 80 },
  { key: "isActive", label: "Status", width: 80 },
  { key: "updatedAt", label: "Modified", width: 110 },
];

/**
 * Generic master-catalog page shared by all 5 catalog types.
 *
 * Props:
 *  title       - page heading (e.g. "Materials Catalog")
 *  api         - catalog API object from catalogApi.js
 *  priceField  - DB price column ("unitPrice" or "hourlyRate")
 *  priceLabel  - UI label for that field ("Unit Cost" or "Hourly Rate")
 *  hasUnit     - whether this catalog type has a unit column
 */
export default function CatalogPage({ title, api, priceField, priceLabel = "Unit Cost", hasUnit = true, extraFields = [] }) {
  // ── Data state ─────────────────────────────────────────────────────────────
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ── Filter / sort / page state ─────────────────────────────────────────────
  const [filters, setFilters] = useState({ status: "active", page: 1, limit: 50, sort: "name", order: "asc" });
  const [filterOptions, setFilterOptions] = useState({ categories: [], suppliers: [], units: [] });

  // ── Selection ──────────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState(new Set());

  // ── UI panels ──────────────────────────────────────────────────────────────
  const [formItem, setFormItem] = useState(null);  // null=closed, {}=new, {id,...}=edit
  const [showForm, setShowForm] = useState(false);
  const [historyItem, setHistoryItem] = useState(null);
  const [showBulk, setShowBulk] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  // ── Debounced search ───────────────────────────────────────────────────────
  const searchTimerRef = useRef(null);
  const [pendingFilters, setPendingFilters] = useState(filters);

  function handleFiltersChange(next) {
    setPendingFilters(next);
    // Instant for non-search changes; debounced 300ms for q
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (next.q !== pendingFilters.q) {
      searchTimerRef.current = setTimeout(() => setFilters(next), 300);
    } else {
      setFilters(next);
    }
  }

  // ── Keyboard navigation ────────────────────────────────────────────────────
  const [focusedRow, setFocusedRow] = useState(-1);

  useEffect(() => {
    function onKeyDown(e) {
      if (showForm || showBulk || showImport || confirmDelete) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setFocusedRow((r) => Math.min(r + 1, items.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setFocusedRow((r) => Math.max(r - 1, 0)); }
      if (e.key === "Enter" && focusedRow >= 0) { openEdit(items[focusedRow]); }
      if (e.key === "Escape") { setFocusedRow(-1); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [items, focusedRow, showForm, showBulk, showImport, confirmDelete]);

  // ── Load data ──────────────────────────────────────────────────────────────
  const load = useCallback(() => {
    setLoading(true);
    setSelectedIds(new Set());
    api.list({ ...filters, page: filters.page ?? 1 })
      .then((data) => {
        if (Array.isArray(data)) {
          // Legacy (no pagination) — shouldn't happen with new routes
          setItems(data);
          setTotal(data.length);
        } else {
          setItems(data.items ?? []);
          setTotal(data.total ?? 0);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [filters]);

  useEffect(load, [load]);

  useEffect(() => {
    api.filters().then(setFilterOptions).catch(() => {});
  }, [items]); // refresh dropdown options after any mutation

  // ── Sort ───────────────────────────────────────────────────────────────────
  function toggleSort(col) {
    const next =
      filters.sort === col
        ? { ...filters, order: filters.order === "asc" ? "desc" : "asc", page: 1 }
        : { ...filters, sort: col, order: "asc", page: 1 };
    setFilters(next);
    setPendingFilters(next);
  }

  function sortIndicator(col) {
    if (filters.sort !== col) return null;
    return <span className="sort-indicator">{filters.order === "asc" ? " ▲" : " ▼"}</span>;
  }

  // ── Selection ──────────────────────────────────────────────────────────────
  function toggleAll() {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((i) => i.id)));
    }
  }

  function toggleOne(id) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────
  function openNew() { setFormItem({}); setShowForm(true); }
  function openEdit(item) { setFormItem(item); setShowForm(true); }

  async function handleSave(payload) {
    if (formItem?.id) {
      await api.update(formItem.id, payload);
    } else {
      await api.create(payload);
    }
    load();
    api.filters().then(setFilterOptions).catch(() => {});
  }

  async function handleDuplicate(item) {
    try { await api.duplicate(item.id); load(); }
    catch (e) { setError(e.message); }
  }

  async function handleDeactivate(item) {
    try {
      await (item.isActive ? api.deactivate(item.id) : api.activate(item.id));
      load();
    } catch (e) { setError(e.message); }
  }

  async function handleDelete(item) {
    try { await api.remove(item.id); setConfirmDelete(null); load(); }
    catch (e) { setError(e.message); }
  }

  async function handleRestore(item) {
    try { await api.restore(item.id); load(); }
    catch (e) { setError(e.message); }
  }

  async function handleBulkApply({ action, value }) {
    await api.bulk({ ids: [...selectedIds], action, value });
    setSelectedIds(new Set());
    load();
  }

  // ── Export ─────────────────────────────────────────────────────────────────
  function doExport(format) {
    const url = api.exportUrl({ ...filters, limit: 100000, page: 1 }, format);
    const a = document.createElement("a");
    a.href = url;
    a.download = `catalog.${format}`;
    a.click();
  }

  // ── Pagination ─────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(total / (filters.limit ?? 50)));
  const currentPage = filters.page ?? 1;

  function goPage(p) {
    const next = { ...filters, page: Math.max(1, Math.min(p, totalPages)) };
    setFilters(next);
    setPendingFilters(next);
  }

  // ── Visible columns (hide unit col if not applicable) ─────────────────────
  const visibleColumns = useMemo(
    () => COLUMNS.filter((c) => c.key !== "unit" || hasUnit),
    [hasUnit]
  );

  const allSelected = items.length > 0 && selectedIds.size === items.length;

  return (
    <div className="catalog-page">
      <ErrorBanner message={error} onDismiss={() => setError("")} />

      {/* ── Toolbar ─────────────────────────────────────── */}
      <div className="catalog-toolbar">
        <h2 className="catalog-title">{title}</h2>
        <div className="catalog-toolbar-actions">
          <button className="secondary-button" onClick={() => setShowImport(true)}>Import</button>
          <div className="export-dropdown">
            <button className="secondary-button" onClick={() => doExport("xlsx")}>Export Excel</button>
            <button className="secondary-button" onClick={() => doExport("csv")}>Export CSV</button>
          </div>
          <button className="primary-button" onClick={openNew}>+ New Item</button>
        </div>
      </div>

      <CatalogFilters
        filters={pendingFilters}
        filterOptions={filterOptions}
        onChange={handleFiltersChange}
      />

      {/* ── Bulk action bar ─────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="bulk-bar">
          <span>{selectedIds.size} selected</span>
          <button className="secondary-button" onClick={() => setShowBulk(true)}>Bulk Update…</button>
          <button className="link-button" onClick={() => setSelectedIds(new Set())}>Clear</button>
        </div>
      )}

      {/* ── Stats ───────────────────────────────────────── */}
      <div className="catalog-stats">
        <span>{total.toLocaleString()} record{total !== 1 ? "s" : ""}</span>
        <span className="catalog-stats-sep">·</span>
        <span>Page {currentPage} of {totalPages}</span>
        <span className="catalog-stats-sep">·</span>
        <label>
          Rows per page:
          <select
            value={filters.limit ?? 50}
            onChange={(e) => setFilters((f) => ({ ...f, limit: Number(e.target.value), page: 1 }))}
          >
            {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>

      {/* ── Data grid ───────────────────────────────────── */}
      <div className="catalog-grid-wrap">
        {loading ? (
          <Spinner label="Loading catalog…" />
        ) : items.length === 0 ? (
          <p className="empty-state">No items found. Adjust filters or create a new item.</p>
        ) : (
          <table className="catalog-grid" role="grid">
            <thead>
              <tr>
                <th className="col-check">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" />
                </th>
                {visibleColumns.map((col) => (
                  <th
                    key={col.key}
                    style={{ minWidth: col.width }}
                    className="sortable-col"
                    onClick={() => col.key !== "isActive" && col.key !== "_price" && col.key !== "currency" && toggleSort(col.key === "_price" ? priceField : col.key)}
                  >
                    {col.label}
                    {col.key !== "_price" && sortIndicator(col.key)}
                    {col.key === "_price" && sortIndicator(priceField)}
                  </th>
                ))}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, rowIndex) => (
                <tr
                  key={item.id}
                  className={[
                    selectedIds.has(item.id) ? "row-selected" : "",
                    focusedRow === rowIndex ? "row-focused" : "",
                    !item.isActive ? "row-inactive" : "",
                  ].filter(Boolean).join(" ")}
                  onClick={() => setFocusedRow(rowIndex)}
                  onDoubleClick={() => openEdit(item)}
                >
                  <td className="col-check" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleOne(item.id)}
                      aria-label={`Select ${item.name}`}
                    />
                  </td>
                  {visibleColumns.map((col) => {
                    if (col.key === "_price") return <td key={col.key}>{money(item[priceField])}</td>;
                    if (col.key === "isActive") return (
                      <td key={col.key}>
                        <span className={`status-badge ${item.isActive ? "status-active" : "status-archived"}`}>
                          {item.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                    );
                    if (col.key === "updatedAt") return <td key={col.key}>{formatDate(item.updatedAt)}</td>;
                    if (col.key === "name") return (
                      <td key={col.key}>
                        <button className="link-button" onClick={() => openEdit(item)}>{item.name}</button>
                        {item.description && <div className="item-description">{item.description}</div>}
                      </td>
                    );
                    return <td key={col.key}>{item[col.key] ?? "—"}</td>;
                  })}
                  <td className="catalog-row-actions">
                    <button className="link-button" onClick={() => openEdit(item)}>Edit</button>
                    <button className="link-button" onClick={() => handleDuplicate(item)}>Dup</button>
                    <button className="link-button" onClick={() => setHistoryItem(item)}>History</button>
                    <button
                      className="link-button"
                      onClick={() => handleDeactivate(item)}
                      title={item.isActive ? "Deactivate" : "Activate"}
                    >
                      {item.isActive ? "Deactivate" : "Activate"}
                    </button>
                    {item.deletedAt ? (
                      <button className="link-button" onClick={() => handleRestore(item)}>Restore</button>
                    ) : (
                      <button className="link-button danger" onClick={() => setConfirmDelete(item)}>Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Pagination ───────────────────────────────────── */}
      <div className="catalog-pagination">
        <button className="secondary-button" onClick={() => goPage(1)} disabled={currentPage === 1}>«</button>
        <button className="secondary-button" onClick={() => goPage(currentPage - 1)} disabled={currentPage === 1}>‹ Prev</button>
        <span className="pagination-info">Page {currentPage} / {totalPages}</span>
        <button className="secondary-button" onClick={() => goPage(currentPage + 1)} disabled={currentPage >= totalPages}>Next ›</button>
        <button className="secondary-button" onClick={() => goPage(totalPages)} disabled={currentPage >= totalPages}>»</button>
      </div>

      {/* ── Price history panel ──────────────────────────── */}
      {historyItem && (
        <PriceHistoryPanel
          item={historyItem}
          priceField={priceField}
          api={api}
          onClose={() => setHistoryItem(null)}
        />
      )}

      {/* ── Modals ──────────────────────────────────────── */}
      {showForm && (
        <CatalogForm
          item={formItem}
          priceField={priceField}
          priceLabel={priceLabel}
          hasUnit={hasUnit}
          extraFields={extraFields}
          onSave={handleSave}
          onClose={() => setShowForm(false)}
        />
      )}

      {showBulk && (
        <BulkUpdateModal
          selectedIds={[...selectedIds]}
          onApply={handleBulkApply}
          onClose={() => setShowBulk(false)}
        />
      )}

      {showImport && (
        <ImportModal
          api={api}
          priceField={priceField}
          onDone={load}
          onClose={() => setShowImport(false)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete Item"
          message={`Soft-delete "${confirmDelete.name}"? It will be hidden from the catalog but can be restored.`}
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => handleDelete(confirmDelete)}
        />
      )}
    </div>
  );
}
