import { Router } from "express";
import { db } from "../db.js";

const router = Router();

// Shared approval workflow states used by RFQs, purchase requests and POs.
const WORKFLOW = ["draft", "for_approval", "approved", "rejected", "cancelled"];

function genNumber(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

// Flatten a project's procurable estimate line items (materials, equipment,
// subcontract, other costs) into a normalized list. This is the source for
// "generate RFQ / purchase request from estimate items".
function estimateItems(projectId) {
  const materials = db.prepare(
    `SELECT 'material' AS sourceType, mm.id AS sourceRefId, m.name AS description, m.unit,
            mm.quantity, mm.unitPriceAtEntry AS estimatedUnitCost
     FROM module_materials mm
     JOIN work_modules w ON w.id = mm.workModuleId AND w.deletedAt IS NULL
     JOIN materials m ON m.id = mm.materialId
     WHERE w.projectId = ?`
  ).all(projectId);
  const equipment = db.prepare(
    `SELECT 'equipment' AS sourceType, me.id AS sourceRefId, e.name AS description, e.unit,
            me.quantity, me.unitPriceAtEntry AS estimatedUnitCost
     FROM module_equipment me
     JOIN work_modules w ON w.id = me.workModuleId AND w.deletedAt IS NULL
     JOIN equipment e ON e.id = me.equipmentId
     WHERE w.projectId = ?`
  ).all(projectId);
  const subcontract = db.prepare(
    `SELECT 'subcontract' AS sourceType, ms.id AS sourceRefId, ms.description, 'lot' AS unit,
            1 AS quantity, ms.cost AS estimatedUnitCost
     FROM module_subcontract ms
     JOIN work_modules w ON w.id = ms.workModuleId AND w.deletedAt IS NULL
     WHERE w.projectId = ?`
  ).all(projectId);
  const other = db.prepare(
    `SELECT 'other' AS sourceType, mo.id AS sourceRefId, mo.description, 'lot' AS unit,
            1 AS quantity, mo.cost AS estimatedUnitCost
     FROM module_other_costs mo
     JOIN work_modules w ON w.id = mo.workModuleId AND w.deletedAt IS NULL
     WHERE w.projectId = ?`
  ).all(projectId);
  return [...materials, ...equipment, ...subcontract, ...other];
}

// ── Estimate items (for the "generate from estimate" pickers) ────────────────
router.get("/estimate-items/:projectId", (req, res) => {
  res.json(estimateItems(Number(req.params.projectId)));
});

// ── RFQs ─────────────────────────────────────────────────────────────────────
router.get("/rfqs", (req, res) => {
  const projectId = req.query.projectId ? Number(req.query.projectId) : null;
  const rows = projectId
    ? db.prepare("SELECT * FROM rfqs WHERE projectId = ? AND deletedAt IS NULL ORDER BY id DESC").all(projectId)
    : db.prepare("SELECT * FROM rfqs WHERE deletedAt IS NULL ORDER BY id DESC").all();
  res.json(rows);
});

router.get("/rfqs/:id", (req, res) => {
  const id = Number(req.params.id);
  const rfq = db.prepare("SELECT * FROM rfqs WHERE id = ?").get(id);
  if (!rfq) return res.status(404).json({ error: "RFQ not found" });
  const items = db.prepare("SELECT * FROM rfq_items WHERE rfqId = ? ORDER BY sortOrder, id").all(id);
  const suppliers = db.prepare(
    `SELECT rs.id, rs.supplierId, s.companyName, s.rating
     FROM rfq_suppliers rs JOIN suppliers s ON s.id = rs.supplierId WHERE rs.rfqId = ?`
  ).all(id);
  res.json({ ...rfq, items, suppliers });
});

// Create an RFQ. `items` may be provided directly, or `fromEstimate: true`
// pulls the project's estimate items (optionally filtered by sourceRefId list).
router.post("/rfqs", (req, res) => {
  const { projectId, title, dueDate, notes, items, fromEstimate, sourceRefIds, supplierIds } = req.body;
  if (!projectId || !title) return res.status(400).json({ error: "projectId and title are required" });

  let lineItems = Array.isArray(items) ? items : [];
  if (fromEstimate) {
    let est = estimateItems(Number(projectId));
    if (Array.isArray(sourceRefIds) && sourceRefIds.length) {
      const set = new Set(sourceRefIds.map((r) => `${r}`));
      est = est.filter((e) => set.has(`${e.sourceType}:${e.sourceRefId}`) || set.has(`${e.sourceRefId}`));
    }
    lineItems = est;
  }

  const result = db.prepare(
    "INSERT INTO rfqs (projectId, rfqNumber, title, dueDate, notes, createdBy) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(Number(projectId), genNumber("RFQ"), title, dueDate ?? null, notes ?? null, req.user?.username ?? null);
  const rfqId = result.lastInsertRowid;

  const insItem = db.prepare(
    "INSERT INTO rfq_items (rfqId, description, unit, quantity, sourceType, sourceRefId, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  lineItems.forEach((it, i) => insItem.run(rfqId, it.description ?? "Item", it.unit ?? null, Number(it.quantity) || 0, it.sourceType ?? null, it.sourceRefId ?? null, i));

  if (Array.isArray(supplierIds)) {
    const insSup = db.prepare("INSERT INTO rfq_suppliers (rfqId, supplierId) VALUES (?, ?)");
    supplierIds.forEach((sid) => insSup.run(rfqId, Number(sid)));
  }

  res.status(201).json(db.prepare("SELECT * FROM rfqs WHERE id = ?").get(rfqId));
});

router.put("/rfqs/:id", (req, res) => {
  const id = Number(req.params.id);
  const rfq = db.prepare("SELECT * FROM rfqs WHERE id = ?").get(id);
  if (!rfq) return res.status(404).json({ error: "RFQ not found" });
  const { title, dueDate, notes } = req.body;
  db.prepare("UPDATE rfqs SET title = ?, dueDate = ?, notes = ?, updatedAt = datetime('now') WHERE id = ?")
    .run(title ?? rfq.title, dueDate ?? rfq.dueDate, notes ?? rfq.notes, id);
  res.json(db.prepare("SELECT * FROM rfqs WHERE id = ?").get(id));
});

router.put("/rfqs/:id/status", (req, res) => setStatus("rfqs", req, res));
router.post("/rfqs/:id/suppliers", (req, res) => {
  const rfqId = Number(req.params.id);
  const { supplierId } = req.body;
  if (!supplierId) return res.status(400).json({ error: "supplierId is required" });
  db.prepare("INSERT INTO rfq_suppliers (rfqId, supplierId) VALUES (?, ?)").run(rfqId, Number(supplierId));
  res.status(201).json({ ok: true });
});

router.delete("/rfqs/:id", (req, res) => {
  db.prepare("UPDATE rfqs SET deletedAt = datetime('now') WHERE id = ?").run(Number(req.params.id));
  res.status(204).end();
});

// Generic workflow status transition with validation.
function setStatus(table, req, res) {
  const id = Number(req.params.id);
  const { status } = req.body;
  if (!WORKFLOW.includes(status)) return res.status(400).json({ error: `status must be one of ${WORKFLOW.join(", ")}` });
  const existing = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  db.prepare(`UPDATE ${table} SET status = ?, updatedAt = datetime('now') WHERE id = ?`).run(status, id);
  res.json(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id));
}

// ── Supplier quotations for an RFQ ───────────────────────────────────────────
router.get("/rfqs/:id/quotations", (req, res) => {
  const rfqId = Number(req.params.id);
  const quotes = db.prepare(
    `SELECT sq.*, s.companyName FROM supplier_quotations sq
     JOIN suppliers s ON s.id = sq.supplierId
     WHERE sq.rfqId = ? AND sq.deletedAt IS NULL ORDER BY sq.id`
  ).all(rfqId);
  for (const q of quotes) {
    q.items = db.prepare("SELECT * FROM supplier_quotation_items WHERE quotationId = ?").all(q.id);
    q.total = q.items.reduce((s, it) => {
      const ri = db.prepare("SELECT quantity FROM rfq_items WHERE id = ?").get(it.rfqItemId);
      return s + (it.unitPrice || 0) * (ri?.quantity || 0);
    }, 0);
  }
  res.json(quotes);
});

router.post("/rfqs/:id/quotations", (req, res) => {
  const rfqId = Number(req.params.id);
  const rfq = db.prepare("SELECT * FROM rfqs WHERE id = ?").get(rfqId);
  if (!rfq) return res.status(404).json({ error: "RFQ not found" });
  const { supplierId, quoteNumber, leadTimeDays, validityDate, remarks, currency, items } = req.body;
  if (!supplierId) return res.status(400).json({ error: "supplierId is required" });

  const result = db.prepare(
    `INSERT INTO supplier_quotations (rfqId, supplierId, quoteNumber, currency, leadTimeDays, validityDate, remarks, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted')`
  ).run(rfqId, Number(supplierId), quoteNumber ?? genNumber("QUO"), currency || "USD",
    leadTimeDays != null ? Number(leadTimeDays) : null, validityDate ?? null, remarks ?? null);
  const qid = result.lastInsertRowid;

  if (Array.isArray(items)) {
    const ins = db.prepare("INSERT INTO supplier_quotation_items (quotationId, rfqItemId, unitPrice, remarks) VALUES (?, ?, ?, ?)");
    items.forEach((it) => ins.run(qid, Number(it.rfqItemId), Number(it.unitPrice) || 0, it.remarks ?? null));
  }
  res.status(201).json(db.prepare("SELECT * FROM supplier_quotations WHERE id = ?").get(qid));
});

router.delete("/quotations/:id", (req, res) => {
  db.prepare("UPDATE supplier_quotations SET deletedAt = datetime('now') WHERE id = ?").run(Number(req.params.id));
  res.status(204).end();
});

// ── Bid comparison ───────────────────────────────────────────────────────────
// All quotations for an RFQ side by side: per-item prices, totals, lowest
// price, best value (lowest total among quotes with the shortest reasonable
// lead time), variance vs lowest, and lead times.
router.get("/rfqs/:id/bid-comparison", (req, res) => {
  const rfqId = Number(req.params.id);
  const rfq = db.prepare("SELECT * FROM rfqs WHERE id = ?").get(rfqId);
  if (!rfq) return res.status(404).json({ error: "RFQ not found" });
  const items = db.prepare("SELECT * FROM rfq_items WHERE rfqId = ? ORDER BY sortOrder, id").all(rfqId);
  const quotes = db.prepare(
    `SELECT sq.*, s.companyName FROM supplier_quotations sq
     JOIN suppliers s ON s.id = sq.supplierId
     WHERE sq.rfqId = ? AND sq.deletedAt IS NULL ORDER BY sq.id`
  ).all(rfqId);

  const columns = quotes.map((q) => {
    const priceByItem = {};
    let total = 0;
    for (const it of items) {
      const qi = db.prepare("SELECT unitPrice FROM supplier_quotation_items WHERE quotationId = ? AND rfqItemId = ?").get(q.id, it.id);
      const unitPrice = qi ? qi.unitPrice : null;
      priceByItem[it.id] = unitPrice;
      if (unitPrice != null) total += unitPrice * (it.quantity || 0);
    }
    return {
      quotationId: q.id, supplierId: q.supplierId, supplier: q.companyName,
      leadTimeDays: q.leadTimeDays, validityDate: q.validityDate, remarks: q.remarks,
      isAwarded: !!q.isAwarded, priceByItem, total,
    };
  });

  const totals = columns.map((c) => c.total).filter((t) => t > 0);
  const lowestTotal = totals.length ? Math.min(...totals) : null;
  const leadTimes = columns.map((c) => c.leadTimeDays).filter((t) => t != null);
  const bestLeadTime = leadTimes.length ? Math.min(...leadTimes) : null;

  // Best value = lowest total; ties broken by shortest lead time. A simple
  // score rewards low price and short delivery.
  let bestValueId = null, bestScore = Infinity;
  for (const c of columns) {
    if (!c.total) continue;
    const priceScore = lowestTotal ? c.total / lowestTotal : 1;
    const leadScore = bestLeadTime != null && c.leadTimeDays != null && bestLeadTime > 0
      ? c.leadTimeDays / bestLeadTime : 1;
    const score = priceScore * 0.7 + leadScore * 0.3;
    if (score < bestScore) { bestScore = score; bestValueId = c.quotationId; }
  }

  for (const c of columns) {
    c.isLowest = c.total === lowestTotal && c.total > 0;
    c.isBestValue = c.quotationId === bestValueId;
    c.variance = lowestTotal != null ? c.total - lowestTotal : null;
    c.variancePct = lowestTotal ? ((c.total - lowestTotal) / lowestTotal) * 100 : null;
  }

  res.json({ rfq: { id: rfq.id, title: rfq.title, rfqNumber: rfq.rfqNumber }, items, columns, lowestTotal, bestLeadTime });
});

// Award a quotation (flags it; others in the RFQ are un-awarded).
router.post("/quotations/:id/award", (req, res) => {
  const id = Number(req.params.id);
  const quote = db.prepare("SELECT * FROM supplier_quotations WHERE id = ?").get(id);
  if (!quote) return res.status(404).json({ error: "Quotation not found" });
  db.prepare("UPDATE supplier_quotations SET isAwarded = 0 WHERE rfqId = ?").run(quote.rfqId);
  db.prepare("UPDATE supplier_quotations SET isAwarded = 1, updatedAt = datetime('now') WHERE id = ?").run(id);
  res.json(db.prepare("SELECT * FROM supplier_quotations WHERE id = ?").get(id));
});

// ── Purchase requests ────────────────────────────────────────────────────────
router.get("/purchase-requests", (req, res) => {
  const projectId = req.query.projectId ? Number(req.query.projectId) : null;
  const rows = projectId
    ? db.prepare("SELECT * FROM purchase_requests WHERE projectId = ? AND deletedAt IS NULL ORDER BY id DESC").all(projectId)
    : db.prepare("SELECT * FROM purchase_requests WHERE deletedAt IS NULL ORDER BY id DESC").all();
  res.json(rows);
});

router.get("/purchase-requests/:id", (req, res) => {
  const id = Number(req.params.id);
  const pr = db.prepare("SELECT * FROM purchase_requests WHERE id = ?").get(id);
  if (!pr) return res.status(404).json({ error: "Not found" });
  pr.items = db.prepare("SELECT * FROM purchase_request_items WHERE prId = ? ORDER BY sortOrder, id").all(id);
  res.json(pr);
});

router.post("/purchase-requests", (req, res) => {
  const { projectId, title, requiredDate, notes, items, fromEstimate, sourceRefIds } = req.body;
  if (!projectId || !title) return res.status(400).json({ error: "projectId and title are required" });

  let lineItems = Array.isArray(items) ? items : [];
  if (fromEstimate) {
    let est = estimateItems(Number(projectId));
    if (Array.isArray(sourceRefIds) && sourceRefIds.length) {
      const set = new Set(sourceRefIds.map((r) => `${r}`));
      est = est.filter((e) => set.has(`${e.sourceType}:${e.sourceRefId}`) || set.has(`${e.sourceRefId}`));
    }
    lineItems = est;
  }

  const result = db.prepare(
    "INSERT INTO purchase_requests (projectId, prNumber, title, requiredDate, notes, createdBy) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(Number(projectId), genNumber("PR"), title, requiredDate ?? null, notes ?? null, req.user?.username ?? null);
  const prId = result.lastInsertRowid;

  const ins = db.prepare(
    "INSERT INTO purchase_request_items (prId, description, unit, quantity, estimatedUnitCost, sourceType, sourceRefId, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  );
  lineItems.forEach((it, i) => ins.run(prId, it.description ?? "Item", it.unit ?? null, Number(it.quantity) || 0,
    Number(it.estimatedUnitCost) || 0, it.sourceType ?? null, it.sourceRefId ?? null, i));

  res.status(201).json(db.prepare("SELECT * FROM purchase_requests WHERE id = ?").get(prId));
});

router.put("/purchase-requests/:id/status", (req, res) => setStatus("purchase_requests", req, res));
router.delete("/purchase-requests/:id", (req, res) => {
  db.prepare("UPDATE purchase_requests SET deletedAt = datetime('now') WHERE id = ?").run(Number(req.params.id));
  res.status(204).end();
});

// ── Purchase orders (from awarded supplier) ──────────────────────────────────
router.get("/purchase-orders", (req, res) => {
  const projectId = req.query.projectId ? Number(req.query.projectId) : null;
  const rows = projectId
    ? db.prepare("SELECT * FROM purchase_orders WHERE projectId = ? AND deletedAt IS NULL ORDER BY id DESC").all(projectId)
    : db.prepare("SELECT * FROM purchase_orders WHERE deletedAt IS NULL ORDER BY id DESC").all();
  for (const po of rows) po.items = db.prepare("SELECT * FROM purchase_order_items WHERE poId = ? ORDER BY sortOrder, id").all(po.id);
  res.json(rows);
});

// Generate a PO from an awarded quotation.
router.post("/purchase-orders/from-quotation/:quotationId", (req, res) => {
  const qid = Number(req.params.quotationId);
  const quote = db.prepare("SELECT * FROM supplier_quotations WHERE id = ?").get(qid);
  if (!quote) return res.status(404).json({ error: "Quotation not found" });
  const rfq = db.prepare("SELECT * FROM rfqs WHERE id = ?").get(quote.rfqId);
  const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(quote.supplierId);
  const items = db.prepare(
    `SELECT ri.description, ri.unit, ri.quantity, COALESCE(sqi.unitPrice, 0) AS unitPrice
     FROM rfq_items ri
     LEFT JOIN supplier_quotation_items sqi ON sqi.rfqItemId = ri.id AND sqi.quotationId = ?
     WHERE ri.rfqId = ? ORDER BY ri.sortOrder, ri.id`
  ).all(qid, quote.rfqId);
  const amount = items.reduce((s, it) => s + it.unitPrice * it.quantity, 0);

  const result = db.prepare(
    `INSERT INTO purchase_orders (poNumber, projectId, supplierId, supplier, poDate, status, currency, remarks, amount, rfqId, quotationId, approvalStatus)
     VALUES (?, ?, ?, ?, date('now'), 'open', ?, ?, ?, ?, ?, 'draft')`
  ).run(genNumber("PO"), rfq?.projectId ?? null, quote.supplierId, supplier?.companyName ?? null,
    quote.currency || "USD", `From ${rfq?.rfqNumber ?? "RFQ"}`, amount, quote.rfqId, qid);
  const poId = result.lastInsertRowid;
  const ins = db.prepare("INSERT INTO purchase_order_items (poId, description, unit, quantity, unitPrice, sortOrder) VALUES (?, ?, ?, ?, ?, ?)");
  items.forEach((it, i) => ins.run(poId, it.description, it.unit, it.quantity, it.unitPrice, i));

  res.status(201).json(db.prepare("SELECT * FROM purchase_orders WHERE id = ?").get(poId));
});

router.put("/purchase-orders/:id/status", (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body;
  if (!WORKFLOW.includes(status)) return res.status(400).json({ error: `status must be one of ${WORKFLOW.join(", ")}` });
  const po = db.prepare("SELECT * FROM purchase_orders WHERE id = ?").get(id);
  if (!po) return res.status(404).json({ error: "Not found" });
  db.prepare("UPDATE purchase_orders SET approvalStatus = ?, updatedAt = datetime('now') WHERE id = ?").run(status, id);
  res.json(db.prepare("SELECT * FROM purchase_orders WHERE id = ?").get(id));
});

// ── Supplier performance ─────────────────────────────────────────────────────
router.get("/supplier-performance", (req, res) => {
  const supplierId = req.query.supplierId ? Number(req.query.supplierId) : null;
  const rows = supplierId
    ? db.prepare(
        `SELECT sp.*, s.companyName FROM supplier_performance sp JOIN suppliers s ON s.id = sp.supplierId
         WHERE sp.supplierId = ? ORDER BY sp.id DESC`
      ).all(supplierId)
    : db.prepare(
        `SELECT sp.*, s.companyName FROM supplier_performance sp JOIN suppliers s ON s.id = sp.supplierId ORDER BY sp.id DESC`
      ).all();
  res.json(rows);
});

// Aggregate scorecard per supplier (averages).
router.get("/supplier-performance/scorecard", (req, res) => {
  const rows = db.prepare(
    `SELECT s.id AS supplierId, s.companyName,
            COUNT(sp.id) AS evaluations,
            ROUND(AVG(sp.deliveryRating), 2) AS avgDelivery,
            ROUND(AVG(sp.qualityRating), 2) AS avgQuality,
            ROUND(AVG(sp.priceRating), 2) AS avgPrice,
            ROUND(AVG(sp.overallScore), 2) AS avgOverall
     FROM suppliers s
     JOIN supplier_performance sp ON sp.supplierId = s.id
     GROUP BY s.id ORDER BY avgOverall DESC`
  ).all();
  res.json(rows);
});

router.post("/supplier-performance", (req, res) => {
  const { supplierId, projectId, poId, deliveryRating, qualityRating, priceRating, remarks } = req.body;
  if (!supplierId) return res.status(400).json({ error: "supplierId is required" });
  const d = Number(deliveryRating) || 0, q = Number(qualityRating) || 0, p = Number(priceRating) || 0;
  const overall = Math.round(((d + q + p) / 3) * 100) / 100;
  const result = db.prepare(
    `INSERT INTO supplier_performance (supplierId, projectId, poId, deliveryRating, qualityRating, priceRating, overallScore, remarks)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(Number(supplierId), projectId ? Number(projectId) : null, poId ? Number(poId) : null, d, q, p, overall, remarks ?? null);

  // Keep the supplier's headline rating in sync with their average overall.
  const avg = db.prepare("SELECT AVG(overallScore) AS a FROM supplier_performance WHERE supplierId = ?").get(Number(supplierId)).a;
  db.prepare("UPDATE suppliers SET rating = ? WHERE id = ?").run(Math.round((avg || 0) * 100) / 100, Number(supplierId));

  res.status(201).json(db.prepare("SELECT * FROM supplier_performance WHERE id = ?").get(result.lastInsertRowid));
});

// ── Attachments ──────────────────────────────────────────────────────────────
router.get("/attachments", (req, res) => {
  const { entityType, entityId } = req.query;
  if (!entityType || !entityId) return res.status(400).json({ error: "entityType and entityId are required" });
  res.json(db.prepare(
    "SELECT id, entityType, entityId, fileName, fileType, size, createdAt FROM procurement_attachments WHERE entityType = ? AND entityId = ? ORDER BY id DESC"
  ).all(entityType, Number(entityId)));
});

router.get("/attachments/:id/data", (req, res) => {
  const row = db.prepare("SELECT * FROM procurement_attachments WHERE id = ?").get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

router.post("/attachments", (req, res) => {
  const { entityType, entityId, fileName, fileType, size, dataUrl } = req.body;
  if (!entityType || !entityId || !fileName) return res.status(400).json({ error: "entityType, entityId and fileName are required" });
  const ALLOWED = ["pdf", "excel", "drawing", "image"];
  const kind = (fileType || "").toLowerCase();
  const category =
    kind.includes("pdf") ? "pdf" :
    (kind.includes("sheet") || kind.includes("excel") || kind.includes("xls")) ? "excel" :
    (kind.includes("image") || kind.includes("png") || kind.includes("jpg")) ? "image" :
    (kind.includes("dwg") || kind.includes("drawing") || kind.includes("dxf")) ? "drawing" :
    ALLOWED.includes(kind) ? kind : "pdf";
  const result = db.prepare(
    "INSERT INTO procurement_attachments (entityType, entityId, fileName, fileType, size, dataUrl) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(entityType, Number(entityId), fileName, category, Number(size) || 0, dataUrl ?? null);
  res.status(201).json(db.prepare("SELECT id, entityType, entityId, fileName, fileType, size, createdAt FROM procurement_attachments WHERE id = ?").get(result.lastInsertRowid));
});

router.delete("/attachments/:id", (req, res) => {
  db.prepare("DELETE FROM procurement_attachments WHERE id = ?").run(Number(req.params.id));
  res.status(204).end();
});

// ── Procurement dashboard ────────────────────────────────────────────────────
router.get("/dashboard", (req, res) => {
  const projectId = req.query.projectId ? Number(req.query.projectId) : null;
  const where = projectId ? "AND projectId = ?" : "";
  const args = projectId ? [projectId] : [];
  const one = (sql) => db.prepare(sql).get(...args)?.c ?? 0;

  const outstandingRfqs = one(`SELECT COUNT(*) AS c FROM rfqs WHERE deletedAt IS NULL AND status NOT IN ('approved','cancelled','rejected') ${where}`);
  const pendingQuotations = db.prepare(
    `SELECT COUNT(*) AS c FROM supplier_quotations sq JOIN rfqs r ON r.id = sq.rfqId
     WHERE sq.deletedAt IS NULL AND sq.isAwarded = 0 ${projectId ? "AND r.projectId = ?" : ""}`
  ).get(...args).c;
  const awardedSuppliers = db.prepare(
    `SELECT COUNT(DISTINCT sq.supplierId) AS c FROM supplier_quotations sq JOIN rfqs r ON r.id = sq.rfqId
     WHERE sq.isAwarded = 1 AND sq.deletedAt IS NULL ${projectId ? "AND r.projectId = ?" : ""}`
  ).get(...args).c;
  const purchaseOrders = one(`SELECT COUNT(*) AS c FROM purchase_orders WHERE deletedAt IS NULL ${where}`);
  const purchaseRequests = one(`SELECT COUNT(*) AS c FROM purchase_requests WHERE deletedAt IS NULL ${where}`);

  const procurementValue = db.prepare(
    `SELECT COALESCE(SUM(amount), 0) AS v FROM purchase_orders WHERE deletedAt IS NULL ${where}`
  ).get(...args).v;

  // Budget = project estimate direct cost (materials + equipment + subcontract + other) if scoped.
  let budget = 0;
  if (projectId) {
    budget = estimateItems(projectId).reduce((s, it) => s + (it.estimatedUnitCost || 0) * (it.quantity || 0), 0);
  }

  res.json({
    stats: { outstandingRfqs, pendingQuotations, awardedSuppliers, purchaseOrders, purchaseRequests },
    budgetVsProcurement: { budget, procurement: procurementValue, variance: budget - procurementValue },
  });
});

export default router;
