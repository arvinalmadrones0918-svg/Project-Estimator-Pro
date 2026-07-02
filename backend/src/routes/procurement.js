import { Router } from "express";
import { db } from "../db.js";

const router = Router();

// NOTE: This module never touches the cost engine. "Automatically update the
// estimate" on supplier selection means updating the material catalog's
// current unitPrice (recorded in catalog_price_history, the same mechanism
// Phase 3 already uses). Existing line-item snapshots stay frozen by design;
// new entries pick up the selected supplier's price.

// ── Quotation helpers ───────────────────────────────────────────────────────

function quotationsForMaterial(materialId) {
  return db
    .prepare(
      `SELECT mq.*, s.companyName AS supplierName, s.rating AS supplierRating, s.status AS supplierStatus
       FROM material_quotations mq
       JOIN suppliers s ON s.id = mq.supplierId
       WHERE mq.materialId = ? AND mq.deletedAt IS NULL
       ORDER BY mq.quotedUnitCost ASC, mq.id ASC`
    )
    .all(materialId);
}

// Price comparison stats for a material: lowest/highest/average across active
// quotations, the selected/preferred supplier, the previous purchase price
// (from catalog_price_history), and the variance of the selected vs lowest.
function comparisonForMaterial(materialId) {
  const material = db.prepare("SELECT * FROM materials WHERE id = ?").get(materialId);
  if (!material) return null;
  const quotes = quotationsForMaterial(materialId).filter((q) => q.status === "active");

  const costs = quotes.map((q) => q.quotedUnitCost);
  const lowest = costs.length ? Math.min(...costs) : null;
  const highest = costs.length ? Math.max(...costs) : null;
  const average = costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null;

  const selected = quotes.find((q) => q.isSelected) || null;
  // Preferred = active quotation from the highest-rated supplier.
  const preferred = quotes.length
    ? [...quotes].sort((a, b) => b.supplierRating - a.supplierRating)[0]
    : null;

  const prevHistory = db
    .prepare("SELECT oldPrice, newPrice FROM catalog_price_history WHERE catalogType = 'material' AND catalogId = ? ORDER BY id DESC LIMIT 1")
    .get(materialId);
  const previousPurchasePrice = prevHistory ? prevHistory.oldPrice : null;

  const selectedCost = selected ? selected.quotedUnitCost : null;
  const priceVariance =
    selectedCost != null && lowest != null ? selectedCost - lowest : null;
  const priceVariancePct =
    selectedCost != null && lowest != null && lowest !== 0
      ? ((selectedCost - lowest) / lowest) * 100
      : null;

  return {
    materialId,
    materialName: material.name,
    currentUnitPrice: material.unitPrice,
    quotationCount: quotes.length,
    lowest, highest, average,
    lowestSupplier: quotes.find((q) => q.quotedUnitCost === lowest)?.supplierName ?? null,
    highestSupplier: quotes.find((q) => q.quotedUnitCost === highest)?.supplierName ?? null,
    selected,
    preferred,
    previousPurchasePrice,
    priceVariance,
    priceVariancePct,
  };
}

// ── Quotations CRUD ─────────────────────────────────────────────────────────

router.get("/quotations", (req, res) => {
  const materialId = Number(req.query.materialId);
  if (!materialId) return res.status(400).json({ error: "materialId is required" });
  res.json(quotationsForMaterial(materialId));
});

const Q_FIELDS = [
  "supplierId", "quotedUnitCost", "currency", "validityDate", "leadTime",
  "deliveryTerms", "paymentTerms", "quotationReference", "remarks", "status",
];

router.post("/quotations", (req, res) => {
  const { materialId } = req.body;
  if (!materialId || !req.body.supplierId || req.body.quotedUnitCost == null) {
    return res.status(400).json({ error: "materialId, supplierId and quotedUnitCost are required" });
  }
  const material = db.prepare("SELECT id FROM materials WHERE id = ?").get(Number(materialId));
  if (!material) return res.status(400).json({ error: "materialId does not exist" });
  const supplier = db.prepare("SELECT id FROM suppliers WHERE id = ?").get(Number(req.body.supplierId));
  if (!supplier) return res.status(400).json({ error: "supplierId does not exist" });

  const values = Q_FIELDS.map((f) => {
    if (f === "currency") return req.body[f] || "USD";
    if (f === "status") return req.body[f] || "active";
    if (f === "quotedUnitCost") return Number(req.body[f]);
    if (f === "supplierId") return Number(req.body[f]);
    return req.body[f] ?? null;
  });
  const result = db
    .prepare(`INSERT INTO material_quotations (materialId, ${Q_FIELDS.join(", ")}) VALUES (?, ${Q_FIELDS.map(() => "?").join(", ")})`)
    .run(Number(materialId), ...values);
  res.status(201).json(db.prepare("SELECT * FROM material_quotations WHERE id = ?").get(result.lastInsertRowid));
});

router.put("/quotations/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM material_quotations WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const values = Q_FIELDS.map((f) => {
    if (req.body[f] === undefined) return existing[f];
    if (f === "quotedUnitCost") return Number(req.body[f]);
    if (f === "supplierId") return Number(req.body[f]);
    return req.body[f];
  });
  const assignments = Q_FIELDS.map((f) => `${f} = ?`).join(", ");
  db.prepare(`UPDATE material_quotations SET ${assignments}, updatedAt = datetime('now') WHERE id = ?`).run(...values, id);
  res.json(db.prepare("SELECT * FROM material_quotations WHERE id = ?").get(id));
});

router.delete("/quotations/:id", (req, res) => {
  db.prepare("UPDATE material_quotations SET deletedAt = datetime('now') WHERE id = ?").run(Number(req.params.id));
  res.status(204).end();
});

// ── Price comparison ────────────────────────────────────────────────────────

router.get("/comparison/:materialId", (req, res) => {
  const comparison = comparisonForMaterial(Number(req.params.materialId));
  if (!comparison) return res.status(404).json({ error: "Material not found" });
  res.json({ ...comparison, quotations: quotationsForMaterial(Number(req.params.materialId)) });
});

// ── Supplier selection (updates the estimate's catalog price) ───────────────

router.post("/select", (req, res) => {
  const { materialId, quotationId, selectionMethod = "manual", changedBy } = req.body;
  if (!materialId || !quotationId) return res.status(400).json({ error: "materialId and quotationId are required" });

  const material = db.prepare("SELECT * FROM materials WHERE id = ?").get(Number(materialId));
  if (!material) return res.status(404).json({ error: "Material not found" });
  const quote = db.prepare("SELECT * FROM material_quotations WHERE id = ? AND materialId = ?").get(Number(quotationId), Number(materialId));
  if (!quote) return res.status(404).json({ error: "Quotation not found for this material" });

  const prevQuote = db.prepare("SELECT * FROM material_quotations WHERE materialId = ? AND isSelected = 1").get(Number(materialId));

  db.exec("BEGIN");
  try {
    // Flip selection flags
    db.prepare("UPDATE material_quotations SET isSelected = 0, selectionMethod = NULL WHERE materialId = ?").run(Number(materialId));
    db.prepare("UPDATE material_quotations SET isSelected = 1, selectionMethod = ?, updatedAt = datetime('now') WHERE id = ?").run(selectionMethod, Number(quotationId));

    // Update the material catalog price (records history) — this is how the
    // estimate auto-updates for future entries, reusing the Phase 3 mechanism.
    const oldPrice = material.unitPrice;
    if (oldPrice !== quote.quotedUnitCost) {
      db.prepare(
        `INSERT INTO catalog_price_history (catalogType, catalogId, oldPrice, newPrice, supplier, updatedBy, notes, createdAt)
         VALUES ('material', ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).run(Number(materialId), oldPrice, quote.quotedUnitCost,
        db.prepare("SELECT companyName FROM suppliers WHERE id = ?").get(quote.supplierId)?.companyName ?? null,
        changedBy ?? null, `Supplier selection (${selectionMethod})`);
    }
    db.prepare("UPDATE materials SET unitPrice = ?, selectedQuotationId = ?, supplier = ?, updatedAt = datetime('now') WHERE id = ?")
      .run(quote.quotedUnitCost, Number(quotationId),
        db.prepare("SELECT companyName FROM suppliers WHERE id = ?").get(quote.supplierId)?.companyName ?? null,
        Number(materialId));

    // Audit
    db.prepare(
      `INSERT INTO quotation_audit (materialId, action, previousSupplierId, previousQuotationId, previousUnitCost,
        newSupplierId, newQuotationId, newUnitCost, selectionMethod, changedBy, createdAt)
       VALUES (?, 'select', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(
      Number(materialId),
      prevQuote?.supplierId ?? null, prevQuote?.id ?? null, prevQuote?.quotedUnitCost ?? oldPrice,
      quote.supplierId, quote.id, quote.quotedUnitCost, selectionMethod, changedBy ?? null
    );

    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    return res.status(500).json({ error: e.message });
  }

  res.json({ ...comparisonForMaterial(Number(materialId)), quotations: quotationsForMaterial(Number(materialId)) });
});

// ── Procurement dashboard ───────────────────────────────────────────────────

router.get("/dashboard", (req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  const totalMaterials = db.prepare("SELECT COUNT(*) AS c FROM materials WHERE isActive = 1 AND deletedAt IS NULL").get().c;
  const quotedMaterialIds = db.prepare("SELECT DISTINCT materialId FROM material_quotations WHERE deletedAt IS NULL").all().map((r) => r.materialId);
  const quotedCount = quotedMaterialIds.length;

  const awaitingQuotation = totalMaterials - quotedCount;

  const multipleQuotations = db
    .prepare("SELECT materialId, COUNT(*) AS c FROM material_quotations WHERE deletedAt IS NULL GROUP BY materialId HAVING c > 1")
    .all().length;

  const expiredQuotations = db
    .prepare("SELECT COUNT(*) AS c FROM material_quotations WHERE deletedAt IS NULL AND validityDate IS NOT NULL AND validityDate < ?")
    .get(today).c;

  const totalQuotations = db.prepare("SELECT COUNT(*) AS c FROM material_quotations WHERE deletedAt IS NULL").get().c;
  const selectedCount = db.prepare("SELECT COUNT(*) AS c FROM material_quotations WHERE deletedAt IS NULL AND isSelected = 1").get().c;

  // Items needing attention: active materials with no quotation yet.
  const awaitingList = db
    .prepare(
      `SELECT m.id, m.code, m.name, m.category, m.unit, m.unitPrice
       FROM materials m
       WHERE m.isActive = 1 AND m.deletedAt IS NULL
         AND m.id NOT IN (SELECT DISTINCT materialId FROM material_quotations WHERE deletedAt IS NULL)
       ORDER BY m.name LIMIT 500`
    )
    .all();

  res.json({
    stats: {
      totalMaterials, quotedCount, awaitingQuotation, multipleQuotations,
      expiredQuotations, totalQuotations, selectedCount,
    },
    awaitingList,
  });
});

// Price comparison table across all quoted materials.
router.get("/comparison-table", (req, res) => {
  const materialIds = db.prepare("SELECT DISTINCT materialId FROM material_quotations WHERE deletedAt IS NULL").all().map((r) => r.materialId);
  const rows = materialIds.map((id) => comparisonForMaterial(id)).filter(Boolean);
  res.json(rows);
});

// ── Purchase packages ───────────────────────────────────────────────────────
// Group quoted/selected materials by WBS category (via the modules that use
// them) or by selected supplier, producing procurement packages.

router.get("/packages", (req, res) => {
  const groupBy = req.query.groupBy === "supplier" ? "supplier" : "category";

  // Materials in use, with their selected supplier and the WBS category of the
  // modules they appear in.
  const rows = db
    .prepare(
      `SELECT DISTINCT m.id AS materialId, m.code, m.name, m.unit, m.unitPrice,
              wc.name AS categoryName,
              sq.companyName AS selectedSupplier, sq.quotedUnitCost AS selectedCost
       FROM module_materials mm
       JOIN materials m ON m.id = mm.materialId
       JOIN work_modules wmod ON wmod.id = mm.workModuleId AND wmod.deletedAt IS NULL
       LEFT JOIN wbs_categories wc ON wc.id = wmod.wbsCategoryId
       LEFT JOIN (
         SELECT q.materialId, s.companyName, q.quotedUnitCost
         FROM material_quotations q JOIN suppliers s ON s.id = q.supplierId
         WHERE q.isSelected = 1 AND q.deletedAt IS NULL
       ) sq ON sq.materialId = m.id`
    )
    .all();

  const packages = {};
  for (const r of rows) {
    const key = groupBy === "supplier" ? (r.selectedSupplier || "Unassigned Supplier") : (r.categoryName || "Uncategorized");
    if (!packages[key]) packages[key] = { key, items: [], total: 0 };
    const lineCost = r.selectedCost ?? r.unitPrice ?? 0;
    packages[key].items.push({ ...r, lineCost });
    packages[key].total += lineCost;
  }

  res.json({ groupBy, packages: Object.values(packages) });
});

// ── RFQ (Request for Quotation) — printable data ────────────────────────────

router.get("/rfq", (req, res) => {
  const supplierId = req.query.supplierId ? Number(req.query.supplierId) : null;
  const category = req.query.category || null;

  const supplier = supplierId ? db.prepare("SELECT * FROM suppliers WHERE id = ?").get(supplierId) : null;

  // Materials to request quotes for: either a WBS category's materials in use,
  // or all active materials awaiting a quotation.
  let materials;
  if (category) {
    materials = db
      .prepare(
        `SELECT DISTINCT m.id, m.code, m.name, m.category, m.unit
         FROM module_materials mm
         JOIN materials m ON m.id = mm.materialId
         JOIN work_modules wmod ON wmod.id = mm.workModuleId AND wmod.deletedAt IS NULL
         JOIN wbs_categories wc ON wc.id = wmod.wbsCategoryId
         WHERE wc.name = ? ORDER BY m.name`
      )
      .all(category);
  } else {
    materials = db
      .prepare("SELECT id, code, name, category, unit FROM materials WHERE isActive = 1 AND deletedAt IS NULL ORDER BY name LIMIT 500")
      .all();
  }

  res.json({
    generatedAt: new Date().toISOString(),
    reference: `RFQ-${Date.now().toString(36).toUpperCase()}`,
    supplier,
    category,
    materials,
  });
});

// ── Audit ───────────────────────────────────────────────────────────────────

router.get("/audit", (req, res) => {
  const materialId = req.query.materialId ? Number(req.query.materialId) : null;
  const limit = Math.min(Number(req.query.limit) || 100, 1000);
  const rows = materialId
    ? db.prepare(
        `SELECT qa.*, m.name AS materialName,
                ps.companyName AS previousSupplierName, ns.companyName AS newSupplierName
         FROM quotation_audit qa
         JOIN materials m ON m.id = qa.materialId
         LEFT JOIN suppliers ps ON ps.id = qa.previousSupplierId
         LEFT JOIN suppliers ns ON ns.id = qa.newSupplierId
         WHERE qa.materialId = ? ORDER BY qa.id DESC LIMIT ?`
      ).all(materialId, limit)
    : db.prepare(
        `SELECT qa.*, m.name AS materialName,
                ps.companyName AS previousSupplierName, ns.companyName AS newSupplierName
         FROM quotation_audit qa
         JOIN materials m ON m.id = qa.materialId
         LEFT JOIN suppliers ps ON ps.id = qa.previousSupplierId
         LEFT JOIN suppliers ns ON ns.id = qa.newSupplierId
         ORDER BY qa.id DESC LIMIT ?`
      ).all(limit);
  res.json(rows);
});

export default router;
