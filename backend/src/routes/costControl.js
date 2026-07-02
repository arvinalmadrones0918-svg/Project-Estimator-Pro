import { Router } from "express";
import { db } from "../db.js";
import { makeRegisterRouter } from "./registerRouter.js";
import {
  createBudgetFromEstimate, latestBudget, budgetVsActual, earnedValue,
  cashFlow, financialDashboard, currentBillingNet, committedCost, costAlerts,
} from "../services/costControl.js";

// ── CRUD registers (reuse the generic factory) ──────────────────────────────

export const purchaseOrdersRouter = makeRegisterRouter("purchase_orders", {
  fields: ["poNumber", "projectId", "supplierId", "supplier", "wbs", "poDate", "status", "currency", "deliveryDate", "terms", "remarks", "amount"],
  searchCols: ["poNumber", "supplier", "wbs"],
  requiredCol: "poNumber",
  numericCols: ["projectId", "supplierId", "amount"],
  logEntity: "purchase_order",
});

export const subcontractsRouter = makeRegisterRouter("subcontracts", {
  fields: ["projectId", "supplierId", "packageName", "contractAmount", "retentionPct", "advancePayment", "status", "remarks"],
  searchCols: ["packageName"],
  requiredCol: "packageName",
  numericCols: ["projectId", "supplierId", "contractAmount", "retentionPct", "advancePayment"],
  logEntity: "subcontract",
});

export const variationOrdersRouter = makeRegisterRouter("variation_orders", {
  fields: ["projectId", "subcontractId", "voNumber", "voType", "nature", "amount", "status", "description"],
  searchCols: ["voNumber", "description"],
  requiredCol: "voType",
  numericCols: ["projectId", "subcontractId", "amount"],
  logEntity: "variation_order",
});

export const progressBillingsRouter = makeRegisterRouter("progress_billings", {
  fields: ["projectId", "billingNo", "billingDate", "percentComplete", "grossAmount", "retentionPct", "vatPct", "previousBilling", "status"],
  searchCols: ["billingNo"],
  requiredCol: "billingNo",
  numericCols: ["projectId", "percentComplete", "grossAmount", "retentionPct", "vatPct", "previousBilling"],
  logEntity: "progress_billing",
});

export const actualCostsRouter = makeRegisterRouter("actual_costs", {
  fields: ["projectId", "category", "description", "amount", "costDate"],
  searchCols: ["description", "category"],
  requiredCol: "category",
  numericCols: ["projectId", "amount"],
  logEntity: "actual_cost",
});

// ── Derived figures + budget management ─────────────────────────────────────

export const costControlRouter = Router();

costControlRouter.get("/budgets", (req, res) => {
  const projectId = Number(req.query.projectId);
  if (!projectId) return res.status(400).json({ error: "projectId is required" });
  res.json(db.prepare("SELECT * FROM budgets WHERE projectId = ? ORDER BY id DESC").all(projectId)
    .map((b) => ({ ...b, snapshot: b.snapshot ? JSON.parse(b.snapshot) : null })));
});

costControlRouter.post("/budgets/from-estimate", (req, res) => {
  const { projectId, type = "original", note } = req.body;
  if (!projectId) return res.status(400).json({ error: "projectId is required" });
  const project = db.prepare("SELECT id FROM projects WHERE id = ? AND deletedAt IS NULL").get(Number(projectId));
  if (!project) return res.status(404).json({ error: "Project not found" });
  const budget = createBudgetFromEstimate(Number(projectId), type, note, req.user?.name);
  res.status(201).json({ ...budget, snapshot: budget.snapshot ? JSON.parse(budget.snapshot) : null });
});

// Freeze the latest budget (mark as frozen, immutable baseline).
costControlRouter.post("/budgets/:id/freeze", (req, res) => {
  const b = db.prepare("SELECT * FROM budgets WHERE id = ?").get(Number(req.params.id));
  if (!b) return res.status(404).json({ error: "Not found" });
  db.prepare("UPDATE budgets SET status = 'frozen' WHERE id = ?").run(b.id);
  res.json({ ...db.prepare("SELECT * FROM budgets WHERE id = ?").get(b.id), snapshot: b.snapshot ? JSON.parse(b.snapshot) : null });
});

// ── Budget transfers (approval required + audit) ────────────────────────────

costControlRouter.get("/transfers", (req, res) => {
  const projectId = Number(req.query.projectId);
  res.json(db.prepare("SELECT * FROM budget_transfers WHERE projectId = ? ORDER BY id DESC").all(projectId));
});

costControlRouter.post("/transfers", (req, res) => {
  const { projectId, dimension = "wbs", fromKey, toKey, amount, reason } = req.body;
  if (!projectId || !fromKey || !toKey || amount == null) return res.status(400).json({ error: "projectId, fromKey, toKey and amount are required" });
  const r = db.prepare("INSERT INTO budget_transfers (projectId, dimension, fromKey, toKey, amount, reason, requestedBy) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(Number(projectId), dimension, fromKey, toKey, Number(amount), reason ?? null, req.user?.name ?? null);
  res.status(201).json(db.prepare("SELECT * FROM budget_transfers WHERE id = ?").get(r.lastInsertRowid));
});

costControlRouter.post("/transfers/:id/:action", (req, res) => {
  const action = req.params.action;
  if (!["approve", "reject"].includes(action)) return res.status(400).json({ error: "Unknown action" });
  const t = db.prepare("SELECT * FROM budget_transfers WHERE id = ?").get(Number(req.params.id));
  if (!t) return res.status(404).json({ error: "Not found" });
  db.prepare("UPDATE budget_transfers SET status = ?, approvedBy = ?, actedAt = datetime('now') WHERE id = ?")
    .run(action === "approve" ? "approved" : "rejected", req.user?.name ?? null, t.id);
  res.json(db.prepare("SELECT * FROM budget_transfers WHERE id = ?").get(t.id));
});

// ── Analytics ───────────────────────────────────────────────────────────────

costControlRouter.get("/budget-vs-actual/:projectId", (req, res) => res.json(budgetVsActual(Number(req.params.projectId))));
costControlRouter.get("/committed/:projectId", (req, res) => res.json(committedCost(Number(req.params.projectId))));
costControlRouter.get("/earned-value/:projectId", (req, res) => res.json(earnedValue(Number(req.params.projectId), {
  percentComplete: req.query.percentComplete != null ? Number(req.query.percentComplete) : undefined,
  plannedPercent: req.query.plannedPercent != null ? Number(req.query.plannedPercent) : undefined,
})));
costControlRouter.get("/cash-flow/:projectId", (req, res) => res.json(cashFlow(Number(req.params.projectId), {
  months: req.query.months ? Number(req.query.months) : undefined,
  granularity: req.query.granularity === "week" ? "week" : "month",
})));
costControlRouter.get("/dashboard/:projectId", (req, res) => res.json(financialDashboard(Number(req.params.projectId))));
costControlRouter.get("/alerts/:projectId", (req, res) => res.json(costAlerts(Number(req.params.projectId))));

export default costControlRouter;
