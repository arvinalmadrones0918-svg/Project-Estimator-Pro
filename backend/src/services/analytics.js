import { db } from "../db.js";
import { calculateProject, calculateGRSheet } from "./costEngine.js";
import { financialDashboard, earnedValue } from "./costControl.js";

// ════════════════════════════════════════════════════════════════════════════
// ANALYTICS / BUSINESS INTELLIGENCE
//
// Aggregates portfolio-wide figures by reusing the cost engine
// (calculateProject) and the cost-control service (financialDashboard /
// budgetVsActual / earnedValue). No calculation is re-implemented here — this
// layer only filters, sums and ranks values produced elsewhere.
// ════════════════════════════════════════════════════════════════════════════

function filteredProjects(filters = {}) {
  const where = ["deletedAt IS NULL"];
  const params = [];
  if (filters.status) { where.push("status = ?"); params.push(filters.status); }
  if (filters.workflowStatus) { where.push("workflowStatus = ?"); params.push(filters.workflowStatus); }
  if (filters.estimator) { where.push("estimator = ?"); params.push(filters.estimator); }
  if (filters.client) { where.push("client = ?"); params.push(filters.client); }
  if (filters.projectId) { where.push("id = ?"); params.push(Number(filters.projectId)); }
  if (filters.year) { where.push("substr(COALESCE(date, createdAt),1,4) = ?"); params.push(String(filters.year)); }
  return db.prepare(`SELECT * FROM projects WHERE ${where.join(" AND ")} ORDER BY updatedAt DESC`).all(...params);
}

// Build a per-project financial row once; every dashboard derives from these.
function portfolioRows(filters) {
  return filteredProjects(filters).map((p) => {
    const calc = calculateProject(p.id);
    const fin = financialDashboard(p.id);
    const evm = earnedValue(p.id);
    const b = calc.directCostBreakdown;
    return {
      id: p.id, name: p.name, client: p.client, estimator: p.estimator,
      status: p.status, workflowStatus: p.workflowStatus,
      directCost: calc.waterfall.directCost,
      contractValue: fin.contractValue,
      committed: fin.committed, actual: fin.actual, revenue: fin.revenue,
      profit: fin.profit, margin: fin.contractValue ? (fin.profit / fin.contractValue) * 100 : 0,
      forecastFinalCost: fin.forecastFinalCost, forecastFinalProfit: fin.forecastFinalProfit,
      remaining: fin.remaining, variance: fin.variance,
      CPI: evm.CPI, SPI: evm.SPI, percentComplete: evm.percentComplete,
      breakdown: b,
    };
  });
}

const round = (n) => Math.round((n || 0) * 100) / 100;
const sum = (arr, f) => arr.reduce((s, x) => s + (f(x) || 0), 0);

// ── Executive home dashboard ────────────────────────────────────────────────

export function executiveDashboard(filters = {}) {
  const rows = portfolioRows(filters);
  const allProjects = filteredProjects(filters);

  const activeProjects = allProjects.filter((p) => p.status === "active" && !["issued", "archived"].includes(p.workflowStatus)).length;
  const completedProjects = allProjects.filter((p) => ["issued", "archived"].includes(p.workflowStatus)).length;

  const tenders = db.prepare("SELECT * FROM tenders WHERE deletedAt IS NULL").all();
  const awardedProjectIds = new Set(tenders.filter((t) => t.status === "awarded" && t.projectId).map((t) => t.projectId));

  const outstandingPOs = db.prepare("SELECT COUNT(*) AS c, COALESCE(SUM(amount),0) AS s FROM purchase_orders WHERE status = 'open' AND deletedAt IS NULL").get();
  const outstandingRFQs = db.prepare("SELECT COUNT(*) AS c FROM materials WHERE isActive = 1 AND deletedAt IS NULL AND id NOT IN (SELECT DISTINCT materialId FROM material_quotations WHERE deletedAt IS NULL)").get().c;
  const pendingApprovals = allProjects.filter((p) => p.workflowStatus === "forReview").length;

  const today = new Date().toISOString().slice(0, 10);
  const upcomingBidDeadlines = tenders.filter((t) => t.submissionDate && t.submissionDate >= today)
    .sort((a, b) => a.submissionDate.localeCompare(b.submissionDate)).slice(0, 10)
    .map((t) => ({ id: t.id, tenderNo: t.tenderNo, bidTitle: t.bidTitle, submissionDate: t.submissionDate }));
  const delayedProjects = tenders.filter((t) => t.submissionDate && t.submissionDate < today && t.status === "open").length;

  return {
    activeProjects, completedProjects,
    tenderValue: round(sum(rows, (r) => r.contractValue)),
    awardedValue: round(sum(rows.filter((r) => awardedProjectIds.has(r.id)), (r) => r.contractValue)),
    currentRevenue: round(sum(rows, (r) => r.revenue)),
    currentCost: round(sum(rows, (r) => r.actual)),
    currentProfit: round(sum(rows, (r) => r.profit)),
    cashFlow: round(sum(rows, (r) => r.revenue) - sum(rows, (r) => r.actual)),
    outstandingPurchaseOrders: { count: outstandingPOs.c, value: round(outstandingPOs.s) },
    outstandingRFQs, pendingApprovals, delayedProjects, upcomingBidDeadlines,
  };
}

// ── Project health (traffic lights) ─────────────────────────────────────────

function light(score) { return score >= 75 ? "green" : score >= 50 ? "yellow" : "red"; }

export function projectHealth(filters = {}) {
  return portfolioRows(filters).map((r) => {
    // Each dimension scored 0-100.
    const budgetScore = r.contractValue ? Math.max(0, Math.min(100, 100 - Math.max(0, -r.variance) / r.contractValue * 100)) : 100;
    const procurementScore = r.directCost ? Math.min(100, (r.committed / r.directCost) * 100) : 0;
    const cashFlowScore = (r.revenue - r.actual) >= 0 ? 90 : 40;
    const profitScore = r.margin >= 15 ? 95 : r.margin >= 5 ? 70 : r.margin >= 0 ? 50 : 20;
    const riskScore = r.CPI != null ? Math.max(0, Math.min(100, r.CPI * 60)) : 70;
    const healthScore = Math.round((budgetScore + cashFlowScore + profitScore + riskScore) / 4);
    return {
      id: r.id, name: r.name,
      healthScore, overall: light(healthScore),
      budget: light(budgetScore), schedule: "green", // schedule placeholder (future-ready)
      procurement: light(procurementScore), cashFlow: light(cashFlowScore),
      profit: light(profitScore), risk: light(riskScore),
      margin: round(r.margin), variance: round(r.variance),
    };
  });
}

// ── Cost dashboard (aggregate) ──────────────────────────────────────────────

export function costDashboard(filters = {}) {
  const rows = portfolioRows(filters);
  const budget = sum(rows, (r) => r.contractValue);
  const actual = sum(rows, (r) => r.actual);
  const profit = sum(rows, (r) => r.profit);
  return {
    budget: round(budget), committed: round(sum(rows, (r) => r.committed)),
    actual: round(actual), forecast: round(sum(rows, (r) => r.forecastFinalCost)),
    remaining: round(sum(rows, (r) => r.remaining)), variance: round(sum(rows, (r) => r.variance)),
    profit: round(profit), margin: budget ? round((profit / budget) * 100) : 0,
  };
}

// ── Procurement dashboard ───────────────────────────────────────────────────

export function procurementDashboard() {
  const today = new Date().toISOString().slice(0, 10);
  const quotedMaterialIds = db.prepare("SELECT DISTINCT materialId FROM material_quotations WHERE deletedAt IS NULL").all().length;
  const totalMaterials = db.prepare("SELECT COUNT(*) AS c FROM materials WHERE isActive = 1 AND deletedAt IS NULL").get().c;
  const awarded = db.prepare("SELECT COUNT(*) AS c FROM material_quotations WHERE isSelected = 1 AND deletedAt IS NULL").get().c;
  const expired = db.prepare("SELECT COUNT(*) AS c FROM material_quotations WHERE deletedAt IS NULL AND validityDate IS NOT NULL AND validityDate < ?").get(today).c;
  const pos = db.prepare("SELECT COUNT(*) AS c, COALESCE(SUM(amount),0) AS s FROM purchase_orders WHERE deletedAt IS NULL").get();
  const supplierPerformance = db.prepare(
    `SELECT s.companyName AS supplier, s.rating, COUNT(q.id) AS quotes,
            SUM(CASE WHEN q.isSelected = 1 THEN 1 ELSE 0 END) AS awarded
     FROM suppliers s LEFT JOIN material_quotations q ON q.supplierId = s.id AND q.deletedAt IS NULL
     WHERE s.deletedAt IS NULL GROUP BY s.id ORDER BY awarded DESC, s.rating DESC LIMIT 10`
  ).all();
  return {
    pendingRFQ: totalMaterials - quotedMaterialIds, quoted: quotedMaterialIds, awarded, expired,
    purchaseOrders: { count: pos.c, value: round(pos.s) }, supplierPerformance,
  };
}

// ── Tender dashboard ────────────────────────────────────────────────────────

export function tenderDashboard() {
  const tenders = db.prepare("SELECT * FROM tenders WHERE deletedAt IS NULL").all();
  const by = (s) => tenders.filter((t) => t.status === s).length;
  const won = by("awarded"), lost = by("lost"), submitted = by("submitted"), pending = by("open");
  const decided = won + lost;
  // Average bid margin across projects linked to awarded tenders.
  const awardedProjectIds = tenders.filter((t) => t.status === "awarded" && t.projectId).map((t) => t.projectId);
  const margins = awardedProjectIds.map((pid) => financialDashboard(pid)).map((f) => f.contractValue ? (f.profit / f.contractValue) * 100 : 0);
  const avgBidMargin = margins.length ? round(margins.reduce((a, b) => a + b, 0) / margins.length) : 0;
  return { won, lost, pending, submitted, total: tenders.length, successRate: decided ? round((won / decided) * 100) : 0, avgBidMargin };
}

// ── Resource distribution ───────────────────────────────────────────────────

export function resourceDashboard(filters = {}) {
  const rows = portfolioRows(filters);
  const agg = { material: 0, labor: 0, equipment: 0, subcontract: 0, other: 0 };
  for (const r of rows) {
    agg.material += r.breakdown.materialCost;
    agg.labor += r.breakdown.laborCost;
    agg.equipment += r.breakdown.equipmentCost;
    agg.subcontract += r.breakdown.subcontractCost;
    agg.other += r.breakdown.otherCost;
  }
  // General Requirements distribution across all GR sheets in scope.
  const gr = sumGRForProjects(rows.map((r) => r.id));
  return {
    material: round(agg.material), labor: round(agg.labor), equipment: round(agg.equipment),
    subcontract: round(agg.subcontract), other: round(agg.other), generalRequirements: round(gr),
  };
}

// GR distribution: sum each in-scope GR sheet's grand total from the engine.
function sumGRForProjects(projectIds) {
  if (!projectIds.length) return 0;
  const sheets = db.prepare(`SELECT id FROM gr_sheets WHERE deletedAt IS NULL AND projectId IN (${projectIds.map(() => "?").join(",")})`).all(...projectIds);
  let total = 0;
  for (const s of sheets) {
    const calc = calculateGRSheet(s.id);
    if (calc) total += calc.grandTotal;
  }
  return total;
}

// ── Portfolio comparison ────────────────────────────────────────────────────

export function portfolio(filters = {}) {
  const rows = portfolioRows(filters).map((r) => ({
    id: r.id, name: r.name, contractValue: round(r.contractValue), actual: round(r.actual),
    profit: round(r.profit), margin: round(r.margin),
  }));
  const byProfit = [...rows].sort((a, b) => b.profit - a.profit);
  const byMargin = [...rows].sort((a, b) => b.margin - a.margin);
  const bySize = [...rows].sort((a, b) => b.contractValue - a.contractValue);
  return {
    all: rows,
    topProfitable: byProfit.slice(0, 5),
    topLoss: [...byProfit].reverse().slice(0, 5),
    largest: bySize.slice(0, 5),
    highestMargin: byMargin.slice(0, 5),
    lowestMargin: [...byMargin].reverse().slice(0, 5),
  };
}

// ── KPI center ──────────────────────────────────────────────────────────────

export function kpiCenter(filters = {}) {
  const rows = portfolioRows(filters);
  const direct = sum(rows, (r) => r.directCost) || 1;
  const cpis = rows.map((r) => r.CPI).filter((v) => v != null);
  const spis = rows.map((r) => r.SPI).filter((v) => v != null);
  const contract = sum(rows, (r) => r.contractValue) || 1;
  const profit = sum(rows, (r) => r.profit);
  const mat = sum(rows, (r) => r.breakdown.materialCost);
  const lab = sum(rows, (r) => r.breakdown.laborCost);
  const eqp = sum(rows, (r) => r.breakdown.equipmentCost);
  const gr = sumGRForProjects(rows.map((r) => r.id));
  return {
    CPI: cpis.length ? round(cpis.reduce((a, b) => a + b, 0) / cpis.length) : null,
    SPI: spis.length ? round(spis.reduce((a, b) => a + b, 0) / spis.length) : null,
    profitPct: round((profit / contract) * 100),
    markupPct: round(((contract - direct) / direct) * 100),
    overheadPct: round(overheadPct(rows)),
    materialPct: round((mat / direct) * 100),
    laborPct: round((lab / direct) * 100),
    equipmentPct: round((eqp / direct) * 100),
    grPct: round((gr / direct) * 100),
    forecastMargin: round(sum(rows, (r) => r.forecastFinalProfit) / contract * 100),
  };
}

// Average overhead % from configured indirect items named like overhead.
function overheadPct(rows) {
  const ids = rows.map((r) => r.id);
  if (!ids.length) return 0;
  const items = db.prepare(`SELECT value FROM indirect_cost_items WHERE enabled = 1 AND method = 'percentage' AND LOWER(name) LIKE '%overhead%' AND projectId IN (${ids.map(() => "?").join(",")})`).all(...ids);
  if (!items.length) return 0;
  return items.reduce((s, i) => s + i.value, 0) / items.length;
}
