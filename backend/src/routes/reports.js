import { Router } from "express";
import * as XLSX from "xlsx";
import { db } from "../db.js";
import {
  buildBOQ, buildDetailedEstimate, buildResourceSummary, buildAssemblySummary,
  buildProjectCostSummary, buildWbsSummary, buildCostBreakdown, buildUpaReport,
  buildProcurementSummary, buildSupplierComparison, boqToRows,
  buildGRReport, buildGRSummary, buildGRCategoryReport,
  buildRevisionComparison,
} from "../services/reportService.js";
import { budgetVsActual, earnedValue, cashFlow, financialDashboard, committedCost, actualCostByCategory } from "../services/costControl.js";

const router = Router();

// Parse shared query/body options for report generation.
function parseOpts(req) {
  const src = req.method === "GET" ? req.query : req.body;
  let include = src.include;
  if (typeof include === "string") { try { include = JSON.parse(include); } catch { include = undefined; } }
  let filters = src.filters;
  if (typeof filters === "string") { try { filters = JSON.parse(filters); } catch { filters = {}; } }
  return {
    groupBy: src.groupBy,
    scenarioId: src.scenarioId ? Number(src.scenarioId) : null,
    sheetId: src.sheetId ? Number(src.sheetId) : null,
    grCategory: src.grCategory || null,
    useMarkup: src.useMarkup !== "false" && src.useMarkup !== false,
    include,
    filters: filters || {},
  };
}

// Dispatch a report type to its builder. Returns { kind, data } where kind
// drives how the frontend renders and how export flattens it.
function generate(reportType, projectId, opts) {
  switch (reportType) {
    case "boq": return { kind: "boq", data: buildBOQ(projectId, opts) };
    case "detailed-estimate": return { kind: "boq", data: buildDetailedEstimate(projectId, opts) };
    case "material-summary": return { kind: "summary", data: buildResourceSummary(projectId, "material") };
    case "labor-summary": return { kind: "summary", data: buildResourceSummary(projectId, "labor") };
    case "equipment-summary": return { kind: "summary", data: buildResourceSummary(projectId, "equipment") };
    case "subcontract-summary": return { kind: "summary", data: buildResourceSummary(projectId, "subcontract") };
    case "other-summary": return { kind: "summary", data: buildResourceSummary(projectId, "other") };
    case "assembly-summary": return { kind: "summary", data: buildAssemblySummary(projectId) };
    case "cost-breakdown": return { kind: "breakdown", data: buildCostBreakdown(projectId, opts) };
    case "project-cost-summary": return { kind: "project", data: buildProjectCostSummary(projectId, opts) };
    case "wbs-summary": return { kind: "wbs", data: buildWbsSummary(projectId, opts) };
    case "upa-report": return { kind: "upa", data: buildUpaReport() };
    case "procurement-summary": return { kind: "procurement", data: buildProcurementSummary() };
    case "supplier-comparison": return { kind: "supplier", data: buildSupplierComparison() };
    case "gr-estimate": return { kind: "gr", data: buildGRReport(opts.sheetId) };
    case "gr-boq": return { kind: "gr", data: buildGRReport(opts.sheetId) };
    case "gr-summary": return { kind: "gr-summary", data: buildGRSummary(opts.sheetId) };
    case "gr-staff": return { kind: "gr", data: buildGRCategoryReport(opts.sheetId, "Project Staff") };
    case "gr-temp-facilities": return { kind: "gr", data: buildGRCategoryReport(opts.sheetId, "Temporary Facilities") };
    case "gr-temp-utilities": return { kind: "gr", data: buildGRCategoryReport(opts.sheetId, "Temporary Utilities") };
    case "gr-safety": return { kind: "gr", data: buildGRCategoryReport(opts.sheetId, "Safety Requirements") };
    case "gr-qaqc": return { kind: "gr", data: buildGRCategoryReport(opts.sheetId, "Quality Assurance / Quality Control") };
    case "gr-testing": return { kind: "gr", data: buildGRCategoryReport(opts.sheetId, "Testing & Commissioning") };
    case "gr-closeout": return { kind: "gr", data: buildGRCategoryReport(opts.sheetId, "Project Closeout") };
    case "cc-budget-vs-actual": return { kind: "kv", data: kvFromObject(budgetVsActual(projectId)) };
    case "cc-committed": return { kind: "kv", data: kvFromObject(committedCost(projectId)) };
    case "cc-earned-value": return { kind: "kv", data: kvFromObject(earnedValue(projectId)) };
    case "cc-forecast": return { kind: "kv", data: kvFromObject(financialDashboard(projectId)) };
    case "cc-cash-flow": return { kind: "cashflow", data: cashFlow(projectId) };
    case "cc-budget": return { kind: "kv", data: kvFromObject(budgetReport(projectId)) };
    case "cc-actual-cost": return { kind: "summary", data: actualCostReport(projectId) };
    case "cc-variance": return { kind: "kv", data: kvFromObject(varianceReport(projectId)) };
    default: return null;
  }
}

export const REPORT_TYPES = [
  { key: "boq", label: "Bill of Quantities", needsProject: true },
  { key: "detailed-estimate", label: "Detailed Estimate", needsProject: true },
  { key: "cost-breakdown", label: "Cost Breakdown", needsProject: true },
  { key: "material-summary", label: "Material Summary", needsProject: true },
  { key: "labor-summary", label: "Labor Summary", needsProject: true },
  { key: "equipment-summary", label: "Equipment Summary", needsProject: true },
  { key: "subcontract-summary", label: "Subcontract Summary", needsProject: true },
  { key: "other-summary", label: "Other Cost Summary", needsProject: true },
  { key: "assembly-summary", label: "Assembly Summary", needsProject: true },
  { key: "upa-report", label: "Unit Price Analysis Report", needsProject: false },
  { key: "procurement-summary", label: "Procurement Summary", needsProject: false },
  { key: "supplier-comparison", label: "Supplier Comparison Report", needsProject: false },
  { key: "project-cost-summary", label: "Project Cost Summary", needsProject: true },
  { key: "wbs-summary", label: "WBS Summary", needsProject: true },
  { key: "gr-estimate", label: "General Requirements Estimate", needsSheet: true },
  { key: "gr-boq", label: "General Requirements BOQ", needsSheet: true },
  { key: "gr-summary", label: "General Requirements Summary", needsSheet: true },
  { key: "gr-staff", label: "Project Staff Cost Report", needsSheet: true },
  { key: "gr-temp-facilities", label: "Temporary Facilities Report", needsSheet: true },
  { key: "gr-temp-utilities", label: "Temporary Utilities Report", needsSheet: true },
  { key: "gr-safety", label: "Safety Cost Report", needsSheet: true },
  { key: "gr-qaqc", label: "QAQC Report", needsSheet: true },
  { key: "gr-testing", label: "Testing & Commissioning Report", needsSheet: true },
  { key: "gr-closeout", label: "Project Closeout Report", needsSheet: true },
  { key: "cc-budget-vs-actual", label: "Budget vs Actual", needsProject: true },
  { key: "cc-committed", label: "Committed Cost", needsProject: true },
  { key: "cc-earned-value", label: "Earned Value Report", needsProject: true },
  { key: "cc-forecast", label: "Forecast / Profit Analysis", needsProject: true },
  { key: "cc-cash-flow", label: "Cash Flow Report", needsProject: true },
  { key: "cc-budget", label: "Budget Report", needsProject: true },
  { key: "cc-actual-cost", label: "Actual Cost Report", needsProject: true },
  { key: "cc-variance", label: "Variance Report", needsProject: true },
];

// Budget report: original / revised / current forecast / remaining.
function budgetReport(projectId) {
  const bva = budgetVsActual(projectId);
  const fd = financialDashboard(projectId);
  return {
    originalBudget: bva.originalBudget,
    revisedBudget: bva.revisedBudget,
    approvedBudget: bva.budget,
    committed: bva.committed,
    currentForecast: fd.forecastFinalCost,
    remainingBudget: bva.remaining,
  };
}

// Actual cost report: a summary-kind breakdown by category.
function actualCostReport(projectId) {
  const acc = actualCostByCategory(projectId);
  return {
    title: "Actual Cost Report",
    rows: Object.entries(acc.byCategory).map(([name, amount]) => ({ code: "", description: name, unit: "", quantity: "", amount })),
    total: acc.total,
  };
}

// Variance report: budget vs actual with variance and variance %.
function varianceReport(projectId) {
  const bva = budgetVsActual(projectId);
  return {
    budget: bva.budget,
    actual: bva.actual,
    committed: bva.committed,
    variance: bva.variance,
    variancePct: bva.variancePct,
    remaining: bva.remaining,
  };
}

// Flatten a flat object to {Metric, Value} rows.
function kvFromObject(obj) {
  return Object.entries(obj)
    .filter(([, v]) => typeof v !== "object" || v === null)
    .map(([Metric, Value]) => ({ Metric, Value: typeof Value === "number" ? Math.round(Value * 100) / 100 : Value }));
}

router.get("/types", (req, res) => res.json(REPORT_TYPES));

// Generate a report as JSON (for on-screen preview / print).
router.get("/generate/:reportType", (req, res) => {
  const { reportType } = req.params;
  const projectId = req.query.projectId ? Number(req.query.projectId) : null;
  const meta = REPORT_TYPES.find((t) => t.key === reportType);
  if (!meta) return res.status(400).json({ error: "Unknown report type" });
  if (meta.needsProject && !projectId) return res.status(400).json({ error: "projectId is required for this report" });
  if (meta.needsSheet && !req.query.sheetId) return res.status(400).json({ error: "sheetId is required for this report" });

  const result = generate(reportType, projectId, parseOpts(req));
  if (!result || !result.data) return res.status(404).json({ error: "No data (project not found?)" });

  // Record generation history.
  if (req.query.record === "true") {
    const revision = projectId ? (db.prepare("SELECT MAX(revisionNumber) AS m FROM estimate_revisions WHERE projectId = ?").get(projectId)?.m ?? 0) : null;
    db.prepare("INSERT INTO report_history (projectId, reportType, scenarioId, revision, generatedBy, config, createdAt) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))")
      .run(projectId, reportType, req.query.scenarioId ? Number(req.query.scenarioId) : null, revision, req.query.generatedBy ?? null, JSON.stringify(parseOpts(req)));
  }

  res.json({ reportType, label: meta.label, ...result, generatedAt: new Date().toISOString() });
});

// Flatten a report's data to rows for spreadsheet export.
function reportToRows(kind, data) {
  if (kind === "boq") return boqToRows(data);
  if (kind === "summary") return data.rows.map((r) => ({ Code: r.code, Description: r.description, Unit: r.unit, Quantity: r.quantity, Amount: r.amount }))
    .concat([{ Code: "", Description: "TOTAL", Unit: "", Quantity: "", Amount: data.total }]);
  if (kind === "upa") return data.upas.map((u) => ({ Code: u.code, Description: u.description, Trade: u.trade, Unit: u.unit, "Material": u.materialCost, "Labor": u.laborCost, "Equipment": u.equipmentCost, "Direct Cost": u.directCost, "Unit Rate": u.unitRate }));
  if (kind === "wbs") return data.wbsCategories.map((c) => ({ Category: c.name, Material: c.materialCost, Labor: c.laborCost, Equipment: c.equipmentCost, Subcontract: c.subcontractCost, Other: c.otherCost, "Direct Cost": c.directCost }));
  if (kind === "breakdown" || kind === "project") {
    const w = data.waterfall;
    const rows = [
      ["Direct Cost", w.directCost],
      ...w.indirectLines.map((l) => [`+ ${l.name}`, l.amount]),
      ["Subtotal", w.subtotal],
      ...w.vatLines.map((l) => [`+ ${l.name}`, l.amount]),
      ["Bid Price", w.bidPrice],
      ...w.discountLines.map((l) => [`- ${l.name}`, l.amount]),
      ["Final Tender Price", w.finalTenderPrice],
    ];
    return rows.map(([Item, Amount]) => ({ Item, Amount }));
  }
  if (kind === "gr") {
    const out = [];
    for (const c of data.categories) {
      out.push({ Category: c.category, Description: "", Unit: "", Amount: "" });
      for (const it of c.items) out.push({ Category: "", Description: it.description, Unit: it.unit || "", Amount: it.amount });
      out.push({ Category: "", Description: `Subtotal — ${c.category}`, Unit: "", Amount: c.total });
    }
    out.push({ Category: "", Description: "GRAND TOTAL", Unit: "", Amount: data.grandTotal });
    return out;
  }
  if (kind === "gr-summary") return data.rows.map((r) => ({ Category: r.category, Total: r.total })).concat([{ Category: "GRAND TOTAL", Total: data.grandTotal }]);
  if (kind === "kv") return data;
  if (kind === "cashflow") return data.series;
  if (kind === "procurement") return data.rows.map((r) => ({ Code: r.code, Description: r.description, Unit: r.unit, "Current Price": r.unitPrice, Quotes: r.quotes, "Selected Supplier": r.selectedSupplier || "" }));
  if (kind === "supplier") return data.rows.map((r) => ({ Code: r.code, Description: r.name, Unit: r.unit, Lowest: r.lowest, Highest: r.highest, Average: r.average }));
  return [];
}

// Build a worksheet with auto-width columns and a frozen header row.
function sheetFromRows(rows) {
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: "No data" }]);
  const cols = Object.keys(rows[0] || { Note: "" });
  ws["!cols"] = cols.map((c) => {
    const maxLen = Math.max(c.length, ...rows.map((r) => String(r[c] ?? "").length));
    return { wch: Math.min(60, Math.max(10, maxLen + 2)) };
  });
  ws["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" };
  return ws;
}

// Export a report as a professionally formatted xlsx workbook (or csv).
// xlsx: main report sheet + a Project Summary sheet (for project reports),
// auto-width columns, frozen header, and totals rows from reportToRows.
router.get("/export/:reportType", (req, res) => {
  const { reportType } = req.params;
  const projectId = req.query.projectId ? Number(req.query.projectId) : null;
  const meta = REPORT_TYPES.find((t) => t.key === reportType);
  if (!meta) return res.status(400).json({ error: "Unknown report type" });

  const result = generate(reportType, projectId, parseOpts(req));
  if (!result || !result.data) return res.status(404).json({ error: "No data" });

  const rows = reportToRows(result.kind, result.data);
  const fmt = req.query.format === "csv" ? "csv" : "xlsx";

  if (fmt === "csv") {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: "No data" }]);
    const buf = XLSX.write({ SheetNames: ["data"], Sheets: { data: ws } }, { type: "buffer", bookType: "csv" });
    res.set("Content-Disposition", `attachment; filename="${reportType}.csv"`);
    res.set("Content-Type", "text/csv");
    return res.send(buf);
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFromRows(rows), meta.label.slice(0, 28));
  // For project reports, add a second worksheet with the cost waterfall summary.
  if (projectId) {
    try {
      const summary = generate("project-cost-summary", projectId, {});
      if (summary?.data) XLSX.utils.book_append_sheet(wb, sheetFromRows(reportToRows("project", summary.data)), "Project Summary");
    } catch { /* summary is best-effort */ }
  }
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.set("Content-Disposition", `attachment; filename="${reportType}.xlsx"`);
  res.set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
});

// ── Revision comparison ──────────────────────────────────────────────────────
// Diff two estimate revisions (A vs B), highlighting added / removed / modified
// line items plus price and quantity changes.
router.get("/revision-comparison", (req, res) => {
  const a = Number(req.query.a);
  const b = Number(req.query.b);
  if (!a || !b) return res.status(400).json({ error: "a and b revision ids are required" });
  const result = buildRevisionComparison(a, b);
  if (!result) return res.status(404).json({ error: "Revision not found" });
  res.json(result);
});

// ── Templates ───────────────────────────────────────────────────────────────

router.get("/templates", (req, res) => {
  res.json(db.prepare("SELECT * FROM report_templates ORDER BY name").all().map((t) => ({ ...t, config: JSON.parse(t.config) })));
});

router.post("/templates", (req, res) => {
  const { name, reportType, config } = req.body;
  if (!name || !reportType) return res.status(400).json({ error: "name and reportType are required" });
  const result = db.prepare("INSERT INTO report_templates (name, reportType, config) VALUES (?, ?, ?)").run(name, reportType, JSON.stringify(config || {}));
  res.status(201).json({ ...db.prepare("SELECT * FROM report_templates WHERE id = ?").get(result.lastInsertRowid), config: config || {} });
});

router.delete("/templates/:id", (req, res) => {
  db.prepare("DELETE FROM report_templates WHERE id = ?").run(Number(req.params.id));
  res.status(204).end();
});

// ── History ───────────────────────────────────────────────────────────────

router.get("/history", (req, res) => {
  const projectId = req.query.projectId ? Number(req.query.projectId) : null;
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  const rows = projectId
    ? db.prepare("SELECT * FROM report_history WHERE projectId = ? ORDER BY id DESC LIMIT ?").all(projectId, limit)
    : db.prepare("SELECT * FROM report_history ORDER BY id DESC LIMIT ?").all(limit);
  res.json(rows.map((r) => ({ ...r, config: r.config ? JSON.parse(r.config) : null })));
});

export default router;
