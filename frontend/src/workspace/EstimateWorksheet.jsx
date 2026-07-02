import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { money, getActiveCurrency } from "../utils";
import Spinner from "../components/Spinner";
import EstimateContextMenu from "./EstimateContextMenu";
import InsertAssemblyModal from "./InsertAssemblyModal";

// Enterprise Estimate Worksheet — a spreadsheet over every work item in the
// project. Computed cost columns come from the cost engine (single source of
// truth); unit/quantity/markup/profit/remarks are editable annotations. Rows
// map to work modules, so all edits go through the existing modules API.

const ROW_H = 30;          // fixed row height for virtualization
const OVERSCAN = 8;

// Column definitions. `edit` marks user-editable cells; `num` right-aligns.
const COLUMNS = [
  { key: "itemNo", label: "Item No.", w: 70 },
  { key: "name", label: "Description", w: 240, edit: "text" },
  { key: "unit", label: "Unit", w: 70, edit: "text" },
  { key: "quantity", label: "Quantity", w: 90, edit: "num", num: true },
  { key: "material", label: "Material", w: 100, num: true },
  { key: "labor", label: "Labor", w: 100, num: true },
  { key: "equipment", label: "Equipment", w: 100, num: true },
  { key: "subcontract", label: "Subcontract", w: 100, num: true },
  { key: "other", label: "Other Cost", w: 100, num: true },
  { key: "directCost", label: "Direct Cost", w: 110, num: true },
  { key: "markupPct", label: "Markup %", w: 90, edit: "num", num: true },
  { key: "profitPct", label: "Profit %", w: 90, edit: "num", num: true },
  { key: "totalUnitCost", label: "Total Unit Cost", w: 120, num: true },
  { key: "totalCost", label: "Total Cost", w: 120, num: true },
  { key: "remarks", label: "Remarks", w: 160, edit: "text" },
];
const EDITABLE = COLUMNS.filter((c) => c.edit).map((c) => c.key);

export default function EstimateWorksheet({ projectId }) {
  const [rows, setRows] = useState(null);
  const [categories, setCategories] = useState([]);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState("saved"); // saved | saving | dirty
  const [filters, setFilters] = useState({ search: "", categoryId: "" });
  const [selected, setSelected] = useState(() => new Set());
  const [active, setActive] = useState(null); // { rowId, key }
  const [editing, setEditing] = useState(null); // { rowId, key, value }
  const [contextMenu, setContextMenu] = useState(null);
  const [assemblyTarget, setAssemblyTarget] = useState(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(600);
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const clipboard = useRef(null);
  const scrollRef = useRef(null);
  const saveTimer = useRef(null);

  // ── Data loading ───────────────────────────────────────────────────────────
  const load = useCallback(() => {
    Promise.all([
      api.modules.list({ projectId }),
      api.estimate.calculateProject(projectId),
      api.wbs.categories(),
    ]).then(([mods, calc, cats]) => {
      const byId = new Map(calc.modules.map((m) => [m.id, m]));
      const catName = new Map(cats.map((c) => [c.id, c.name]));
      const enriched = mods.map((m) => {
        const b = byId.get(m.id) || {};
        return {
          id: m.id, name: m.name, unit: m.unit || "",
          quantity: m.quantity ?? 1, markupPct: m.markupPct || 0, profitPct: m.profitPct || 0,
          remarks: m.remarks || "", wbsCategoryId: m.wbsCategoryId, wbsSubcategoryId: m.wbsSubcategoryId,
          sortOrder: m.sortOrder ?? 0, categoryName: catName.get(m.wbsCategoryId) || "Uncategorized",
          material: b.material || 0, labor: b.labor || 0, equipment: b.equipment || 0,
          subcontract: b.subcontract || 0, other: b.other || 0, directCost: b.directCost || 0,
        };
      });
      setRows(enriched);
      setCategories(cats);
      setSummary({ waterfall: calc.waterfall, directCostBreakdown: calc.directCostBreakdown });
    }).catch((e) => setError(e.message));
  }, [projectId]);
  useEffect(load, [load]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = () => setViewportH(el.clientHeight);
    ro();
    window.addEventListener("resize", ro);
    return () => window.removeEventListener("resize", ro);
  }, [rows]);

  // ── Derived rows (filters) + per-row computed columns ────────────────────────
  const displayRows = useMemo(() => {
    if (!rows) return [];
    const q = filters.search.trim().toLowerCase();
    return rows
      .filter((r) => (!filters.categoryId || String(r.wbsCategoryId) === filters.categoryId))
      .filter((r) => !q || [r.name, r.remarks, r.unit, r.categoryName].some((v) => (v || "").toLowerCase().includes(q)))
      .map((r, i) => {
        const qty = Number(r.quantity) || 0;
        const totalUnitCost = qty ? r.directCost / qty : r.directCost;
        return { ...r, itemNo: i + 1, totalUnitCost, totalCost: r.directCost };
      });
  }, [rows, filters]);

  // ── Persist an edited field (debounced auto-save) ────────────────────────────
  function persist(rowId, patch) {
    setSaveStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try { await api.modules.update(rowId, patch); setSaveStatus("saved"); }
      catch (e) { setError(e.message); setSaveStatus("dirty"); }
    }, 400);
  }

  function applyEdit(rowId, key, value, { record = true } = {}) {
    setRows((prev) => prev.map((r) => {
      if (r.id !== rowId) return r;
      if (record) {
        undoStack.current.push({ rowId, key, oldVal: r[key], newVal: value });
        redoStack.current = [];
      }
      return { ...r, [key]: value };
    }));
    persist(rowId, { [key]: value });
  }

  function commitEdit() {
    if (!editing) return;
    const col = COLUMNS.find((c) => c.key === editing.key);
    const value = col.edit === "num" ? (Number(editing.value) || 0) : editing.value;
    const cur = rows.find((r) => r.id === editing.rowId);
    if (cur && cur[editing.key] !== value) applyEdit(editing.rowId, editing.key, value);
    setEditing(null);
  }

  // ── Undo / redo ──────────────────────────────────────────────────────────────
  function undo() {
    const op = undoStack.current.pop();
    if (!op) return;
    redoStack.current.push(op);
    applyEdit(op.rowId, op.key, op.oldVal, { record: false });
  }
  function redo() {
    const op = redoStack.current.pop();
    if (!op) return;
    undoStack.current.push(op);
    applyEdit(op.rowId, op.key, op.newVal, { record: false });
  }

  // ── Row operations (via existing modules API) ────────────────────────────────
  async function insertRow(ref, where) {
    try {
      const created = await api.modules.create({
        name: "New Item", projectId,
        wbsCategoryId: ref?.wbsCategoryId ?? null, wbsSubcategoryId: ref?.wbsSubcategoryId ?? null,
      });
      await load();
      setActive({ rowId: created.id, key: "name" });
    } catch (e) { setError(e.message); }
  }
  async function deleteRows(ids) {
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} row(s)?`)) return;
    try { for (const id of ids) await api.modules.remove(id); setSelected(new Set()); load(); }
    catch (e) { setError(e.message); }
  }
  async function duplicateRow(row) { try { await api.modules.duplicate(row.id); load(); } catch (e) { setError(e.message); } }
  async function moveRow(row, dir) {
    const idx = rows.findIndex((r) => r.id === row.id);
    const swap = rows[idx + dir];
    if (!swap) return;
    try {
      await api.modules.update(row.id, { sortOrder: swap.sortOrder });
      await api.modules.update(swap.id, { sortOrder: row.sortOrder });
      load();
    } catch (e) { setError(e.message); }
  }
  async function indentRow(row) {
    const cat = categories.find((c) => c.id === row.wbsCategoryId);
    const sub = cat?.subcategories?.[0];
    if (!sub) return;
    try { await api.modules.update(row.id, { wbsSubcategoryId: sub.id }); load(); } catch (e) { setError(e.message); }
  }
  async function outdentRow(row) {
    try { await api.modules.update(row.id, { wbsSubcategoryId: null }); load(); } catch (e) { setError(e.message); }
  }
  async function convertToAssembly(row) {
    try { await api.modules.convertToAssembly(row.id); window.alert(`"${row.name}" saved to Cost Assemblies.`); }
    catch (e) { setError(e.message); }
  }

  // ── Keyboard handling on the grid ────────────────────────────────────────────
  function onKeyDown(e) {
    if (editing) return; // inputs handle their own keys
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); return; }
    if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
    if (mod && e.key.toLowerCase() === "c") { copyActive(); return; }
    if (mod && e.key.toLowerCase() === "v") { pasteActive(); return; }
    if (!active) return;
    const rowIdx = displayRows.findIndex((r) => r.id === active.rowId);
    const colIdx = COLUMNS.findIndex((c) => c.key === active.key);
    const move = (dr, dc) => {
      e.preventDefault();
      const nr = Math.max(0, Math.min(displayRows.length - 1, rowIdx + dr));
      const nc = Math.max(0, Math.min(COLUMNS.length - 1, colIdx + dc));
      setActive({ rowId: displayRows[nr].id, key: COLUMNS[nc].key });
    };
    if (e.key === "ArrowDown") move(1, 0);
    else if (e.key === "ArrowUp") move(-1, 0);
    else if (e.key === "ArrowRight" || e.key === "Tab") { e.preventDefault(); move(0, e.shiftKey ? -1 : 1); }
    else if (e.key === "ArrowLeft") move(0, -1);
    else if (e.key === "Enter") { const col = COLUMNS[colIdx]; if (col.edit) beginEdit(active.rowId, col.key); }
    else if (e.key === "Delete") { const col = COLUMNS[colIdx]; if (col.edit) applyEdit(active.rowId, col.key, col.edit === "num" ? 0 : ""); }
  }
  function beginEdit(rowId, key) {
    const r = rows.find((x) => x.id === rowId);
    setEditing({ rowId, key, value: r[key] });
    setActive({ rowId, key });
  }
  function copyActive() { if (active) { const r = rows.find((x) => x.id === active.rowId); clipboard.current = r?.[active.key]; } }
  function pasteActive() {
    if (!active || clipboard.current == null) return;
    const col = COLUMNS.find((c) => c.key === active.key);
    if (col?.edit) applyEdit(active.rowId, active.key, col.edit === "num" ? Number(clipboard.current) || 0 : String(clipboard.current));
  }

  function openMenu(e, row) {
    e.preventDefault();
    setContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: "Copy", action: () => { const r = rows.find((x) => x.id === row.id); clipboard.current = r?.[active?.key || "name"]; } },
        { label: "Paste", action: () => { setActive({ rowId: row.id, key: active?.key || "name" }); pasteActive(); } },
        { label: "Duplicate", action: () => duplicateRow(row) },
        { label: "Delete", danger: true, action: () => deleteRows([row.id]) },
        "---",
        { label: "Insert Above", action: () => insertRow(row, "above") },
        { label: "Insert Below", action: () => insertRow(row, "below") },
        "---",
        { label: "Insert Assembly", action: () => setAssemblyTarget(row.id) },
        { label: "Convert to Assembly", action: () => convertToAssembly(row) },
      ],
    });
  }

  if (!rows) return <Spinner label="Loading estimate worksheet…" />;

  // Virtualization window.
  const total = displayRows.length;
  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const end = Math.min(total, Math.ceil((scrollTop + viewportH) / ROW_H) + OVERSCAN);
  const visible = displayRows.slice(start, end);

  const selectedRows = displayRows.filter((r) => selected.has(r.id));
  const totalQty = displayRows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const totalDirect = displayRows.reduce((s, r) => s + r.directCost, 0);
  const grandTotal = summary?.waterfall?.finalTenderPrice ?? totalDirect;

  return (
    <div className="worksheet">
      <div className="catalog-toolbar"><h2 className="catalog-title">Estimate Worksheet</h2>
        <span className={`save-indicator ${saveStatus}`}>{saveStatus === "saving" ? "Saving…" : saveStatus === "dirty" ? "Unsaved" : "Saved"}</span>
      </div>
      {error && <div className="error-banner" onClick={() => setError("")}>{error}</div>}

      {/* Toolbar: filters + row actions */}
      <div className="ws-toolbar">
        <input className="ws-search" placeholder="Search description, remarks, unit…" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
        <select value={filters.categoryId} onChange={(e) => setFilters({ ...filters, categoryId: e.target.value })}>
          <option value="">All WBS / Divisions</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="secondary-button" onClick={() => insertRow(displayRows[displayRows.length - 1], "below")}>+ Insert Row</button>
        <button className="secondary-button" onClick={() => deleteRows([...selected])} disabled={!selected.size}>Delete</button>
        <button className="secondary-button" onClick={undo}>↩ Undo</button>
        <button className="secondary-button" onClick={redo}>↪ Redo</button>
      </div>

      {/* Grid */}
      <div className="ws-grid" tabIndex={0} onKeyDown={onKeyDown}>
        <div className="ws-head" style={{ minWidth: COLUMNS.reduce((s, c) => s + c.w, 40) }}>
          <div className="ws-cell ws-check" />
          {COLUMNS.map((c) => <div key={c.key} className={`ws-cell ws-h ${c.num ? "num" : ""}`} style={{ width: c.w }}>{c.label}</div>)}
        </div>
        <div className="ws-body" ref={scrollRef} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
          <div style={{ height: total * ROW_H, position: "relative", minWidth: COLUMNS.reduce((s, c) => s + c.w, 40) }}>
            {visible.map((row) => {
              const idx = displayRows.indexOf(row);
              return (
                <div key={row.id} className={`ws-row ${selected.has(row.id) ? "sel" : ""}`} style={{ top: idx * ROW_H }}
                  onContextMenu={(e) => openMenu(e, row)}>
                  <div className="ws-cell ws-check">
                    <input type="checkbox" checked={selected.has(row.id)} onChange={(e) => {
                      const n = new Set(selected); e.target.checked ? n.add(row.id) : n.delete(row.id); setSelected(n);
                    }} />
                  </div>
                  {COLUMNS.map((c) => {
                    const isActive = active && active.rowId === row.id && active.key === c.key;
                    const isEditing = editing && editing.rowId === row.id && editing.key === c.key;
                    let display = row[c.key];
                    if (["material", "labor", "equipment", "subcontract", "other", "directCost", "totalUnitCost", "totalCost"].includes(c.key)) display = money(row[c.key]);
                    else if (["markupPct", "profitPct"].includes(c.key)) display = `${row[c.key] || 0}%`;
                    return (
                      <div key={c.key} className={`ws-cell ${c.num ? "num" : ""} ${isActive ? "active" : ""} ${c.edit ? "editable" : ""}`}
                        style={{ width: c.w }}
                        onClick={() => setActive({ rowId: row.id, key: c.key })}
                        onDoubleClick={() => c.edit && beginEdit(row.id, c.key)}>
                        {isEditing ? (
                          <input autoFocus className="ws-input" type={c.edit === "num" ? "number" : "text"}
                            value={editing.value}
                            onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                            onBlur={commitEdit}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); commitEdit(); setActive({ rowId: row.id, key: c.key }); }
                              else if (e.key === "Escape") setEditing(null);
                            }} />
                        ) : display}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {total === 0 && <div className="empty-state" style={{ padding: "1rem" }}>No work items. Use “+ Insert Row”.</div>}
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="ws-status">
        <span>Selected: <strong>{selectedRows.length}</strong></span>
        <span>Total Qty: <strong>{totalQty.toLocaleString()}</strong></span>
        <span>Total Direct Cost: <strong>{money(totalDirect)}</strong></span>
        <span>Grand Total: <strong>{money(grandTotal)}</strong></span>
        <span>Currency: <strong>{getActiveCurrency()}</strong></span>
        <span className="ws-status-hint">{total.toLocaleString()} rows</span>
      </div>

      {contextMenu && <EstimateContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenu.items} onClose={() => setContextMenu(null)} />}
      {assemblyTarget != null && (
        <InsertAssemblyModal
          onInsert={async ({ assemblyId, quantity, mode }) => {
            await api.modules.insertAssembly(assemblyTarget, { assemblyId, quantity, mode });
            setAssemblyTarget(null); load();
          }}
          onClose={() => setAssemblyTarget(null)}
        />
      )}
    </div>
  );
}
