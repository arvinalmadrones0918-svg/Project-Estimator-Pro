import { db } from "../db.js";
import { calculateProject } from "./costEngine.js";

// ════════════════════════════════════════════════════════════════════════════
// COST CONTROL SERVICE
//
// The single place cost-control figures are derived. The budget baseline comes
// from the cost engine (calculateProject) — never recomputed here. Committed,
// actual, earned value and cash flow are aggregated from the cost-control
// tables and combined with that baseline.
// ════════════════════════════════════════════════════════════════════════════

// Create a budget snapshot from the project's approved estimate. The baseline
// amount is the engine's final tender price; the WBS breakdown is captured.
export function createBudgetFromEstimate(projectId, type = "original", note, createdBy) {
  const calc = calculateProject(projectId);
  const amount = calc.waterfall.finalTenderPrice;
  const lastVersion = db.prepare("SELECT MAX(version) AS m FROM budgets WHERE projectId = ? AND type = ?").get(projectId, type).m;
  const version = (lastVersion || 0) + 1;
  const snapshot = JSON.stringify({ waterfall: calc.waterfall, wbsCategories: calc.wbsCategories, directCostBreakdown: calc.directCostBreakdown });
  const r = db.prepare("INSERT INTO budgets (projectId, type, version, amount, snapshot, note, createdBy) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(projectId, type, version, amount, snapshot, note ?? null, createdBy ?? null);
  return db.prepare("SELECT * FROM budgets WHERE id = ?").get(r.lastInsertRowid);
}

// Latest budget of a given type (or the most recent of any type).
export function latestBudget(projectId, type) {
  if (type) return db.prepare("SELECT * FROM budgets WHERE projectId = ? AND type = ? ORDER BY version DESC LIMIT 1").get(projectId, type);
  return db.prepare("SELECT * FROM budgets WHERE projectId = ? ORDER BY id DESC LIMIT 1").get(projectId);
}

// Approved additive/deductive variation orders adjust the original into a
// revised budget.
export function approvedVOTotal(projectId) {
  const rows = db.prepare("SELECT nature, amount FROM variation_orders WHERE projectId = ? AND status = 'approved' AND deletedAt IS NULL").all(projectId);
  return rows.reduce((s, v) => s + (v.nature === "deductive" ? -v.amount : v.amount), 0);
}

export function committedCost(projectId) {
  const po = db.prepare("SELECT COALESCE(SUM(amount),0) AS s FROM purchase_orders WHERE projectId = ? AND status != 'cancelled' AND deletedAt IS NULL").get(projectId).s;
  const subs = db.prepare("SELECT COALESCE(SUM(contractAmount),0) AS s FROM subcontracts WHERE projectId = ? AND status != 'cancelled' AND deletedAt IS NULL").get(projectId).s;
  return { purchaseOrders: po, subcontracts: subs, total: po + subs };
}

export function actualCostByCategory(projectId) {
  const rows = db.prepare("SELECT category, COALESCE(SUM(amount),0) AS s FROM actual_costs WHERE projectId = ? AND deletedAt IS NULL GROUP BY category").all(projectId);
  const byCat = {};
  let total = 0;
  for (const r of rows) { byCat[r.category] = r.s; total += r.s; }
  return { byCategory: byCat, total };
}

// Budget vs Committed vs Actual with variance.
export function budgetVsActual(projectId) {
  const original = latestBudget(projectId, "original");
  const originalAmount = original ? original.amount : 0;
  const revisedAmount = originalAmount + approvedVOTotal(projectId);
  const committed = committedCost(projectId);
  const actual = actualCostByCategory(projectId);
  const budget = revisedAmount || originalAmount;
  const remaining = budget - actual.total - (committed.total - 0);
  const variance = budget - actual.total;
  return {
    originalBudget: originalAmount,
    revisedBudget: revisedAmount,
    budget,
    committed: committed.total,
    committedDetail: committed,
    actual: actual.total,
    actualDetail: actual.byCategory,
    remaining,
    variance,
    variancePct: budget ? (variance / budget) * 100 : null,
  };
}

// Earned Value Management. percentComplete comes from the latest progress
// billing (or the optional override). PV is the planned value to date — with
// no detailed schedule we use the planned % (default = elapsed schedule % via
// override, else equal to EV's % so SV starts at 0).
export function earnedValue(projectId, { percentComplete, plannedPercent } = {}) {
  const bva = budgetVsActual(projectId);
  const BAC = bva.budget;
  const latestBilling = db.prepare("SELECT percentComplete FROM progress_billings WHERE projectId = ? AND deletedAt IS NULL ORDER BY id DESC LIMIT 1").get(projectId);
  const pctComplete = percentComplete != null ? percentComplete : (latestBilling ? latestBilling.percentComplete : 0);
  const pctPlanned = plannedPercent != null ? plannedPercent : pctComplete;

  const EV = BAC * (pctComplete / 100);
  const PV = BAC * (pctPlanned / 100);
  const AC = bva.actual;
  const CV = EV - AC;
  const SV = EV - PV;
  const CPI = AC ? EV / AC : null;
  const SPI = PV ? EV / PV : null;
  const EAC = CPI ? BAC / CPI : BAC;
  const ETC = EAC - AC;
  const VAC = BAC - EAC;
  return { BAC, percentComplete: pctComplete, plannedPercent: pctPlanned, PV, EV, AC, CV, SV, CPI, SPI, EAC, ETC, VAC };
}

// Monthly cash flow + S-curve. Distributes the budget across the project
// duration with a standard S-curve, and overlays actual revenue from billings.
export function cashFlow(projectId, { months } = {}) {
  const sheet = db.prepare("SELECT calendarMonths, durationDays FROM gr_sheets WHERE projectId = ? ORDER BY id DESC LIMIT 1").get(projectId);
  const n = Math.max(1, Math.round(months || sheet?.calendarMonths || (sheet?.durationDays ? sheet.durationDays / 30 : 0) || 6));
  const BAC = budgetVsActual(projectId).budget;

  // Standard S-curve weights via a smoothstep over [0,1].
  const weights = [];
  let prev = 0;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const s = t * t * (3 - 2 * t); // smoothstep cumulative
    weights.push(s - prev);
    prev = s;
  }

  // Actual revenue (current billings) per month index if billingDate present.
  const billings = db.prepare("SELECT billingDate, grossAmount, retentionPct, vatPct, previousBilling FROM progress_billings WHERE projectId = ? AND deletedAt IS NULL ORDER BY id").all(projectId);
  const revenueTotal = billings.reduce((s, b) => s + currentBillingNet(b), 0);

  let cumCost = 0, cumRevenue = 0;
  const series = weights.map((w, i) => {
    const plannedCost = BAC * w;
    cumCost += plannedCost;
    // Spread total revenue evenly as a simple projection.
    const revenue = revenueTotal / n;
    cumRevenue += revenue;
    return {
      month: i + 1,
      plannedCost: round(plannedCost),
      cumulativeCost: round(cumCost),     // S-curve
      projectedRevenue: round(revenue),
      cumulativeRevenue: round(cumRevenue),
      netCashFlow: round(cumRevenue - cumCost),
    };
  });
  return { months: n, BAC, revenueTotal, series };
}

export function currentBillingNet(b) {
  const gross = b.grossAmount || 0;
  const afterRetention = gross * (1 - (b.retentionPct || 0) / 100);
  const withVat = afterRetention * (1 + (b.vatPct || 0) / 100);
  return withVat - (b.previousBilling || 0);
}

function round(n) { return Math.round(n * 100) / 100; }

// Project financial dashboard: combines budget, committed, actual, billing
// revenue, profit and forecast.
export function financialDashboard(projectId) {
  const bva = budgetVsActual(projectId);
  const evm = earnedValue(projectId);
  const billings = db.prepare("SELECT grossAmount, retentionPct, vatPct, previousBilling FROM progress_billings WHERE projectId = ? AND deletedAt IS NULL").all(projectId);
  const revenue = billings.reduce((s, b) => s + currentBillingNet(b), 0);
  const forecastFinalCost = evm.EAC;
  const contractValue = bva.budget; // budget == approved tender price
  const profit = contractValue - bva.actual;
  const forecastFinalProfit = contractValue - forecastFinalCost;
  return {
    budget: bva.budget, originalBudget: bva.originalBudget, revisedBudget: bva.revisedBudget,
    committed: bva.committed, actual: bva.actual, remaining: bva.remaining,
    variance: bva.variance, variancePct: bva.variancePct,
    revenue, contractValue, profit,
    forecastFinalCost, forecastFinalProfit,
    percentComplete: evm.percentComplete, CPI: evm.CPI, SPI: evm.SPI, EAC: evm.EAC, VAC: evm.VAC,
  };
}
