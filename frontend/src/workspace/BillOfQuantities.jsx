import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { api } from "../api";
import { money, getActiveCurrency } from "../utils";
import Spinner from "../components/Spinner";
import EstimateContextMenu from "./EstimateContextMenu";
import InsertAssemblyModal from "./InsertAssemblyModal";
import InsertRateAnalysisModal from "./InsertRateAnalysisModal";
import BoqReports from "./BoqReports";

// Enterprise Bill of Quantities — a professional presentation and editing layer
// built ON TOP of the existing Estimate Worksheet data (work modules), the WBS
// hierarchy (Division → Section), and the Cost Engine (single source of truth
// for all computed costs). It does NOT calculate costs itself: every monetary
// column comes from api.estimate.calculateProject, so the BOQ, the Estimate
// Worksheet and the Cost Summary always stay in sync. Edits to quantity / unit /
// markup / profit / remarks persist through the existing modules API.

const ROW_H = 30;
const OVERSCAN = 10;

const COLUMNS = [
  { key: "itemNo", label: "Item No.", w: 90 },
  { key: "description", label: "Description", w: 260, edit: "text" },
  { key: "unit", label: "Unit", w: 64, edit: "text" },
  { key: "quantity", label: "Quantity", w: 88, edit: "num", num: true },
  { key: "material", label: "Material", w: 96, num: true },
  { key: "labor", label: "Labor", w: 96, num: true },
  { key: "equipment", label: "Equipment", w: 96, num: true },
  { key: "subcontract", label: "Subcontract", w: 100, num: true },
  { key: "other", label: "Other", w: 90, num: true },
  { key: "directCost", label: "Direct Cost", w: 108, num: true },
  { key: "markupPct", label: "Markup %", w: 84, edit: "num", num: true },
  { key: "profitPct", label: "Profit %", w: 80, edit: "num", num: true },
  { key: "unitCost", label: "Unit Cost", w: 104, num: true },
  { key: "amount", label: "Amount", w: 116, num: true },
  { key: "remarks", label: "Remarks", w: 150, edit: "text" },
  { key: "status", label: "Status", w: 90 },
];
const GRID_W = COLUMNS.reduce((s, c) => s + c.w, 0);

// Two-digit / three-digit zero padding for hierarchical item numbers.
const pad = (n, w = 2) => String(n).padStart(w, "0");

export default function BillOfQuantities({ projectId }) {
  const [categories, setCategories] = useState([]);
  const [modules, setModules] = useState(null);
  const [calc, setCalc] = useState(null);
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState("saved");
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState(() => new Set()); // division/section keys
  const [selected, setSelected] = useState(() => new Set()); // module ids
  const [contextMenu, setContextMenu] = useState(null);
  const [assemblyTarget, setAssemblyTarget] = useState(null);
  const [rateTarget, setRateTarget] = useState(null);
  const [showReports, setShowReports] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(600);
  const scrollRef = useRef(null);
  const saveTimer = useRef(null);
  const clipboard = useRef(null);

  // ── Load: modules + cost engine + WBS (identical sources to the worksheet) ──
  const load = useCallback(() => {
    Promise.all([
      api.modules.list({ projectId }),
      api.estimate.calculateProject(projectId),
      api.wbs.categories(),
    ]).then(([mods, c, cats]) => {
      setModules(mods);
      setCalc(c);
      setCategories(cats);
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
  }, [modules]);

  const costById = useMemo(
    () => new Map((calc?.modules || []).map((m) => [m.id, m])),
    [calc]
  );

  // Enrich a module with its cost-engine breakdown + derived BOQ columns.
  const enrich = useCallback((m) => {
    const b = costById.get(m.id) || {};
    const qty = Number(m.quantity ?? 1) || 0;
    const directCost = b.directCost || 0;
    const markup = Number(m.markupPct) || 0;
    const profit = Number(m.profitPct) || 0;
    // Markup/profit are BOQ presentation multipliers over the engine's direct
    // cost; the Direct Cost column stays exactly equal to the engine value.
    const amount = directCost * (1 + markup / 100) * (1 + profit / 100);
    const unitCost = qty ? amount / qty : amount;
    const hasCost = directCost > 0;
    return {
      id: m.id, kind: "item",
      description: m.name, unit: m.unit || "", quantity: m.quantity ?? 1,
      markupPct: m.markupPct || 0, profitPct: m.profitPct || 0, remarks: m.remarks || "",
      wbsCategoryId: m.wbsCategoryId, wbsSubcategoryId: m.wbsSubcategoryId, sortOrder: m.sortOrder ?? 0,
      material: b.material || 0, labor: b.labor || 0, equipment: b.equipment || 0,
      subcontract: b.subcontract || 0, other: b.other || 0,
      directCost, unitCost, amount, status: hasCost ? "Priced" : "Empty",
    };
  }, [costById]);

  // ── Build the flattened, virtualizable render list from the WBS hierarchy ────
  const { flatRows, grandTotal, divisionTotals } = useMemo(() => {
    const rows = [];
    const q = search.trim().toLowerCase();
    const divTotals = {};
    let grand = 0;
    if (!modules) return { flatRows: rows, grandTotal: 0, divisionTotals: divTotals };

    const matchItem = (it) =>
      !q || [it.description, it.unit, it.remarks].some((v) => (v || "").toLowerCase().includes(q));

    categories.forEach((cat, ci) => {
      const divNo = pad(ci + 1);
      const divKey = `div-${cat.id}`;
      const catModules = modules.filter((m) => m.wbsCategoryId === cat.id).map(enrich);

      // Section grouping.
      const sections = cat.subcategories.map((sub, si) => {
        const secItems = catModules
          .filter((it) => it.wbsSubcategoryId === sub.id)
          .filter(matchItem)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        return { sub, si, items: secItems };
      });
      const directItems = catModules
        .filter((it) => it.wbsSubcategoryId == null)
        .filter(matchItem)
        .sort((a, b) => a.sortOrder - b.sortOrder);

      const divItemCount =
        sections.reduce((s, x) => s + x.items.length, 0) + directItems.length;
      // While searching, hide divisions with no matching items.
      if (q && divItemCount === 0) return;

      let divTotal = 0;
      const divCollapsed = collapsed.has(divKey);
      rows.push({ kind: "division", key: divKey, id: cat.id, no: divNo, name: cat.name, collapsed: divCollapsed });

      if (!divCollapsed) {
        sections.forEach(({ sub, si, items }) => {
          const secKey = `sec-${sub.id}`;
          const secCollapsed = collapsed.has(secKey);
          const secTotal = items.reduce((s, it) => s + it.amount, 0);
          rows.push({
            kind: "section", key: secKey, id: sub.id, catId: cat.id,
            no: `${divNo}.${pad(si + 1)}`, name: sub.name, collapsed: secCollapsed, total: secTotal,
          });
          if (!secCollapsed) {
            items.forEach((it, ii) => {
              rows.push({ ...it, no: `${divNo}.${pad(si + 1)}.${pad(ii + 1, 3)}`, catId: cat.id, subId: sub.id });
            });
          }
          divTotal += secTotal;
        });
        // Direct (section-less) items appear under the division.
        directItems.forEach((it, ii) => {
          rows.push({ ...it, no: `${divNo}.000.${pad(ii + 1, 3)}`, catId: cat.id, subId: null });
          divTotal += it.amount;
        });
      } else {
        // Still accumulate the division total even when collapsed.
        divTotal = sections.reduce((s, x) => s + x.items.reduce((a, it) => a + it.amount, 0), 0)
          + directItems.reduce((a, it) => a + it.amount, 0);
      }

      divTotals[cat.id] = divTotal;
      grand += divTotal;
      rows.push({ kind: "divTotal", key: `divt-${cat.id}`, no: divNo, name: cat.name, total: divTotal });
    });

    // Modules not yet assigned to any WBS division still belong in the BOQ so it
    // stays in exact sync with the flat Estimate Worksheet. They surface under a
    // synthetic "Unassigned" division (catId null).
    const orphanItems = modules
      .filter((m) => m.wbsCategoryId == null)
      .map(enrich)
      .filter(matchItem)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    if (orphanItems.length) {
      const divNo = pad(categories.length + 1);
      const divKey = "div-unassigned";
      const divCollapsed = collapsed.has(divKey);
      const divTotal = orphanItems.reduce((s, it) => s + it.amount, 0);
      rows.push({ kind: "division", key: divKey, id: null, no: divNo, name: "Unassigned", collapsed: divCollapsed });
      if (!divCollapsed) {
        orphanItems.forEach((it, ii) => {
          rows.push({ ...it, no: `${divNo}.000.${pad(ii + 1, 3)}`, catId: null, subId: null });
        });
      }
      divTotals.unassigned = divTotal;
      grand += divTotal;
      rows.push({ kind: "divTotal", key: "divt-unassigned", no: divNo, name: "Unassigned", total: divTotal });
    }

    return { flatRows: rows, grandTotal: grand, divisionTotals: divTotals };
  }, [modules, categories, collapsed, search, enrich]);

  // ── Persist edits through the existing modules API (keeps worksheet in sync) ─
  function persist(id, patch) {
    setSaveStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await api.modules.update(id, patch);
        // Recompute via the engine so every derived column refreshes.
        const [mods, c] = await Promise.all([
          api.modules.list({ projectId }),
          api.estimate.calculateProject(projectId),
        ]);
        setModules(mods); setCalc(c); setSaveStatus("saved");
      } catch (e) { setError(e.message); setSaveStatus("dirty"); }
    }, 350);
  }

  // Optimistic local update + persist.
  function editItem(id, key, value) {
    setModules((prev) => prev.map((m) => (m.id === id ? { ...m, [key === "description" ? "name" : key]: value } : m)));
    persist(id, { [key === "description" ? "name" : key]: value });
  }

  function toggle(key) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }
  const collapseAll = () => setCollapsed(new Set(
    categories.flatMap((c) => [`div-${c.id}`, ...c.subcategories.map((s) => `sec-${s.id}`)])
  ));
  const expandAll = () => setCollapsed(new Set());

  // ── Structural operations (reuse existing WBS + modules APIs) ────────────────
  async function insertDivision() {
    const name = window.prompt("New Division name:");
    if (!name) return;
    try { await api.wbs.createCategory({ name }); load(); }
    catch (e) { setError(e.message); }
  }
  async function insertSection(catId) {
    const name = window.prompt("New Section name:");
    if (!name) return;
    try { await api.wbs.createSubcategory(catId, { name }); load(); }
    catch (e) { setError(e.message); }
  }
  async function insertItem(catId, subId) {
    const name = window.prompt("New BOQ item description:");
    if (!name) return;
    try {
      await api.modules.create({ name, projectId, wbsCategoryId: catId, wbsSubcategoryId: subId ?? null });
      load();
    } catch (e) { setError(e.message); }
  }
  async function duplicateItem(id) {
    try { await api.modules.duplicate(id); load(); } catch (e) { setError(e.message); }
  }
  async function deleteItem(id) {
    try { await api.modules.remove(id); load(); } catch (e) { setError(e.message); }
  }
  async function moveItem(row, dir) {
    // Swap sortOrder with the adjacent sibling in the same section.
    const siblings = (modules || [])
      .filter((m) => m.wbsCategoryId === row.catId && (m.wbsSubcategoryId ?? null) === (row.subId ?? null))
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const idx = siblings.findIndex((m) => m.id === row.id);
    const swapWith = dir === "up" ? siblings[idx - 1] : siblings[idx + 1];
    if (!swapWith) return;
    const a = siblings[idx].sortOrder ?? idx;
    const b = swapWith.sortOrder ?? (dir === "up" ? idx - 1 : idx + 1);
    try {
      await Promise.all([
        api.modules.update(siblings[idx].id, { sortOrder: b }),
        api.modules.update(swapWith.id, { sortOrder: a }),
      ]);
      load();
    } catch (e) { setError(e.message); }
  }

  function onContextMenu(e, row) {
    e.preventDefault();
    const items = [];
    if (row.kind === "item") {
      items.push(
        { label: "Insert Item", action: () => insertItem(row.catId, row.subId) },
        { label: "Insert Section", action: () => insertSection(row.catId) },
        { label: "Insert Division", action: insertDivision },
        "---",
        { label: "Insert Rate Analysis", action: () => setRateTarget(row.id) },
        { label: "Insert Assembly", action: () => setAssemblyTarget(row.id) },
        "---",
        { label: "Move Up", action: () => moveItem(row, "up") },
        { label: "Move Down", action: () => moveItem(row, "down") },
        { label: "Duplicate", action: () => duplicateItem(row.id) },
        { label: "Copy", action: () => { clipboard.current = row; } },
        { label: "Archive / Delete", danger: true, action: () => deleteItem(row.id) },
      );
    } else if (row.kind === "division") {
      items.push(
        { label: "Insert Section", action: () => insertSection(row.id) },
        { label: "Insert Division", action: insertDivision },
      );
    } else if (row.kind === "section") {
      items.push(
        { label: "Insert Item", action: () => insertItem(row.catId, row.id) },
        { label: "Insert Section", action: () => insertSection(row.catId) },
        { label: "Insert Division", action: insertDivision },
      );
    }
    if (items.length) setContextMenu({ x: e.clientX, y: e.clientY, items });
  }

  // ── Import / Export ──────────────────────────────────────────────────────────
  function exportRows() {
    return flatRows
      .filter((r) => r.kind === "item")
      .map((r) => ({
        "Item No.": r.no, Description: r.description, Unit: r.unit, Quantity: r.quantity,
        Material: r.material, Labor: r.labor, Equipment: r.equipment, Subcontract: r.subcontract,
        Other: r.other, "Direct Cost": r.directCost, "Markup %": r.markupPct, "Profit %": r.profitPct,
        "Unit Cost": r.unitCost, Amount: r.amount, Remarks: r.remarks, Status: r.status,
      }));
  }
  function exportFile(kind) {
    const data = exportRows();
    if (kind === "json") {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "bill-of-quantities.json"; a.click();
      URL.revokeObjectURL(a.href);
      return;
    }
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "BOQ");
    XLSX.writeFile(wb, `bill-of-quantities.${kind}`);
  }
  async function importFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      let inRows;
      if (file.name.endsWith(".json")) inRows = JSON.parse(await file.text());
      else {
        const wb = XLSX.read(await file.arrayBuffer());
        inRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      }
      // Import creates items under the first division (uncategorised import bucket).
      const firstCat = categories[0];
      if (!firstCat) { setError("Create a Division before importing."); return; }
      for (const r of inRows) {
        await api.modules.create({
          name: r.Description ?? r.description ?? "Imported item",
          projectId, wbsCategoryId: firstCat.id, wbsSubcategoryId: null,
        });
      }
      load();
    } catch (err) { setError(err.message); }
    finally { e.target.value = ""; }
  }

  if (!modules) return <Spinner label="Loading Bill of Quantities…" />;

  // Virtualization window over the flattened rows.
  const total = flatRows.length;
  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const end = Math.min(total, Math.ceil((scrollTop + viewportH) / ROW_H) + OVERSCAN);
  const visible = flatRows.slice(start, end);
  const projectGrand = calc?.waterfall?.finalTenderPrice ?? grandTotal;

  return (
    <div className="boq">
      {error && <div className="error-banner" onClick={() => setError("")}>{error}</div>}

      <div className="boq-toolbar ws-toolbar">
        <h3 className="boq-title">Bill of Quantities</h3>
        <input className="ws-search" placeholder="Search description, unit, remarks…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="secondary-button" onClick={insertDivision}>+ Division</button>
        <button className="secondary-button" onClick={expandAll}>Expand All</button>
        <button className="secondary-button" onClick={collapseAll}>Collapse All</button>
        <span className="boq-toolbar-spacer" />
        <button className="secondary-button" onClick={() => setShowReports(true)}>Reports</button>
        <button className="secondary-button" onClick={() => exportFile("xlsx")}>Excel</button>
        <button className="secondary-button" onClick={() => exportFile("csv")}>CSV</button>
        <button className="secondary-button" onClick={() => exportFile("json")}>JSON</button>
        <label className="secondary-button matlib-import">Import<input type="file" accept=".xlsx,.xls,.csv,.json" hidden onChange={importFile} /></label>
        <span className={`ws-save ws-save-${saveStatus}`}>{saveStatus === "saved" ? "✓ Saved" : saveStatus === "saving" ? "Saving…" : "Unsaved"}</span>
      </div>

      {/* Header */}
      <div className="boq-grid-head" style={{ width: GRID_W }}>
        {COLUMNS.map((c) => (
          <div key={c.key} className={`boq-cell boq-head-cell ${c.num ? "num" : ""}`} style={{ width: c.w }}>{c.label}</div>
        ))}
      </div>

      {/* Body (virtualized) */}
      <div className="boq-grid-body" ref={scrollRef} onScroll={(e) => setScrollTop(e.target.scrollTop)}>
        <div style={{ height: total * ROW_H, position: "relative", width: GRID_W }}>
          <div style={{ transform: `translateY(${start * ROW_H}px)` }}>
            {visible.map((row) => (
              <BoqRow
                key={row.key || `item-${row.id}`}
                row={row}
                selected={selected.has(row.id)}
                onToggle={toggle}
                onEdit={editItem}
                onContext={onContextMenu}
                onSelect={(id) => setSelected((prev) => {
                  const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
                })}
                onAddItem={insertItem}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Grand total footer */}
      <div className="boq-footer">
        <span>{total.toLocaleString()} rows</span>
        <span>Currency: <strong>{getActiveCurrency()}</strong></span>
        <span>BOQ Direct Total: <strong>{money(grandTotal)}</strong></span>
        <span>Project Grand Total: <strong>{money(projectGrand)}</strong></span>
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
      {rateTarget != null && (
        <InsertRateAnalysisModal
          onInsert={async ({ upaId, quantity, mode }) => {
            await api.modules.insertUpa(rateTarget, { upaId, quantity, mode });
            setRateTarget(null); load();
          }}
          onClose={() => setRateTarget(null)}
        />
      )}
      {showReports && (
        <BoqReports
          projectId={projectId}
          flatRows={flatRows}
          divisionTotals={divisionTotals}
          categories={categories}
          grandTotal={grandTotal}
          projectGrand={projectGrand}
          onClose={() => setShowReports(false)}
          setError={setError}
        />
      )}
    </div>
  );
}

// ── A single flattened render row (division / section / item / division total) ──
function BoqRow({ row, selected, onToggle, onEdit, onContext, onSelect, onAddItem }) {
  if (row.kind === "division") {
    return (
      <div className="boq-row boq-division" style={{ height: ROW_H }} onContextMenu={(e) => onContext(e, row)}>
        <button className="boq-tw" onClick={() => onToggle(row.key)}>{row.collapsed ? "▸" : "▾"}</button>
        <span className="boq-div-no">{row.no}</span>
        <span className="boq-div-name">{row.name}</span>
      </div>
    );
  }
  if (row.kind === "section") {
    return (
      <div className="boq-row boq-section" style={{ height: ROW_H }} onContextMenu={(e) => onContext(e, row)}>
        <button className="boq-tw" onClick={() => onToggle(row.key)}>{row.collapsed ? "▸" : "▾"}</button>
        <span className="boq-sec-no">{row.no}</span>
        <span className="boq-sec-name">{row.name}</span>
        <button className="pe-add boq-add" onClick={() => onAddItem(row.catId, row.id)}>+ Item</button>
        <span className="boq-sec-total">{money(row.total)}</span>
      </div>
    );
  }
  if (row.kind === "divTotal") {
    return (
      <div className="boq-row boq-divtotal" style={{ height: ROW_H }}>
        <span className="boq-divtotal-label">Division {row.no} Total — {row.name}</span>
        <span className="boq-divtotal-amt">{money(row.total)}</span>
      </div>
    );
  }
  // item
  return (
    <div
      className={`boq-row boq-item ${selected ? "selected" : ""}`}
      style={{ height: ROW_H }}
      onContextMenu={(e) => onContext(e, row)}
    >
      {COLUMNS.map((c) => {
        const val = row[c.key];
        if (c.edit) {
          return (
            <div key={c.key} className={`boq-cell ${c.num ? "num" : ""}`} style={{ width: c.w }}>
              <input
                className="boq-input"
                type={c.edit === "num" ? "number" : "text"}
                defaultValue={val ?? ""}
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  const nv = c.edit === "num" ? Number(e.target.value) : e.target.value;
                  if (String(nv) !== String(val)) onEdit(row.id, c.key, nv);
                }}
              />
            </div>
          );
        }
        let display = val;
        if (c.num) display = money(Number(val) || 0);
        if (c.key === "itemNo") display = row.no;
        if (c.key === "status") {
          return (
            <div key={c.key} className={`boq-cell`} style={{ width: c.w }}>
              <span className={`status-badge ${val === "Priced" ? "status-active" : "status-archived"}`}>{val}</span>
            </div>
          );
        }
        return (
          <div key={c.key} className={`boq-cell ${c.num ? "num" : ""}`} style={{ width: c.w }} title={typeof display === "string" ? display : undefined}>
            {display}
          </div>
        );
      })}
    </div>
  );
}
