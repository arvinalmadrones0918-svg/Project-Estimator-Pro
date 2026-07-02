import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { money } from "../utils";
import Spinner from "../components/Spinner";
import CatalogSearchModal from "./CatalogSearchModal";
import EstimateContextMenu from "./EstimateContextMenu";
import UpaPickerModal from "./UpaPickerModal";

const ROW_H = 36;
const OVERSCAN = 8;
const STATUS_OPTIONS = ["included", "pending", "excluded"];

// ── Helpers ────────────────────────────────────────────────────────────────

function lineAmount(line) {
  return (line.quantity ?? 1) * (line.unitPrice ?? line.cost ?? 0);
}

function lineTotal(line) {
  return lineAmount(line) * (1 + (line.markup ?? 0) / 100);
}

// Flatten module detail into a display-ready row list, with section headers.
function buildRows(detail, expandedAssemblies, assemblyChildren) {
  if (!detail) return [];
  const sections = [
    { key: "material", label: "Materials", lines: detail.materialLines ?? [] },
    { key: "labor", label: "Labor", lines: detail.laborLines ?? [] },
    { key: "equipment", label: "Equipment", lines: detail.equipmentLines ?? [] },
    { key: "subcontract", label: "Subcontract", lines: detail.subcontractLines ?? [] },
    { key: "otherCost", label: "Other Costs", lines: detail.otherCostLines ?? [] },
    { key: "assembly", label: "Assemblies", lines: detail.assemblyLines ?? [] },
    { key: "upa", label: "Unit Price Analysis", lines: detail.upaLines ?? [] },
  ];
  const rows = [];
  for (const sec of sections) {
    const secTotal = sec.lines.reduce((s, l) => s + lineAmount(l), 0);
    rows.push({ _type: "header", sectionKey: sec.key, label: sec.label, total: secTotal, count: sec.lines.length });
    sec.lines.forEach((line, idx) => {
      rows.push({ _type: "line", sectionKey: sec.key, _idx: idx, ...line });
      if (sec.key === "assembly" && expandedAssemblies.has(line.id)) {
        const children = assemblyChildren[line.id] ?? [];
        children.forEach((child) => {
          rows.push({ _type: "assembly-child", parentId: line.id, parentQty: line.quantity, ...child });
        });
      }
    });
  }
  return rows;
}

// ── Main component ─────────────────────────────────────────────────────────

export default function EstimateGrid({ moduleId, onChange, setError }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState("saved"); // saved | dirty | saving
  const [editCell, setEditCell] = useState(null); // { rowKey, field }
  const [editValue, setEditValue] = useState("");
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [expandedAssemblies, setExpandedAssemblies] = useState(new Set());
  const [assemblyChildren, setAssemblyChildren] = useState({});
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [showUpaModal, setShowUpaModal] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [clipboard, setClipboard] = useState(null);
  const [scrollTop, setScrollTop] = useState(0);
  const scrollRef = useRef(null);
  const pendingSaves = useRef({});
  const historyRef = useRef({ stack: [], index: -1 });

  // ── Load ────────────────────────────────────────────────────────────────
  const loadDetail = useCallback(() => {
    if (!moduleId) return;
    setLoading(true);
    api.modules.get(moduleId)
      .then((d) => { setDetail(d); setSaveStatus("saved"); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [moduleId, setError]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  // ── Flat rows for virtual scroll ────────────────────────────────────────
  const rows = useMemo(
    () => buildRows(detail, expandedAssemblies, assemblyChildren),
    [detail, expandedAssemblies, assemblyChildren]
  );

  const totalHeight = rows.length * ROW_H;
  const visibleStart = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const visibleEnd = Math.min(rows.length, Math.ceil((scrollTop + 600) / ROW_H) + OVERSCAN);
  const visibleRows = rows.slice(visibleStart, visibleEnd);

  // ── History / undo-redo ──────────────────────────────────────────────────
  function pushHistory(action) {
    const h = historyRef.current;
    h.stack.splice(h.index + 1);
    h.stack.push(action);
    if (h.stack.length > 50) h.stack.shift(); else h.index++;
  }

  async function undo() {
    const h = historyRef.current;
    if (h.index < 0) return;
    await h.stack[h.index].undo();
    h.index--;
    loadDetail();
    onChange();
  }

  async function redo() {
    const h = historyRef.current;
    if (h.index >= h.stack.length - 1) return;
    h.index++;
    await h.stack[h.index].redo();
    loadDetail();
    onChange();
  }

  // ── Save helper ─────────────────────────────────────────────────────────
  async function withSave(apiFn, undoFn) {
    setSaveStatus("saving");
    try {
      const result = await apiFn();
      pushHistory({ undo: undoFn, redo: apiFn });
      loadDetail();
      onChange();
      setSaveStatus("saved");
      return result;
    } catch (e) {
      setError(e.message);
      setSaveStatus("dirty");
    }
  }

  // ── Inline edit ─────────────────────────────────────────────────────────
  function startEdit(rowKey, field, value) {
    setEditCell({ rowKey, field });
    setEditValue(String(value ?? ""));
  }

  async function commitEdit(row) {
    if (!editCell || editCell.rowKey !== rowKey(row)) { setEditCell(null); return; }
    const { field } = editCell;
    const val = editValue;
    setEditCell(null);

    const lineType = row.sectionKey;
    const id = row.id;
    const oldVal = row[field];

    let updater, reverter;

    if (lineType === "material") {
      const payload = { [field]: field === "quantity" || field === "markup" ? Number(val) : val };
      updater = () => api.modules.updateMaterial(moduleId, id, payload);
      reverter = () => api.modules.updateMaterial(moduleId, id, { [field]: oldVal });
    } else if (lineType === "labor") {
      const payload = { [field === "unitPrice" ? "hourlyRate" : field]: field === "quantity" || field === "markup" ? Number(val) : val };
      updater = () => api.modules.updateLabor(moduleId, id, payload);
      reverter = () => api.modules.updateLabor(moduleId, id, { [field]: oldVal });
    } else if (lineType === "equipment") {
      const payload = { [field]: field === "quantity" || field === "markup" ? Number(val) : val };
      updater = () => api.modules.updateEquipment(moduleId, id, payload);
      reverter = () => api.modules.updateEquipment(moduleId, id, { [field]: oldVal });
    } else if (lineType === "subcontract") {
      const payload = { [field]: field === "markup" || field === "cost" ? Number(val) : val };
      updater = () => api.modules.updateSubcontract(moduleId, id, payload);
      reverter = () => api.modules.updateSubcontract(moduleId, id, { [field]: oldVal });
    } else if (lineType === "otherCost") {
      const payload = { [field]: field === "markup" || field === "cost" ? Number(val) : val };
      updater = () => api.modules.updateOtherCost(moduleId, id, payload);
      reverter = () => api.modules.updateOtherCost(moduleId, id, { [field]: oldVal });
    } else if (lineType === "assembly") {
      const payload = { [field]: field === "quantity" || field === "markup" ? Number(val) : val };
      updater = () => api.modules.updateAssembly(moduleId, id, payload);
      reverter = () => api.modules.updateAssembly(moduleId, id, { [field]: oldVal });
    } else if (lineType === "upa") {
      const payload = { [field]: field === "quantity" || field === "markup" ? Number(val) : val };
      updater = () => api.modules.updateUPA(moduleId, id, payload);
      reverter = () => api.modules.updateUPA(moduleId, id, { [field]: oldVal });
    }

    if (updater) await withSave(updater, reverter);
  }

  // ── Status change (dropdown) ─────────────────────────────────────────────
  async function changeStatus(row, newStatus) {
    const lineType = row.sectionKey;
    const id = row.id;
    const oldStatus = row.status;
    const updater = () => {
      const fn = {
        material: api.modules.updateMaterial,
        labor: api.modules.updateLabor,
        equipment: api.modules.updateEquipment,
        subcontract: api.modules.updateSubcontract,
        otherCost: api.modules.updateOtherCost,
        assembly: api.modules.updateAssembly,
        upa: api.modules.updateUPA,
      }[lineType];
      return fn(moduleId, id, { status: newStatus });
    };
    const reverter = () => updater.call(null).then(() => {}).catch(() => {}); // simplified
    await withSave(updater, () => {
      const fn = {
        material: api.modules.updateMaterial,
        labor: api.modules.updateLabor,
        equipment: api.modules.updateEquipment,
        subcontract: api.modules.updateSubcontract,
        otherCost: api.modules.updateOtherCost,
        assembly: api.modules.updateAssembly,
        upa: api.modules.updateUPA,
      }[lineType];
      return fn(moduleId, id, { status: oldStatus });
    });
  }

  // ── Insert from catalog ──────────────────────────────────────────────────
  async function handleInsertCatalog(lineType, item) {
    const qty = 1;
    if (lineType === "material") {
      await withSave(
        () => api.modules.addMaterial(moduleId, { materialId: item.id, quantity: qty }),
        async (result) => result && api.modules.removeMaterial(moduleId, result.id)
      );
    } else if (lineType === "labor") {
      await withSave(
        () => api.modules.addLabor(moduleId, { specializationId: item.id, quantity: qty }),
        async (result) => result && api.modules.removeLabor(moduleId, result.id)
      );
    } else if (lineType === "equipment") {
      await withSave(
        () => api.modules.addEquipment(moduleId, { equipmentId: item.id, quantity: qty }),
        async (result) => result && api.modules.removeEquipment(moduleId, result.id)
      );
    } else if (lineType === "subcontract") {
      await withSave(
        () => api.modules.addSubcontract(moduleId, { description: item.name, cost: item.unitPrice ?? 0, code: item.code, category: item.category, supplier: item.supplier, unit: item.unit }),
        async (result) => result && api.modules.removeSubcontract(moduleId, result.id)
      );
    } else if (lineType === "otherCost") {
      await withSave(
        () => api.modules.addOtherCost(moduleId, { description: item.name, cost: item.unitPrice ?? 0, code: item.code, category: item.category, supplier: item.supplier, unit: item.unit }),
        async (result) => result && api.modules.removeOtherCost(moduleId, result.id)
      );
    } else if (lineType === "assembly") {
      await withSave(
        () => api.modules.addAssembly(moduleId, { assemblyId: item.id, quantity: qty }),
        async (result) => result && api.modules.removeAssembly(moduleId, result.id)
      );
    }
  }

  // ── Add blank direct-cost line ───────────────────────────────────────────
  async function addBlankLine(lineType) {
    if (lineType === "subcontract") {
      await withSave(() => api.modules.addSubcontract(moduleId, { description: "New subcontract item", cost: 0 }), () => {});
    } else if (lineType === "otherCost") {
      await withSave(() => api.modules.addOtherCost(moduleId, { description: "New cost item", cost: 0 }), () => {});
    } else if (lineType === "upa") {
      setShowUpaModal(true);
    } else {
      setShowCatalogModal(true);
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────
  async function deleteLine(row) {
    const { id, sectionKey: lineType } = row;
    const removers = {
      material: () => api.modules.removeMaterial(moduleId, id),
      labor: () => api.modules.removeLabor(moduleId, id),
      equipment: () => api.modules.removeEquipment(moduleId, id),
      subcontract: () => api.modules.removeSubcontract(moduleId, id),
      otherCost: () => api.modules.removeOtherCost(moduleId, id),
      assembly: () => api.modules.removeAssembly(moduleId, id),
      upa: () => api.modules.removeUPA(moduleId, id),
    };
    if (removers[lineType]) await withSave(removers[lineType], () => {});
  }

  async function deleteSelected() {
    const toDelete = rows.filter((r) => r._type === "line" && selectedKeys.has(rowKey(r)));
    for (const row of toDelete) await deleteLine(row);
    setSelectedKeys(new Set());
  }

  // ── Duplicate ────────────────────────────────────────────────────────────
  async function duplicateLine(row) {
    const { sectionKey: lineType } = row;
    if (lineType === "material") {
      await withSave(() => api.modules.addMaterial(moduleId, { materialId: row.materialId, quantity: row.quantity, notes: row.notes, markup: row.markup }), () => {});
    } else if (lineType === "labor") {
      await withSave(() => api.modules.addLabor(moduleId, { specializationId: row.specializationId, quantity: row.quantity, notes: row.notes, markup: row.markup }), () => {});
    } else if (lineType === "equipment") {
      await withSave(() => api.modules.addEquipment(moduleId, { equipmentId: row.equipmentId, quantity: row.quantity, notes: row.notes, markup: row.markup }), () => {});
    } else if (lineType === "subcontract") {
      await withSave(() => api.modules.addSubcontract(moduleId, { description: row.name, cost: row.cost, notes: row.notes, code: row.code, category: row.category, supplier: row.supplier, unit: row.unit, markup: row.markup }), () => {});
    } else if (lineType === "otherCost") {
      await withSave(() => api.modules.addOtherCost(moduleId, { description: row.name, cost: row.cost, notes: row.notes, code: row.code, category: row.category, supplier: row.supplier, unit: row.unit, markup: row.markup }), () => {});
    } else if (lineType === "assembly") {
      await withSave(() => api.modules.addAssembly(moduleId, { assemblyId: row.assemblyId, quantity: row.quantity, notes: row.notes, markup: row.markup }), () => {});
    } else if (lineType === "upa") {
      await withSave(() => api.modules.addUPA(moduleId, { upaId: row.upaId, quantity: row.quantity, notes: row.notes, markup: row.markup }), () => {});
    }
  }

  // ── Move up / move down ───────────────────────────────────────────────────
  async function moveLine(row, direction) {
    const sectionLines = (detail[`${row.sectionKey === "otherCost" ? "otherCost" : row.sectionKey}Lines`] ?? [])
      .concat(row.sectionKey === "otherCost" ? detail.otherCostLines ?? [] : [])
      .filter((l, i, arr) => arr.indexOf(l) === i); // deduplicate

    const sectionKey = row.sectionKey;
    const linesBySection = {
      material: detail.materialLines ?? [],
      labor: detail.laborLines ?? [],
      equipment: detail.equipmentLines ?? [],
      subcontract: detail.subcontractLines ?? [],
      otherCost: detail.otherCostLines ?? [],
      assembly: detail.assemblyLines ?? [],
      upa: detail.upaLines ?? [],
    };
    const secLines = linesBySection[sectionKey] ?? [];
    const idx = secLines.findIndex((l) => l.id === row.id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= secLines.length) return;

    const items = secLines.map((l, i) => {
      if (i === idx) return { id: l.id, sortOrder: swapIdx };
      if (i === swapIdx) return { id: l.id, sortOrder: idx };
      return { id: l.id, sortOrder: i };
    });

    const tableKey = { material: "material", labor: "labor", equipment: "equipment", subcontract: "subcontract", otherCost: "otherCost", assembly: "assembly" }[sectionKey];
    await withSave(
      () => api.modules.sortLines(moduleId, tableKey, items),
      () => api.modules.sortLines(moduleId, tableKey, secLines.map((l, i) => ({ id: l.id, sortOrder: i })))
    );
  }

  // ── Drag & drop ───────────────────────────────────────────────────────────
  const dragSrc = useRef(null);

  function onDragStart(row) { dragSrc.current = row; }

  async function onDrop(targetRow) {
    const src = dragSrc.current;
    if (!src || src.id === targetRow.id || src.sectionKey !== targetRow.sectionKey) return;
    dragSrc.current = null;

    const linesBySection = {
      material: detail.materialLines ?? [],
      labor: detail.laborLines ?? [],
      equipment: detail.equipmentLines ?? [],
      subcontract: detail.subcontractLines ?? [],
      otherCost: detail.otherCostLines ?? [],
      assembly: detail.assemblyLines ?? [],
      upa: detail.upaLines ?? [],
    };
    const secLines = [...(linesBySection[src.sectionKey] ?? [])];
    const fromIdx = secLines.findIndex((l) => l.id === src.id);
    const toIdx = secLines.findIndex((l) => l.id === targetRow.id);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = secLines.splice(fromIdx, 1);
    secLines.splice(toIdx, 0, moved);
    const items = secLines.map((l, i) => ({ id: l.id, sortOrder: i }));
    await withSave(
      () => api.modules.sortLines(moduleId, src.sectionKey, items),
      () => api.modules.sortLines(moduleId, src.sectionKey, (linesBySection[src.sectionKey] ?? []).map((l, i) => ({ id: l.id, sortOrder: i })))
    );
  }

  // ── Copy / paste ──────────────────────────────────────────────────────────
  function copyLines() {
    const toCopy = rows.filter((r) => r._type === "line" && selectedKeys.has(rowKey(r)));
    if (toCopy.length > 0) setClipboard(toCopy);
  }

  async function pasteLines() {
    if (!clipboard) return;
    for (const row of clipboard) await duplicateLine(row);
  }

  // ── Assembly expand ────────────────────────────────────────────────────────
  async function toggleAssemblyExpand(line) {
    const newSet = new Set(expandedAssemblies);
    if (newSet.has(line.id)) {
      newSet.delete(line.id);
      setExpandedAssemblies(newSet);
    } else {
      newSet.add(line.id);
      setExpandedAssemblies(newSet);
      if (!assemblyChildren[line.id]) {
        try {
          const asm = await api.assemblies.get(line.assemblyId);
          setAssemblyChildren((prev) => ({ ...prev, [line.id]: asm.items ?? [] }));
        } catch { /* ignore */ }
      }
    }
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e) {
      if (editCell) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.shiftKey && e.key === "z"))) { e.preventDefault(); redo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "c") { e.preventDefault(); copyLines(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "v") { e.preventDefault(); pasteLines(); }
      if (e.key === "Delete" && selectedKeys.size > 0) { e.preventDefault(); deleteSelected(); }
      if (e.key === "Escape") { setSelectedKeys(new Set()); setContextMenu(null); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editCell, selectedKeys, clipboard]);

  // ── Context menu ───────────────────────────────────────────────────────────
  function showContextMenu(e, row) {
    e.preventDefault();
    const isSelected = selectedKeys.has(rowKey(row));
    if (!isSelected) setSelectedKeys(new Set([rowKey(row)]));

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: "Insert from Catalog", icon: "＋", action: () => setShowCatalogModal(true) },
        "---",
        { label: "Duplicate", icon: "⧉", shortcut: "", action: () => duplicateLine(row) },
        { label: "Copy", icon: "⎘", shortcut: "Ctrl+C", action: () => { setSelectedKeys(new Set([rowKey(row)])); copyLines(); } },
        { label: "Paste", icon: "⊕", shortcut: "Ctrl+V", disabled: !clipboard, action: pasteLines },
        "---",
        { label: "Move Up", icon: "↑", action: () => moveLine(row, -1) },
        { label: "Move Down", icon: "↓", action: () => moveLine(row, 1) },
        "---",
        { label: "Delete", icon: "✕", shortcut: "Del", danger: true, action: () => deleteLine(row) },
      ],
    });
  }

  // ── Selection ─────────────────────────────────────────────────────────────
  function toggleSelect(row, e) {
    const key = rowKey(row);
    if (e.shiftKey) {
      // Range select between last selected and this
      const lineRows = rows.filter((r) => r._type === "line");
      const lastIdx = lineRows.findIndex((r) => selectedKeys.has(rowKey(r)));
      const thisIdx = lineRows.findIndex((r) => rowKey(r) === key);
      if (lastIdx !== -1) {
        const [lo, hi] = [Math.min(lastIdx, thisIdx), Math.max(lastIdx, thisIdx)];
        const next = new Set(selectedKeys);
        lineRows.slice(lo, hi + 1).forEach((r) => next.add(rowKey(r)));
        setSelectedKeys(next);
        return;
      }
    }
    const next = new Set(e.ctrlKey || e.metaKey ? selectedKeys : []);
    next.has(key) ? next.delete(key) : next.add(key);
    setSelectedKeys(next);
  }

  // ── Totals ─────────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    if (!detail) return {};
    return {
      material: (detail.materialLines ?? []).reduce((s, l) => s + lineAmount(l), 0),
      labor: (detail.laborLines ?? []).reduce((s, l) => s + lineAmount(l), 0),
      equipment: (detail.equipmentLines ?? []).reduce((s, l) => s + lineAmount(l), 0),
      subcontract: (detail.subcontractLines ?? []).reduce((s, l) => s + lineAmount(l), 0),
      otherCost: (detail.otherCostLines ?? []).reduce((s, l) => s + lineAmount(l), 0),
      assembly: (detail.assemblyLines ?? []).reduce((s, l) => s + lineAmount(l), 0),
      upa: (detail.upaLines ?? []).reduce((s, l) => s + lineAmount(l), 0),
    };
  }, [detail]);

  const nodeTotal = Object.values(totals).reduce((s, v) => s + v, 0);

  if (loading) return <Spinner label="Loading estimate…" />;
  if (!detail) return <p className="empty-state">No work item selected.</p>;

  return (
    <div className="estimate-grid-wrap">
      {/* ── Toolbar ─────────────────────────────────── */}
      <div className="estimate-toolbar">
        <h3 className="estimate-title">{detail.name}</h3>
        <div className="estimate-toolbar-actions">
          <span className={`save-indicator ${saveStatus}`}>
            {saveStatus === "saving" ? "Saving…" : saveStatus === "dirty" ? "Unsaved changes" : "Saved"}
          </span>
          <button className="secondary-button" title="Undo (Ctrl+Z)" onClick={undo}>↩ Undo</button>
          <button className="secondary-button" title="Redo (Ctrl+Y)" onClick={redo}>↪ Redo</button>
          <button className="primary-button" onClick={() => setShowCatalogModal(true)}>＋ Insert Item</button>
        </div>
      </div>

      {/* ── Grid ────────────────────────────────────── */}
      <div className="estimate-grid-container">
        <table className="estimate-grid" role="grid">
          <thead className="estimate-grid-head">
            <tr>
              <th style={{ width: 24 }}></th>{/* drag */}
              <th style={{ width: 32 }}></th>{/* checkbox */}
              <th style={{ width: 90 }}>Code</th>
              <th style={{ minWidth: 200 }}>Description</th>
              <th style={{ width: 110 }}>Category</th>
              <th style={{ width: 70 }}>Qty</th>
              <th style={{ width: 60 }}>Unit</th>
              <th style={{ width: 100 }}>Unit Cost</th>
              <th style={{ width: 110 }}>Amount</th>
              <th style={{ width: 75 }}>Markup %</th>
              <th style={{ width: 110 }}>Total</th>
              <th style={{ minWidth: 130 }}>Remarks</th>
              <th style={{ width: 110 }}>Supplier</th>
              <th style={{ width: 100 }}>Status</th>
              <th style={{ width: 80 }}>Actions</th>
            </tr>
          </thead>
        </table>

        {/* Virtual scroll body */}
        <div
          ref={scrollRef}
          className="estimate-grid-scroll"
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        >
          <div style={{ height: totalHeight, position: "relative" }}>
            <table className="estimate-grid estimate-grid-body" style={{ position: "absolute", top: visibleStart * ROW_H, width: "100%" }}>
              <tbody>
                {visibleRows.map((row, vi) => {
                  const absIdx = visibleStart + vi;
                  if (row._type === "header") {
                    return (
                      <tr key={`hdr-${row.sectionKey}`} className="estimate-section-header">
                        <td colSpan={2}></td>
                        <td colSpan={7} style={{ fontWeight: 600 }}>
                          {row.label}
                          <span className="section-count">({row.count})</span>
                        </td>
                        <td colSpan={3} style={{ textAlign: "right", fontWeight: 600 }}>
                          {money(row.total)}
                        </td>
                        <td colSpan={3}>
                          <button
                            className="link-button"
                            onClick={() => addBlankLine(row.sectionKey)}
                          >＋ Add</button>
                        </td>
                      </tr>
                    );
                  }

                  if (row._type === "assembly-child") {
                    const childAmt = (row.quantity ?? 0) * row.parentQty * (row.unitPriceAtEntry ?? row.hourlyRateAtEntry ?? row.cost ?? 0);
                    return (
                      <tr key={`child-${row.parentId}-${row.id}`} className="estimate-assembly-child">
                        <td></td><td></td>
                        <td className="indent-cell">{row.description || "—"}</td>
                        <td>{row.itemType}</td>
                        <td>{(row.quantity ?? 0) * row.parentQty}</td>
                        <td>—</td>
                        <td>{money(row.unitPriceAtEntry ?? row.hourlyRateAtEntry ?? 0)}</td>
                        <td>{money(childAmt)}</td>
                        <td colSpan={7}></td>
                      </tr>
                    );
                  }

                  // Normal line row
                  const key = rowKey(row);
                  const isSelected = selectedKeys.has(key);
                  const isEditingQty = editCell?.rowKey === key && editCell?.field === "quantity";
                  const isEditingMarkup = editCell?.rowKey === key && editCell?.field === "markup";
                  const isEditingNotes = editCell?.rowKey === key && editCell?.field === "notes";
                  const isEditingDesc = editCell?.rowKey === key && editCell?.field === "name";
                  const isEditingCost = editCell?.rowKey === key && editCell?.field === "unitPrice";
                  const amt = lineAmount(row);
                  const tot = lineTotal(row);
                  const isDirect = row.sectionKey === "subcontract" || row.sectionKey === "otherCost";

                  return (
                    <tr
                      key={key}
                      className={`estimate-row${isSelected ? " row-selected" : ""}${row.status === "excluded" ? " row-excluded" : ""}${row.status === "pending" ? " row-pending" : ""}`}
                      onClick={(e) => toggleSelect(row, e)}
                      onContextMenu={(e) => showContextMenu(e, row)}
                      draggable
                      onDragStart={() => onDragStart(row)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => onDrop(row)}
                    >
                      <td className="drag-handle" title="Drag to reorder">⠿</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => toggleSelect(row, e)}
                        />
                      </td>
                      <td>{row.code || "—"}</td>
                      <td>
                        {isDirect && isEditingDesc ? (
                          <input
                            autoFocus
                            className="cell-input"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => commitEdit(row)}
                            onKeyDown={(e) => { if (e.key === "Enter") commitEdit(row); if (e.key === "Escape") setEditCell(null); }}
                          />
                        ) : (
                          <span
                            className={isDirect ? "editable-cell" : ""}
                            onDoubleClick={isDirect ? () => startEdit(key, "name", row.name) : undefined}
                            title={isDirect ? "Double-click to edit" : undefined}
                          >
                            {row.sectionKey === "assembly" && (
                              <button
                                className="assembly-toggle"
                                onClick={(e) => { e.stopPropagation(); toggleAssemblyExpand(row); }}
                              >
                                {expandedAssemblies.has(row.id) ? "▼" : "▶"}
                              </button>
                            )}
                            {row.name}
                          </span>
                        )}
                      </td>
                      <td>{row.category || "—"}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {isEditingQty ? (
                          <input
                            autoFocus
                            className="cell-input qty"
                            type="number"
                            step="0.01"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => commitEdit(row)}
                            onKeyDown={(e) => { if (e.key === "Enter") commitEdit(row); if (e.key === "Escape") setEditCell(null); }}
                          />
                        ) : (
                          <span className="editable-cell" onDoubleClick={() => startEdit(key, "quantity", row.quantity ?? 1)}>
                            {row.quantity ?? 1}
                          </span>
                        )}
                      </td>
                      <td>{row.unit || "—"}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {isDirect && isEditingCost ? (
                          <input
                            autoFocus
                            className="cell-input"
                            type="number"
                            step="0.01"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => commitEdit(row)}
                            onKeyDown={(e) => { if (e.key === "Enter") commitEdit(row); if (e.key === "Escape") setEditCell(null); }}
                          />
                        ) : (
                          <span
                            className={isDirect ? "editable-cell" : ""}
                            onDoubleClick={isDirect ? () => startEdit(key, "unitPrice", row.unitPrice ?? row.cost ?? 0) : undefined}
                          >
                            {money(row.unitPrice ?? row.cost ?? 0)}
                            {row.currentUnitPrice != null && row.currentUnitPrice !== row.unitPrice && (
                              <span className="drift-flag" title={`Current catalog price: ${money(row.currentUnitPrice)}`}>⚠</span>
                            )}
                          </span>
                        )}
                      </td>
                      <td>{money(amt)}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {isEditingMarkup ? (
                          <input
                            autoFocus
                            className="cell-input markup"
                            type="number"
                            step="0.1"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => commitEdit(row)}
                            onKeyDown={(e) => { if (e.key === "Enter") commitEdit(row); if (e.key === "Escape") setEditCell(null); }}
                          />
                        ) : (
                          <span className="editable-cell" onDoubleClick={() => startEdit(key, "markup", row.markup ?? 0)}>
                            {(row.markup ?? 0).toFixed(1)}%
                          </span>
                        )}
                      </td>
                      <td className={row.markup > 0 ? "cell-highlighted" : ""}>{money(tot)}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {isEditingNotes ? (
                          <input
                            autoFocus
                            className="cell-input"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => commitEdit(row)}
                            onKeyDown={(e) => { if (e.key === "Enter") commitEdit(row); if (e.key === "Escape") setEditCell(null); }}
                          />
                        ) : (
                          <span className="editable-cell muted" onDoubleClick={() => startEdit(key, "notes", row.notes ?? "")}>
                            {row.notes || "—"}
                          </span>
                        )}
                      </td>
                      <td>{row.supplier || "—"}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <select
                          className={`status-select status-${row.status ?? "included"}`}
                          value={row.status ?? "included"}
                          onChange={(e) => changeStatus(row, e.target.value)}
                        >
                          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="row-actions" onClick={(e) => e.stopPropagation()}>
                        <button className="link-button" title="Move up" onClick={() => moveLine(row, -1)}>↑</button>
                        <button className="link-button" title="Move down" onClick={() => moveLine(row, 1)}>↓</button>
                        <button className="link-button" title="Duplicate" onClick={() => duplicateLine(row)}>⧉</button>
                        <button className="link-button danger" title="Delete" onClick={() => deleteLine(row)}>✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Node total ──────────────────────────────── */}
      <div className="estimate-node-total">
        <span>Work Item Total</span>
        <strong>{money(nodeTotal)}</strong>
      </div>

      {/* ── Modals ──────────────────────────────────── */}
      {showCatalogModal && (
        <CatalogSearchModal
          onInsert={handleInsertCatalog}
          onClose={() => setShowCatalogModal(false)}
        />
      )}

      {showUpaModal && (
        <UpaPickerModal
          onInsert={async (upa) => {
            await withSave(() => api.modules.addUPA(moduleId, { upaId: upa.id, quantity: 1 }), () => {});
            setShowUpaModal(false);
          }}
          onClose={() => setShowUpaModal(false)}
        />
      )}

      {contextMenu && (
        <EstimateContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

function rowKey(row) {
  return `${row.sectionKey}-${row.id}`;
}
