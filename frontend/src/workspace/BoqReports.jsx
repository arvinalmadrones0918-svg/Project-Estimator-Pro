import { useState } from "react";
import * as XLSX from "xlsx";
import { api } from "../api";
import { money, getActiveCurrency } from "../utils";

// BOQ report generator. Builds professional outputs from the already-loaded BOQ
// data (flatRows come from the Cost Engine) plus, for takeoff reports, per-item
// line details fetched on demand. Outputs: PDF (browser print), Excel, CSV.
// This does NOT touch the existing Reports engine — it is a BOQ-local reporter.

const REPORTS = [
  { key: "boq", label: "Bill of Quantities" },
  { key: "abstract", label: "Abstract of Estimate" },
  { key: "byDivision", label: "Summary by Division" },
  { key: "byCategory", label: "Summary by Cost Category" },
  { key: "materialTakeoff", label: "Material Takeoff" },
  { key: "laborRequirement", label: "Labor Requirement" },
  { key: "equipmentRequirement", label: "Equipment Requirement" },
  { key: "subcontractRequirement", label: "Subcontract Requirement" },
  { key: "generalRequirements", label: "General Requirements Summary" },
];

export default function BoqReports({ projectId, flatRows, divisionTotals, categories, grandTotal, projectGrand, onClose, setError }) {
  const [type, setType] = useState("boq");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null); // { title, headers, rows, footer }

  const items = flatRows.filter((r) => r.kind === "item");

  // Build simple (non-takeoff) reports synchronously from flatRows.
  function buildSimple(kind) {
    if (kind === "boq") {
      return {
        title: "Bill of Quantities",
        headers: ["Item No.", "Description", "Unit", "Qty", "Unit Cost", "Amount"],
        rows: flatRows
          .filter((r) => ["division", "section", "item"].includes(r.kind))
          .map((r) => r.kind === "item"
            ? [r.no, r.description, r.unit, num(r.quantity), money(r.unitCost), money(r.amount)]
            : [{ span: true, cls: r.kind, text: `${r.no}  ${r.name}` }]),
        footer: ["", "", "", "", "Grand Total", money(grandTotal)],
      };
    }
    if (kind === "abstract" || kind === "byDivision") {
      const rows = categories
        .filter((c) => (divisionTotals[c.id] || 0) !== 0 || items.some((i) => i.catId === c.id))
        .map((c, i) => [String(i + 1).padStart(2, "0"), c.name, money(divisionTotals[c.id] || 0)]);
      return {
        title: kind === "abstract" ? "Abstract of Estimate" : "Summary by Division",
        headers: ["Div", "Division", "Amount"],
        rows,
        footer: ["", "Grand Total", money(grandTotal)],
      };
    }
    if (kind === "byCategory") {
      const t = items.reduce((a, r) => ({
        material: a.material + r.material, labor: a.labor + r.labor, equipment: a.equipment + r.equipment,
        subcontract: a.subcontract + r.subcontract, other: a.other + r.other,
      }), { material: 0, labor: 0, equipment: 0, subcontract: 0, other: 0 });
      const direct = t.material + t.labor + t.equipment + t.subcontract + t.other;
      return {
        title: "Summary by Cost Category",
        headers: ["Cost Category", "Amount", "% of Direct"],
        rows: [
          ["Material", money(t.material), pct(t.material, direct)],
          ["Labor", money(t.labor), pct(t.labor, direct)],
          ["Equipment", money(t.equipment), pct(t.equipment, direct)],
          ["Subcontract", money(t.subcontract), pct(t.subcontract, direct)],
          ["Other", money(t.other), pct(t.other, direct)],
        ],
        footer: ["Total Direct Cost", money(direct), "100%"],
      };
    }
    if (kind === "generalRequirements") {
      // General Requirements = the division named accordingly (if present).
      const gr = categories.find((c) => /general/i.test(c.name));
      const grItems = gr ? items.filter((i) => i.catId === gr.id) : [];
      return {
        title: "General Requirements Summary",
        headers: ["Item No.", "Description", "Unit", "Qty", "Amount"],
        rows: grItems.map((r) => [r.no, r.description, r.unit, num(r.quantity), money(r.amount)]),
        footer: ["", "", "", "Total", money(grItems.reduce((s, r) => s + r.amount, 0))],
      };
    }
    return null;
  }

  // Takeoff/requirement reports aggregate per-item line details from the engine
  // data model. Fetched on demand to avoid loading every module up front.
  async function buildTakeoff(kind) {
    const details = await Promise.all(items.map((it) => api.modules.get(it.id).catch(() => null)));
    const agg = new Map();
    const addTo = (key, name, unit, qty, cost) => {
      const cur = agg.get(key) || { name, unit, qty: 0, cost: 0 };
      cur.qty += qty; cur.cost += cost; agg.set(key, cur);
    };
    for (const d of details) {
      if (!d) continue;
      if (kind === "materialTakeoff") for (const l of d.materialLines || [])
        addTo(`m-${l.materialId}-${l.name}`, l.name, l.unit || "", Number(l.quantity) || 0, Number(l.cost) || 0);
      if (kind === "laborRequirement") for (const l of d.laborLines || [])
        addTo(`l-${l.specializationId}-${l.name}`, l.name, l.unit || "hr", Number(l.quantity) || 0, Number(l.cost) || 0);
      if (kind === "equipmentRequirement") for (const l of d.equipmentLines || [])
        addTo(`e-${l.equipmentId}-${l.name}`, l.name, l.unit || "", Number(l.quantity) || 0, Number(l.cost) || 0);
      if (kind === "subcontractRequirement") for (const l of d.subcontractLines || [])
        addTo(`s-${l.description}`, l.description, l.unit || "", Number(l.quantity) || 0, Number(l.cost) || 0);
    }
    const titleMap = {
      materialTakeoff: "Material Takeoff", laborRequirement: "Labor Requirement",
      equipmentRequirement: "Equipment Requirement", subcontractRequirement: "Subcontract Requirement",
    };
    const list = [...agg.values()].sort((a, b) => a.name.localeCompare(b.name));
    return {
      title: titleMap[kind],
      headers: ["Description", "Unit", "Quantity", "Cost"],
      rows: list.map((r) => [r.name, r.unit, num(r.qty), money(r.cost)]),
      footer: ["", "", "Total", money(list.reduce((s, r) => s + r.cost, 0))],
    };
  }

  async function generate() {
    setBusy(true);
    try {
      const takeoff = ["materialTakeoff", "laborRequirement", "equipmentRequirement", "subcontractRequirement"];
      const r = takeoff.includes(type) ? await buildTakeoff(type) : buildSimple(type);
      setReport(r);
    } catch (e) { setError?.(e.message); }
    finally { setBusy(false); }
  }

  function toMatrix(r) {
    const body = r.rows.map((row) => Array.isArray(row) && row[0]?.span ? [row[0].text] : row);
    return [r.headers, ...body, r.footer];
  }
  function exportExcel(r) {
    const ws = XLSX.utils.aoa_to_sheet(toMatrix(r));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    XLSX.writeFile(wb, `${type}.xlsx`);
  }
  function exportCsv(r) {
    const ws = XLSX.utils.aoa_to_sheet(toMatrix(r));
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `${type}.csv`; a.click();
    URL.revokeObjectURL(a.href);
  }
  function exportPdf(r) {
    const w = window.open("", "_blank");
    if (!w) { setError?.("Popup blocked — allow popups to print/PDF."); return; }
    const rowsHtml = r.rows.map((row) => {
      if (Array.isArray(row) && row[0]?.span) {
        return `<tr class="${row[0].cls}"><td colspan="${r.headers.length}"><strong>${esc(row[0].text)}</strong></td></tr>`;
      }
      return `<tr>${row.map((c) => `<td>${esc(String(c ?? ""))}</td>`).join("")}</tr>`;
    }).join("");
    w.document.write(`<!doctype html><html><head><title>${esc(r.title)}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;padding:24px;color:#111}
        h1{font-size:18px;margin:0 0 4px} .meta{color:#666;font-size:12px;margin-bottom:16px}
        table{border-collapse:collapse;width:100%;font-size:12px}
        th,td{border:1px solid #ccc;padding:4px 8px;text-align:left}
        th{background:#f0f3f8} tr.division td{background:#e8eef9} tr.section td{background:#f5f7fb}
        tfoot td{font-weight:bold;background:#f0f3f8}
      </style></head><body>
      <h1>${esc(r.title)}</h1>
      <div class="meta">Currency: ${getActiveCurrency()} · Generated ${new Date().toLocaleString()}</div>
      <table><thead><tr>${r.headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot><tr>${r.footer.map((c) => `<td>${esc(String(c ?? ""))}</td>`).join("")}</tr></tfoot>
      </table></body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal boq-reports-modal" onClick={(e) => e.stopPropagation()}>
        <h3>BOQ Reports</h3>
        <div className="boq-reports-body">
          <div className="boq-reports-list">
            {REPORTS.map((r) => (
              <label key={r.key} className={`boq-report-opt ${type === r.key ? "selected" : ""}`}>
                <input type="radio" name="rep" checked={type === r.key} onChange={() => { setType(r.key); setReport(null); }} />
                {r.label}
              </label>
            ))}
          </div>
          <div className="boq-reports-preview">
            {!report ? (
              <p className="empty-state">Choose a report and click Generate.</p>
            ) : (
              <div className="boq-report-table-wrap">
                <h4>{report.title}</h4>
                <table className="boq-report-table">
                  <thead><tr>{report.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {report.rows.slice(0, 500).map((row, i) => (
                      Array.isArray(row) && row[0]?.span
                        ? <tr key={i} className={row[0].cls}><td colSpan={report.headers.length}><strong>{row[0].text}</strong></td></tr>
                        : <tr key={i}>{row.map((c, j) => <td key={j}>{c}</td>)}</tr>
                    ))}
                  </tbody>
                  <tfoot><tr>{report.footer.map((c, j) => <td key={j}>{c}</td>)}</tr></tfoot>
                </table>
                {report.rows.length > 500 && <p className="boq-report-note">Showing first 500 rows in preview; export for the full report.</p>}
              </div>
            )}
          </div>
        </div>
        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>Close</button>
          <button className="primary-button" onClick={generate} disabled={busy}>{busy ? "Generating…" : "Generate"}</button>
          {report && (
            <>
              <button className="secondary-button" onClick={() => exportPdf(report)}>PDF</button>
              <button className="secondary-button" onClick={() => exportExcel(report)}>Excel</button>
              <button className="secondary-button" onClick={() => exportCsv(report)}>CSV</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const num = (v) => (Number(v) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const pct = (v, t) => (t ? `${((v / t) * 100).toFixed(1)}%` : "0%");
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
