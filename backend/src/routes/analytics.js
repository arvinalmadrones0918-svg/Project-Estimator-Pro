import { Router } from "express";
import { db } from "../db.js";
import {
  executiveDashboard, projectHealth, costDashboard, procurementDashboard,
  tenderDashboard, resourceDashboard, portfolio, kpiCenter,
} from "../services/analytics.js";

const router = Router();

function filters(req) {
  return {
    status: req.query.status || null,
    workflowStatus: req.query.workflowStatus || null,
    estimator: req.query.estimator || null,
    client: req.query.client || null,
    projectId: req.query.projectId || null,
    year: req.query.year || null,
  };
}

// Distinct filter options for the dashboard filter bar.
router.get("/filters", (req, res) => {
  res.json({
    estimators: db.prepare("SELECT DISTINCT estimator FROM projects WHERE estimator IS NOT NULL AND estimator <> '' AND deletedAt IS NULL ORDER BY estimator").all().map((r) => r.estimator),
    clients: db.prepare("SELECT DISTINCT client FROM projects WHERE client IS NOT NULL AND client <> '' AND deletedAt IS NULL ORDER BY client").all().map((r) => r.client),
    years: db.prepare("SELECT DISTINCT substr(COALESCE(date, createdAt),1,4) AS y FROM projects WHERE deletedAt IS NULL ORDER BY y DESC").all().map((r) => r.y).filter(Boolean),
    statuses: ["active", "archived"],
    workflowStatuses: ["draft", "forReview", "returned", "approved", "issued", "archived"],
  });
});

router.get("/executive", (req, res) => res.json(executiveDashboard(filters(req))));
router.get("/health", (req, res) => res.json(projectHealth(filters(req))));
router.get("/cost", (req, res) => res.json(costDashboard(filters(req))));
router.get("/procurement", (req, res) => res.json(procurementDashboard()));
router.get("/tender", (req, res) => res.json(tenderDashboard()));
router.get("/resources", (req, res) => res.json(resourceDashboard(filters(req))));
router.get("/portfolio", (req, res) => res.json(portfolio(filters(req))));
router.get("/kpi", (req, res) => res.json(kpiCenter(filters(req))));

// One combined call for the dashboard's initial load / auto-refresh.
router.get("/all", (req, res) => {
  const f = filters(req);
  res.json({
    executive: executiveDashboard(f), health: projectHealth(f), cost: costDashboard(f),
    procurement: procurementDashboard(), tender: tenderDashboard(), resources: resourceDashboard(f),
    portfolio: portfolio(f), kpi: kpiCenter(f), generatedAt: new Date().toISOString(),
  });
});

export default router;
