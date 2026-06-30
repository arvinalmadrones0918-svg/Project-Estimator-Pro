import { db } from "../db.js";
import { calculateProject, calculateUPA, calculateGRSheet } from "./costEngine.js";

// ════════════════════════════════════════════════════════════════════════════
// REPORTING SERVICE
//
// Assembles report data by ENUMERATING line items for display and delegating
// every cost total to the cost engine (calculateProject / calculateUPA). It
// never re-implements the markup/indirect/waterfall math — those come from the
// engine, keeping a single source of truth.
//
// Line "amount" is the inherent per-line value (quantity × frozen rate); the
// report subtotals these for display. With all cost types included, the report
// grand total reconciles with the engine's project direct cost.
// ════════════════════════════════════════════════════════════════════════════

const TYPE_LABELS = {
  material: "Materials",
  labor: "Labor",
  equipment: "Equipment",
  subcontract: "Subcontract",
  other: "Other Costs",
  assembly: "Assemblies",
  upa: "Unit Price Analysis",
};

// Normalised BOQ line rows for a project, one row per module line item across
// all cost types. wbsCategory / wbsSubcategory come from the owning module.
function enumerateLines(projectId, { scenarioId } = {}) {
  const modules = db
    .prepare(
      `SELECT wm.id, wm.name AS moduleName, wm.wbsCategoryId, wm.wbsSubcategoryId,
              wc.name AS wbsCategory, ws.name AS wbsSubcategory
       FROM work_modules wm
       LEFT JOIN wbs_categories wc ON wc.id = wm.wbsCategoryId
       LEFT JOIN wbs_subcategories ws ON ws.id = wm.wbsSubcategoryId
       WHERE wm.projectId = ? AND wm.deletedAt IS NULL
       ORDER BY wc.sortOrder, wm.sortOrder, wm.id`
    )
    .all(projectId);

  const lines = [];
  for (const m of modules) {
    const ctx = { moduleId: m.id, moduleName: m.moduleName, wbsCategory: m.wbsCategory || "Uncategorized", wbsSubcategory: m.wbsSubcategory || "—" };

    for (const r of db.prepare(
      `SELECT mm.quantity, mm.unitPriceAtEntry AS rate, mm.markup, mm.status, mm.notes,
              mt.code, mt.name AS description, mt.unit, mt.category
       FROM module_materials mm JOIN materials mt ON mt.id = mm.materialId WHERE mm.workModuleId = ?`).all(m.id))
      lines.push({ ...ctx, type: "material", ...r });

    for (const r of db.prepare(
      `SELECT ml.quantity, ml.hourlyRateAtEntry AS rate, ml.markup, ml.status, ml.notes,
              s.code, s.name AS description, 'hr' AS unit, s.category
       FROM module_labor ml JOIN labor_specializations s ON s.id = ml.specializationId WHERE ml.workModuleId = ?`).all(m.id))
      lines.push({ ...ctx, type: "labor", ...r });

    for (const r of db.prepare(
      `SELECT me.quantity, me.unitPriceAtEntry AS rate, me.markup, me.status, me.notes,
              e.code, e.name AS description, e.unit, e.category
       FROM module_equipment me JOIN equipment e ON e.id = me.equipmentId WHERE me.workModuleId = ?`).all(m.id))
      lines.push({ ...ctx, type: "equipment", ...r });

    for (const r of db.prepare(
      `SELECT 1 AS quantity, cost AS rate, markup, status, notes, code, description, unit, category
       FROM module_subcontract WHERE workModuleId = ?`).all(m.id))
      lines.push({ ...ctx, type: "subcontract", ...r });

    for (const r of db.prepare(
      `SELECT 1 AS quantity, cost AS rate, markup, status, notes, code, description, unit, category
       FROM module_other_costs WHERE workModuleId = ?`).all(m.id))
      lines.push({ ...ctx, type: "other", ...r });

    for (const r of db.prepare(
      `SELECT ma.quantity, ma.unitCostAtEntry AS rate, ma.markup, ma.status, ma.notes,
              a.code, a.name AS description, a.unit, 'Assembly' AS category
       FROM module_assemblies ma JOIN assemblies a ON a.id = ma.assemblyId WHERE ma.workModuleId = ?`).all(m.id))
      lines.push({ ...ctx, type: "assembly", ...r });

    for (const r of db.prepare(
      `SELECT mu.quantity, mu.unitRateAtEntry AS rate, mu.markup, mu.status, mu.notes,
              u.code, u.description, u.unit, u.trade AS category
       FROM module_upa mu JOIN unit_price_analyses u ON u.id = mu.upaId WHERE mu.workModuleId = ?`).all(m.id))
      lines.push({ ...ctx, type: "upa", ...r });
  }

  return lines.map((l) => ({
    ...l,
    quantity: l.quantity ?? 1,
    rate: l.rate ?? 0,
    markup: l.markup ?? 0,
    amount: (l.quantity ?? 1) * (l.rate ?? 0),
    total: (l.quantity ?? 1) * (l.rate ?? 0) * (1 + (l.markup ?? 0) / 100),
  }));
}

// Default include set = every cost type.
function defaultInclude() {
  return { material: true, labor: true, equipment: true, subcontract: true, other: true, assembly: true, upa: true };
}

function applyFilters(lines, { include, filters = {} }) {
  const inc = { ...defaultInclude(), ...(include || {}) };
  return lines.filter((l) => {
    if (!inc[l.type]) return false;
    if (filters.trade && l.wbsCategory !== filters.trade) return false;
    if (filters.wbs && l.wbsCategory !== filters.wbs) return false;
    if (filters.subcategory && l.wbsSubcategory !== filters.subcategory) return false;
    if (filters.status && l.status && l.status !== filters.status) return false;
    if (filters.supplier && l.supplier && l.supplier !== filters.supplier) return false;
    return true;
  });
}

// ── Bill of Quantities ──────────────────────────────────────────────────────

export function buildBOQ(projectId, opts = {}) {
  const { groupBy = "wbs", useMarkup = true } = opts;
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
  if (!project) return null;

  const all = enumerateLines(projectId, opts);
  const filtered = applyFilters(all, opts);

  const groupKey = (l) => {
    switch (groupBy) {
      case "trade":
      case "wbs": return l.wbsCategory;
      case "category": return l.category || "Uncategorized";
      case "subcategory": return l.wbsSubcategory;
      case "project": return project.name;
      default: return l.wbsCategory;
    }
  };

  const groupsMap = new Map();
  for (const l of filtered) {
    const key = groupKey(l);
    if (!groupsMap.has(key)) groupsMap.set(key, []);
    groupsMap.get(key).push(l);
  }

  const amountField = useMarkup ? "total" : "amount";
  let itemNo = 0;
  const groups = [...groupsMap.entries()].map(([name, items], gi) => {
    const rows = items.map((l) => ({
      itemNo: `${gi + 1}.${++itemNo}`,
      code: l.code || "",
      description: l.description,
      type: l.type,
      unit: l.unit || "",
      quantity: l.quantity,
      rate: l.rate,
      markup: l.markup,
      amount: l[amountField],
      remarks: l.notes || "",
    }));
    const subtotal = rows.reduce((s, r) => s + r.amount, 0);
    return { name, rows, subtotal };
  });

  const grandTotal = groups.reduce((s, g) => s + g.subtotal, 0);
  return { project, groupBy, groups, grandTotal, lineCount: filtered.length, useMarkup };
}

// ── Resource summaries (material / labor / equipment / subcontract / other) ──

export function buildResourceSummary(projectId, type) {
  const lines = enumerateLines(projectId).filter((l) => l.type === type);
  const map = new Map();
  for (const l of lines) {
    const key = `${l.code || ""}|${l.description}`;
    if (!map.has(key)) map.set(key, { code: l.code || "", description: l.description, unit: l.unit || "", quantity: 0, amount: 0, rate: l.rate });
    const agg = map.get(key);
    agg.quantity += l.quantity;
    agg.amount += l.amount;
  }
  const rows = [...map.values()].sort((a, b) => b.amount - a.amount);
  return { type, label: TYPE_LABELS[type], rows, total: rows.reduce((s, r) => s + r.amount, 0) };
}

export function buildAssemblySummary(projectId) {
  return buildResourceSummary(projectId, "assembly");
}

// ── Project cost summary + WBS summary (totals from the engine) ─────────────

export function buildProjectCostSummary(projectId, opts = {}) {
  const calc = calculateProject(projectId, { scenarioId: opts.scenarioId ?? null });
  return calc;
}

export function buildWbsSummary(projectId, opts = {}) {
  const calc = calculateProject(projectId, { scenarioId: opts.scenarioId ?? null });
  return { project: calc.projectId, wbsCategories: calc.wbsCategories, directCost: calc.waterfall.directCost };
}

export function buildCostBreakdown(projectId, opts = {}) {
  const calc = calculateProject(projectId, { scenarioId: opts.scenarioId ?? null });
  return {
    directCostBreakdown: calc.directCostBreakdown,
    wbsCategories: calc.wbsCategories,
    waterfall: calc.waterfall,
  };
}

// ── UPA report ──────────────────────────────────────────────────────────────

export function buildUpaReport() {
  const upas = db.prepare("SELECT * FROM unit_price_analyses WHERE deletedAt IS NULL ORDER BY code, description").all();
  return {
    upas: upas.map((u) => {
      const calc = calculateUPA(u.id);
      return {
        code: u.code, description: u.description, trade: u.trade, unit: u.unit,
        revision: u.revision, version: u.version,
        materialCost: calc?.materialCost ?? 0, laborCost: calc?.laborCost ?? 0,
        equipmentCost: calc?.equipmentCost ?? 0, directCost: calc?.directCost ?? 0,
        unitRate: calc?.unitRate ?? 0,
      };
    }),
  };
}

// ── Procurement & supplier comparison (reuse procurement data) ──────────────

export function buildProcurementSummary() {
  const today = new Date().toISOString().slice(0, 10);
  const rows = db
    .prepare(
      `SELECT m.code, m.name AS description, m.unit, m.unitPrice,
              (SELECT COUNT(*) FROM material_quotations q WHERE q.materialId = m.id AND q.deletedAt IS NULL) AS quotes,
              (SELECT s.companyName FROM material_quotations q JOIN suppliers s ON s.id = q.supplierId
               WHERE q.materialId = m.id AND q.isSelected = 1 AND q.deletedAt IS NULL) AS selectedSupplier
       FROM materials m WHERE m.isActive = 1 AND m.deletedAt IS NULL ORDER BY m.name`
    )
    .all();
  return { rows, generatedAt: new Date().toISOString() };
}

export function buildSupplierComparison() {
  const materialIds = db.prepare("SELECT DISTINCT materialId FROM material_quotations WHERE deletedAt IS NULL").all().map((r) => r.materialId);
  const rows = materialIds.map((id) => {
    const material = db.prepare("SELECT code, name, unit FROM materials WHERE id = ?").get(id);
    const quotes = db
      .prepare(
        `SELECT s.companyName AS supplier, q.quotedUnitCost AS cost, q.isSelected, q.validityDate
         FROM material_quotations q JOIN suppliers s ON s.id = q.supplierId
         WHERE q.materialId = ? AND q.deletedAt IS NULL ORDER BY q.quotedUnitCost`
      )
      .all(id);
    const costs = quotes.map((q) => q.cost);
    return {
      ...material,
      quotes,
      lowest: costs.length ? Math.min(...costs) : null,
      highest: costs.length ? Math.max(...costs) : null,
      average: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null,
    };
  });
  return { rows };
}

// ── Detailed estimate (BOQ with every type, ungrouped flat detail) ──────────

export function buildDetailedEstimate(projectId, opts = {}) {
  return buildBOQ(projectId, { ...opts, groupBy: opts.groupBy ?? "wbs" });
}

// ── General Requirements reports (reuse the GR calculation in the engine) ───

// Full GR estimate/BOQ: every line grouped by category with subtotals.
export function buildGRReport(sheetId, { categoryFilter } = {}) {
  const sheet = db.prepare("SELECT * FROM gr_sheets WHERE id = ?").get(sheetId);
  if (!sheet) return null;
  const calc = calculateGRSheet(sheetId);
  let categories = calc.categories;
  if (categoryFilter) categories = categories.filter((c) => c.category === categoryFilter);
  return { sheet, categories, subtotal: calc.subtotal, grandTotal: calc.grandTotal,
    inflationAmount: calc.inflationAmount, escalationAmount: calc.escalationAmount,
    pctOfProjectValue: calc.pctOfProjectValue };
}

// GR summary: category totals only.
export function buildGRSummary(sheetId) {
  const r = buildGRReport(sheetId);
  if (!r) return null;
  return { sheet: r.sheet, rows: r.categories.map((c) => ({ category: c.category, total: c.total })),
    subtotal: r.subtotal, inflationAmount: r.inflationAmount, escalationAmount: r.escalationAmount, grandTotal: r.grandTotal };
}

// Single-category GR report (Project Staff, Temp Facilities, Safety, etc.).
export function buildGRCategoryReport(sheetId, category) {
  return buildGRReport(sheetId, { categoryFilter: category });
}

// Flatten any BOQ-shaped report to tabular rows for xlsx/csv export.
export function boqToRows(boq) {
  const out = [];
  for (const g of boq.groups) {
    out.push({ "Item No.": "", Code: "", Description: g.name, Unit: "", Quantity: "", "Unit Rate": "", Amount: "", Remarks: "" });
    for (const r of g.rows) {
      out.push({
        "Item No.": r.itemNo, Code: r.code, Description: r.description, Unit: r.unit,
        Quantity: r.quantity, "Unit Rate": r.rate, Amount: r.amount, Remarks: r.remarks,
      });
    }
    out.push({ "Item No.": "", Code: "", Description: `Subtotal — ${g.name}`, Unit: "", Quantity: "", "Unit Rate": "", Amount: g.subtotal, Remarks: "" });
  }
  out.push({ "Item No.": "", Code: "", Description: "GRAND TOTAL", Unit: "", Quantity: "", "Unit Rate": "", Amount: boq.grandTotal, Remarks: "" });
  return out;
}
