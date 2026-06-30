import { db } from "../db.js";

// ════════════════════════════════════════════════════════════════════════════
// COST CALCULATION ENGINE
//
// Single source of truth for every cost calculation in the application. No
// other module — and no frontend code — should sum line items, apply markups,
// or compute a waterfall. They call into here.
//
// Layers, bottom-up:
//   assembly  -> breakdown by cost type, supports nested assemblies
//   module    -> breakdown by cost type = direct cost
//   project   -> WBS-category rollup + indirect-cost waterfall -> final price
//
// Performance: module costs are memoised against a cheap content signature so
// recalculating a project only re-sums the modules whose line items actually
// changed (incremental recalculation). 100k+ line items stay responsive
// because untouched modules are served from cache.
// ════════════════════════════════════════════════════════════════════════════

export const CALC_VERSION = "5.0.0";

const EMPTY_BREAKDOWN = () => ({
  material: 0,
  labor: 0,
  equipment: 0,
  subcontract: 0,
  other: 0,
});

function addBreakdown(target, source, multiplier = 1) {
  target.material += source.material * multiplier;
  target.labor += source.labor * multiplier;
  target.equipment += source.equipment * multiplier;
  target.subcontract += source.subcontract * multiplier;
  target.other += source.other * multiplier;
  return target;
}

function breakdownTotal(b) {
  return b.material + b.labor + b.equipment + b.subcontract + b.other;
}

// ── Assembly (recursive, with cycle guard) ──────────────────────────────────

const assemblyCache = new Map(); // assemblyId -> { signature, breakdown }

function assemblySignature(assemblyId) {
  const row = db
    .prepare("SELECT COUNT(*) AS c, COALESCE(MAX(updatedAt),'') AS u FROM assembly_items WHERE assemblyId = ?")
    .get(assemblyId);
  return `${row.c}:${row.u}`;
}

/**
 * Cost breakdown for a single assembly, exploded into its child cost types.
 * Nested assemblies (an assembly_item whose itemType references another
 * assembly via materialId is NOT how nesting works here — nesting is modelled
 * by an assembly_item of itemType 'assembly' carrying an assemblyId in its
 * `materialId`-style column). We detect nesting through the dedicated
 * `childAssemblyId` column when present; a `_seen` set guards against cycles.
 */
export function calculateAssembly(assemblyId, _seen = new Set()) {
  if (_seen.has(assemblyId)) return EMPTY_BREAKDOWN(); // cycle guard
  _seen.add(assemblyId);

  const sig = assemblySignature(assemblyId);
  // Cache only valid for non-nested (top-level) calls where _seen is fresh;
  // nested explosions skip the cache to keep the cycle guard correct.
  const cacheable = _seen.size === 1;
  if (cacheable) {
    const cached = assemblyCache.get(assemblyId);
    if (cached && cached.signature === sig) return { ...cached.breakdown };
  }

  const items = db
    .prepare("SELECT itemType, childAssemblyId, quantity, unitPriceAtEntry, hourlyRateAtEntry, cost FROM assembly_items WHERE assemblyId = ?")
    .all(assemblyId);

  const breakdown = EMPTY_BREAKDOWN();
  for (const item of items) {
    if (item.itemType === "assembly" && item.childAssemblyId) {
      const child = calculateAssembly(item.childAssemblyId, _seen);
      addBreakdown(breakdown, child, item.quantity ?? 1);
    } else if (item.itemType === "material") {
      breakdown.material += (item.quantity ?? 0) * (item.unitPriceAtEntry ?? 0);
    } else if (item.itemType === "equipment") {
      breakdown.equipment += (item.quantity ?? 0) * (item.unitPriceAtEntry ?? 0);
    } else if (item.itemType === "labor") {
      breakdown.labor += (item.quantity ?? 0) * (item.hourlyRateAtEntry ?? 0);
    } else if (item.itemType === "subcontract") {
      breakdown.subcontract += item.cost ?? 0;
    } else {
      breakdown.other += item.cost ?? 0;
    }
  }

  if (cacheable) assemblyCache.set(assemblyId, { signature: sig, breakdown: { ...breakdown } });
  return breakdown;
}

export function calculateAssemblyResult(assemblyId) {
  const breakdown = calculateAssembly(assemblyId);
  return { ...breakdown, total: breakdownTotal(breakdown) };
}

// ── Module (incremental cache) ──────────────────────────────────────────────

const moduleCache = new Map(); // moduleId -> { signature, breakdown }

// A module's content signature is the cheapest thing that changes whenever any
// of its line items change: per-table row count + latest updatedAt.
function moduleSignature(moduleId) {
  const tables = [
    "module_materials", "module_labor", "module_equipment",
    "module_subcontract", "module_other_costs", "module_assemblies",
  ];
  let sig = "";
  for (const t of tables) {
    const row = db
      .prepare(`SELECT COUNT(*) AS c, COALESCE(MAX(updatedAt),'') AS u FROM ${t} WHERE workModuleId = ?`)
      .get(moduleId);
    sig += `${row.c}:${row.u}|`;
  }
  return sig;
}

export function calculateModule(moduleId) {
  const sig = moduleSignature(moduleId);
  const cached = moduleCache.get(moduleId);
  if (cached && cached.signature === sig) return { ...cached.breakdown };

  const breakdown = EMPTY_BREAKDOWN();

  breakdown.material = db
    .prepare("SELECT COALESCE(SUM(quantity * unitPriceAtEntry),0) AS s FROM module_materials WHERE workModuleId = ?")
    .get(moduleId).s;
  breakdown.labor = db
    .prepare("SELECT COALESCE(SUM(quantity * hourlyRateAtEntry),0) AS s FROM module_labor WHERE workModuleId = ?")
    .get(moduleId).s;
  breakdown.equipment = db
    .prepare("SELECT COALESCE(SUM(quantity * unitPriceAtEntry),0) AS s FROM module_equipment WHERE workModuleId = ?")
    .get(moduleId).s;
  breakdown.subcontract = db
    .prepare("SELECT COALESCE(SUM(cost),0) AS s FROM module_subcontract WHERE workModuleId = ?")
    .get(moduleId).s;
  breakdown.other = db
    .prepare("SELECT COALESCE(SUM(cost),0) AS s FROM module_other_costs WHERE workModuleId = ?")
    .get(moduleId).s;

  // Module-level assembly references explode into their cost types so the
  // project rollup attributes assembly costs to the right buckets.
  const asmRefs = db
    .prepare("SELECT assemblyId, quantity FROM module_assemblies WHERE workModuleId = ?")
    .all(moduleId);
  for (const ref of asmRefs) {
    const child = calculateAssembly(ref.assemblyId);
    addBreakdown(breakdown, child, ref.quantity ?? 1);
  }

  moduleCache.set(moduleId, { signature: sig, breakdown: { ...breakdown } });
  return breakdown;
}

export function calculateModuleResult(moduleId) {
  const breakdown = calculateModule(moduleId);
  return {
    materialCost: breakdown.material,
    laborCost: breakdown.labor,
    equipmentCost: breakdown.equipment,
    subcontractCost: breakdown.subcontract,
    otherCost: breakdown.other,
    directCost: breakdownTotal(breakdown),
  };
}

// Invalidate a module's cached cost (call after any line-item mutation if you
// want immediate consistency without waiting for the signature to change).
export function invalidateModule(moduleId) {
  moduleCache.delete(moduleId);
}

// ── Indirect-cost waterfall ─────────────────────────────────────────────────

/**
 * Apply the configured indirect costs to a direct cost, in the fixed
 * professional order:
 *
 *   Direct Cost
 *   + Indirect Costs (mobilisation, overhead, profit, contingency, …)
 *   = Subtotal
 *   + VAT
 *   = Bid Price
 *   - Discount
 *   = Final Tender Price
 *   (− Retention, shown as a memo against the final price)
 *
 * Each item is percentage|fixed and applies per-project or per-module (a fixed
 * per-module amount is multiplied by moduleCount).
 */
export function applyIndirectCosts(directCost, items, moduleCount = 1) {
  const enabled = items.filter((i) => i.enabled);

  function amountOf(item, base) {
    if (item.method === "percentage") return base * (item.value / 100);
    // fixed
    return item.appliesTo === "module" ? item.value * moduleCount : item.value;
  }

  const indirectLines = [];
  let indirectTotal = 0;
  for (const item of enabled.filter((i) => i.kind === "indirect")) {
    const amount = amountOf(item, directCost);
    indirectLines.push({ id: item.id, name: item.name, kind: item.kind, method: item.method, value: item.value, amount });
    indirectTotal += amount;
  }

  const subtotal = directCost + indirectTotal;

  const vatLines = [];
  let vatTotal = 0;
  for (const item of enabled.filter((i) => i.kind === "vat")) {
    const amount = amountOf(item, subtotal);
    vatLines.push({ id: item.id, name: item.name, kind: item.kind, method: item.method, value: item.value, amount });
    vatTotal += amount;
  }

  const bidPrice = subtotal + vatTotal;

  const discountLines = [];
  let discountTotal = 0;
  for (const item of enabled.filter((i) => i.kind === "discount")) {
    const amount = amountOf(item, bidPrice);
    discountLines.push({ id: item.id, name: item.name, kind: item.kind, method: item.method, value: item.value, amount });
    discountTotal += amount;
  }

  const finalTenderPrice = bidPrice - discountTotal;

  const retentionLines = [];
  let retentionTotal = 0;
  for (const item of enabled.filter((i) => i.kind === "retention")) {
    const amount = amountOf(item, finalTenderPrice);
    retentionLines.push({ id: item.id, name: item.name, kind: item.kind, method: item.method, value: item.value, amount });
    retentionTotal += amount;
  }

  return {
    directCost,
    indirectLines,
    indirectTotal,
    subtotal,
    vatLines,
    vatTotal,
    bidPrice,
    discountLines,
    discountTotal,
    finalTenderPrice,
    retentionLines,
    retentionTotal,
    netPayable: finalTenderPrice - retentionTotal,
  };
}

// ── Project (WBS rollup + waterfall + audit) ────────────────────────────────

export function calculateProject(projectId, { scenarioId = null, writeAudit = false } = {}) {
  const modules = db
    .prepare("SELECT id, name, wbsCategoryId FROM work_modules WHERE projectId = ? AND deletedAt IS NULL")
    .all(projectId);

  const categories = db.prepare("SELECT id, name FROM wbs_categories ORDER BY sortOrder ASC, id ASC").all();
  const categoryMap = new Map(categories.map((c) => [c.id, { id: c.id, name: c.name, breakdown: EMPTY_BREAKDOWN(), directCost: 0, moduleCount: 0 }]));
  const uncategorized = { id: null, name: "Uncategorized", breakdown: EMPTY_BREAKDOWN(), directCost: 0, moduleCount: 0 };

  const projectBreakdown = EMPTY_BREAKDOWN();
  const moduleResults = [];

  for (const m of modules) {
    const breakdown = calculateModule(m.id);
    const directCost = breakdownTotal(breakdown);
    moduleResults.push({ id: m.id, name: m.name, ...breakdown, directCost });
    addBreakdown(projectBreakdown, breakdown);

    const bucket = m.wbsCategoryId != null && categoryMap.has(m.wbsCategoryId)
      ? categoryMap.get(m.wbsCategoryId)
      : uncategorized;
    addBreakdown(bucket.breakdown, breakdown);
    bucket.directCost += directCost;
    bucket.moduleCount += 1;
  }

  const wbsCategories = [...categoryMap.values()];
  if (uncategorized.moduleCount > 0) wbsCategories.push(uncategorized);

  const projectDirectCost = breakdownTotal(projectBreakdown);

  // Indirect costs: scenario-scoped if scenarioId given, else project-wide
  // (scenarioId IS NULL) items.
  const indirectItems = scenarioId
    ? db.prepare("SELECT * FROM indirect_cost_items WHERE projectId = ? AND scenarioId = ? ORDER BY sortOrder ASC, id ASC").all(projectId, scenarioId)
    : db.prepare("SELECT * FROM indirect_cost_items WHERE projectId = ? AND scenarioId IS NULL ORDER BY sortOrder ASC, id ASC").all(projectId);

  const normalizedItems = indirectItems.map((i) => ({ ...i, enabled: !!i.enabled }));
  const waterfall = applyIndirectCosts(projectDirectCost, normalizedItems, modules.length);

  const result = {
    projectId,
    scenarioId,
    calcVersion: CALC_VERSION,
    calculatedAt: new Date().toISOString(),
    directCostBreakdown: {
      materialCost: projectBreakdown.material,
      laborCost: projectBreakdown.labor,
      equipmentCost: projectBreakdown.equipment,
      subcontractCost: projectBreakdown.subcontract,
      otherCost: projectBreakdown.other,
    },
    wbsCategories: wbsCategories.map((c) => ({
      id: c.id,
      name: c.name,
      moduleCount: c.moduleCount,
      materialCost: c.breakdown.material,
      laborCost: c.breakdown.labor,
      equipmentCost: c.breakdown.equipment,
      subcontractCost: c.breakdown.subcontract,
      otherCost: c.breakdown.other,
      directCost: c.directCost,
    })),
    modules: moduleResults,
    waterfall,
  };

  if (writeAudit) {
    db.prepare(
      `INSERT INTO calculation_audit (projectId, scenarioId, calcVersion, formula, sourceData, totals, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(
      projectId,
      scenarioId,
      CALC_VERSION,
      "FinalTenderPrice = (DirectCost + Indirect) + VAT - Discount; NetPayable = FinalTenderPrice - Retention",
      JSON.stringify({ moduleCount: modules.length, lineItemSources: "module_* + assemblies", indirectItemCount: normalizedItems.length }),
      JSON.stringify({ projectDirectCost, ...waterfall })
    );
  }

  return result;
}

// Clear all caches (used by tests and after bulk imports).
export function clearCaches() {
  moduleCache.clear();
  assemblyCache.clear();
}
