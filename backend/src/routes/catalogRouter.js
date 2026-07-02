import { Router } from "express";
import { db } from "../db.js";
import * as XLSX from "xlsx";

const SORT_WHITELIST = new Set(["id", "code", "name", "category", "subcategory", "supplier", "unit", "unitPrice", "hourlyRate", "createdAt", "updatedAt"]);
const PAGE_SIZE_MAX = 500;

/**
 * Factory that builds a full-featured CRUD + search + import/export + price-history
 * router for any master catalog table. All five catalog types share this logic;
 * only the table name, price column, and required fields differ.
 *
 * @param {string} table       - SQLite table name
 * @param {string} priceCol    - column holding the item's current price (unitPrice | hourlyRate)
 * @param {string} catalogType - short string stored in catalog_price_history.catalogType
 * @param {object} opts
 *   hasUnit {boolean}  - whether this catalog type has a unit column (default true)
 *   nameLabel {string} - label for the main name field used in error messages
 */
export function makeCatalogRouter(table, priceCol, catalogType, opts = {}) {
  const { hasUnit = true } = opts;
  const router = Router();

  // ── Helpers ────────────────────────────────────────────────────────────────

  function recordPriceHistory(catalogId, oldPrice, newPrice, meta = {}) {
    if (oldPrice === newPrice) return;
    db.prepare(
      `INSERT INTO catalog_price_history (catalogType, catalogId, oldPrice, newPrice, effectiveDate, supplier, updatedBy, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      catalogType,
      catalogId,
      oldPrice,
      newPrice,
      meta.effectiveDate ?? new Date().toISOString().slice(0, 10),
      meta.supplier ?? null,
      meta.updatedBy ?? null,
      meta.notes ?? null
    );
  }

  function buildListQuery(params) {
    const { q, category, subcategory, supplier, unit, minPrice, maxPrice, status, sort, order, page, limit } = params;

    const conditions = ["deletedAt IS NULL"];
    const args = [];

    if (q) {
      conditions.push("(name LIKE ? OR code LIKE ? OR description LIKE ? OR supplier LIKE ?)");
      const like = `%${q}%`;
      args.push(like, like, like, like);
    }
    if (category) { conditions.push("category = ?"); args.push(category); }
    if (subcategory) { conditions.push("subcategory = ?"); args.push(subcategory); }
    if (supplier) { conditions.push("supplier = ?"); args.push(supplier); }
    if (hasUnit && unit) { conditions.push("unit = ?"); args.push(unit); }
    if (minPrice !== undefined && minPrice !== "") { conditions.push(`${priceCol} >= ?`); args.push(Number(minPrice)); }
    if (maxPrice !== undefined && maxPrice !== "") { conditions.push(`${priceCol} <= ?`); args.push(Number(maxPrice)); }

    if (status === "active") { conditions.push("isActive = 1"); }
    else if (status === "inactive") { conditions.push("isActive = 0"); }
    // status === "all" → no filter

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const safeSort = SORT_WHITELIST.has(sort) ? sort : "name";
    const safeOrder = order === "desc" ? "DESC" : "ASC";
    const pageNum = Math.max(1, parseInt(page ?? 1, 10));
    const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, parseInt(limit ?? 50, 10)));
    const offset = (pageNum - 1) * pageSize;

    return { where, args, safeSort, safeOrder, pageSize, offset };
  }

  // ── List with server-side pagination, search, filter, sort ────────────────

  router.get("/", (req, res) => {
    // When called with no pagination params (e.g. from NodeEditor dropdowns),
    // return all active items without the pagination envelope so callers that
    // expect a plain array still work.
    if (!req.query.page && !req.query.q && !req.query.category && !req.query.status) {
      const items = db.prepare(`SELECT * FROM ${table} WHERE isActive = 1 AND deletedAt IS NULL ORDER BY name ASC`).all();
      return res.json(items);
    }

    const { where, args, safeSort, safeOrder, pageSize, offset } = buildListQuery(req.query);
    const items = db.prepare(`SELECT * FROM ${table} ${where} ORDER BY ${safeSort} ${safeOrder} LIMIT ? OFFSET ?`).all(...args, pageSize, offset);
    const { total } = db.prepare(`SELECT COUNT(*) AS total FROM ${table} ${where}`).get(...args);
    res.json({ items, total, page: Math.max(1, parseInt(req.query.page ?? 1, 10)), pageSize });
  });

  // ── Export ─────────────────────────────────────────────────────────────────

  router.get("/export", (req, res) => {
    const { where, args, safeSort, safeOrder } = buildListQuery(req.query);
    const rows = db.prepare(`SELECT * FROM ${table} ${where} ORDER BY ${safeSort} ${safeOrder}`).all(...args);
    const fmt = req.query.format === "csv" ? "csv" : "xlsx";

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Catalog");

    const buf = XLSX.write(wb, { type: "buffer", bookType: fmt === "csv" ? "csv" : "xlsx" });
    res.set("Content-Disposition", `attachment; filename="catalog.${fmt}"`);
    res.set("Content-Type", fmt === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  });

  // ── Distinct values for filter dropdowns ──────────────────────────────────

  router.get("/filters", (req, res) => {
    const categories = db.prepare(`SELECT DISTINCT category FROM ${table} WHERE deletedAt IS NULL AND category IS NOT NULL ORDER BY category`).all().map((r) => r.category);
    const suppliers = db.prepare(`SELECT DISTINCT supplier FROM ${table} WHERE deletedAt IS NULL AND supplier IS NOT NULL ORDER BY supplier`).all().map((r) => r.supplier);
    const units = hasUnit ? db.prepare(`SELECT DISTINCT unit FROM ${table} WHERE deletedAt IS NULL AND unit IS NOT NULL ORDER BY unit`).all().map((r) => r.unit) : [];
    res.json({ categories, suppliers, units });
  });

  // ── Import preview (parses JSON rows sent by frontend) ────────────────────

  router.post("/import/preview", (req, res) => {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "rows array is required" });
    }
    // Detect duplicates: name match against existing (non-deleted) rows
    const existing = db.prepare(`SELECT id, name, code FROM ${table} WHERE deletedAt IS NULL`).all();
    const nameMap = new Map(existing.map((r) => [r.name.toLowerCase().trim(), r]));
    const codeMap = new Map(existing.filter((r) => r.code).map((r) => [r.code.toLowerCase().trim(), r]));

    const preview = rows.map((row, i) => {
      const nameLower = (row.name ?? row.Name ?? "").toString().toLowerCase().trim();
      const codeLower = (row.code ?? row.Code ?? "").toString().toLowerCase().trim();
      const duplicate = nameMap.get(nameLower) ?? (codeLower ? codeMap.get(codeLower) : null) ?? null;
      return {
        _rowIndex: i,
        name: row.name ?? row.Name ?? row.description ?? row.Description ?? "",
        code: row.code ?? row.Code ?? "",
        category: row.category ?? row.Category ?? "General",
        subcategory: row.subcategory ?? row.Subcategory ?? "",
        manufacturer: row.manufacturer ?? row.Manufacturer ?? "",
        brand: row.brand ?? row.Brand ?? "",
        supplier: row.supplier ?? row.Supplier ?? "",
        unit: row.unit ?? row.Unit ?? "",
        [priceCol]: parseFloat(row[priceCol] ?? row.unitPrice ?? row.hourlyRate ?? row["Unit Cost"] ?? row["Unit Price"] ?? row["Hourly Rate"] ?? 0) || 0,
        currency: row.currency ?? row.Currency ?? "USD",
        remarks: row.remarks ?? row.Remarks ?? "",
        description: row.description ?? row.Description ?? "",
        _duplicate: duplicate ? { id: duplicate.id, name: duplicate.name } : null,
      };
    });
    res.json(preview);
  });

  // ── Import confirm ─────────────────────────────────────────────────────────

  router.post("/import/confirm", (req, res) => {
    const { rows, mergeExisting = false } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "rows array is required" });
    }

    const insertStmt = db.prepare(
      `INSERT INTO ${table} (code, name, description, category, subcategory, manufacturer, brand, supplier, unit, ${priceCol}, currency, remarks, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    );

    let inserted = 0;
    let merged = 0;
    let skipped = 0;

    db.exec("BEGIN");
    try {
      for (const row of rows) {
        if (row._skip) { skipped++; continue; }

        if (row._duplicate && mergeExisting) {
          const existing = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(row._duplicate.id);
          const oldPrice = existing[priceCol];
          db.prepare(
            `UPDATE ${table} SET code=?, description=?, category=?, subcategory=?, manufacturer=?, brand=?, supplier=?, unit=?, ${priceCol}=?, currency=?, remarks=?, updatedAt=datetime('now') WHERE id=?`
          ).run(row.code || existing.code, row.description || existing.description, row.category || existing.category, row.subcategory || existing.subcategory,
            row.manufacturer || existing.manufacturer, row.brand || existing.brand, row.supplier || existing.supplier,
            row.unit || existing.unit, row[priceCol] ?? existing[priceCol], row.currency || existing.currency,
            row.remarks || existing.remarks, row._duplicate.id);
          recordPriceHistory(row._duplicate.id, oldPrice, row[priceCol] ?? oldPrice, { updatedBy: "import" });
          merged++;
        } else if (!row._duplicate) {
          const result = insertStmt.run(
            row.code || null, row.name, row.description || null, row.category || "General",
            row.subcategory || null, row.manufacturer || null, row.brand || null, row.supplier || null,
            row.unit || null, row[priceCol] ?? 0, row.currency || "USD", row.remarks || null
          );
          recordPriceHistory(result.lastInsertRowid, null, row[priceCol] ?? 0, { updatedBy: "import" });
          inserted++;
        } else {
          skipped++;
        }
      }
      db.exec("COMMIT");
    } catch (e) { db.exec("ROLLBACK"); throw e; }
    res.json({ inserted, merged, skipped });
  });

  // ── Bulk update ────────────────────────────────────────────────────────────

  router.post("/bulk", (req, res) => {
    const { ids, action, value } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids required" });

    const placeholders = ids.map(() => "?").join(",");

    if (action === "priceIncrease" || action === "priceReduction") {
      const factor = action === "priceIncrease" ? 1 + Number(value) / 100 : 1 - Number(value) / 100;
      const rows = db.prepare(`SELECT id, ${priceCol} FROM ${table} WHERE id IN (${placeholders})`).all(...ids);
      db.exec("BEGIN");
      try {
        for (const row of rows) {
          const newPrice = Math.round(row[priceCol] * factor * 10000) / 10000;
          db.prepare(`UPDATE ${table} SET ${priceCol} = ?, updatedAt = datetime('now') WHERE id = ?`).run(newPrice, row.id);
          recordPriceHistory(row.id, row[priceCol], newPrice, { updatedBy: "bulk", notes: `${action} ${value}%` });
        }
        db.exec("COMMIT");
      } catch (e) { db.exec("ROLLBACK"); throw e; }
    } else if (action === "setPrice") {
      const newPrice = Number(value);
      const rows = db.prepare(`SELECT id, ${priceCol} FROM ${table} WHERE id IN (${placeholders})`).all(...ids);
      db.exec("BEGIN");
      try {
        for (const row of rows) {
          db.prepare(`UPDATE ${table} SET ${priceCol} = ?, updatedAt = datetime('now') WHERE id = ?`).run(newPrice, row.id);
          recordPriceHistory(row.id, row[priceCol], newPrice, { updatedBy: "bulk", notes: "bulk set price" });
        }
        db.exec("COMMIT");
      } catch (e) { db.exec("ROLLBACK"); throw e; }
    } else if (action === "setSupplier") {
      db.prepare(`UPDATE ${table} SET supplier = ?, updatedAt = datetime('now') WHERE id IN (${placeholders})`).run(value, ...ids);
    } else if (action === "deactivate") {
      db.prepare(`UPDATE ${table} SET isActive = 0, updatedAt = datetime('now') WHERE id IN (${placeholders})`).run(...ids);
    } else if (action === "activate") {
      db.prepare(`UPDATE ${table} SET isActive = 1, updatedAt = datetime('now') WHERE id IN (${placeholders})`).run(...ids);
    } else if (action === "delete") {
      db.prepare(`UPDATE ${table} SET deletedAt = datetime('now'), updatedAt = datetime('now') WHERE id IN (${placeholders})`).run(...ids);
    } else {
      return res.status(400).json({ error: "unknown action" });
    }

    res.json({ updated: ids.length });
  });

  // ── Single item routes ─────────────────────────────────────────────────────

  router.get("/:id", (req, res) => {
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(Number(req.params.id));
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  });

  router.post("/", (req, res) => {
    const body = req.body;
    if (!body.name) return res.status(400).json({ error: "name is required" });

    const result = db.prepare(
      `INSERT INTO ${table} (code, name, description, category, subcategory, manufacturer, brand, supplier, unit, ${priceCol}, currency, remarks, createdBy, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).run(
      body.code ?? null, body.name, body.description ?? null,
      body.category ?? "General", body.subcategory ?? null,
      body.manufacturer ?? null, body.brand ?? null, body.supplier ?? null,
      body.unit ?? null, body[priceCol] != null ? Number(body[priceCol]) : 0,
      body.currency ?? "USD", body.remarks ?? null, body.createdBy ?? null
    );
    const created = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(result.lastInsertRowid);
    recordPriceHistory(created.id, null, created[priceCol], { updatedBy: body.createdBy });
    res.status(201).json(created);
  });

  router.put("/:id", (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    if (!existing) return res.status(404).json({ error: "Not found" });

    const body = req.body;
    const newPrice = body[priceCol] != null ? Number(body[priceCol]) : existing[priceCol];

    db.prepare(
      `UPDATE ${table}
       SET code=?, name=?, description=?, category=?, subcategory=?, manufacturer=?, brand=?,
           supplier=?, unit=?, ${priceCol}=?, currency=?, remarks=?, isActive=?, updatedAt=datetime('now')
       WHERE id=?`
    ).run(
      body.code !== undefined ? body.code : existing.code,
      body.name ?? existing.name,
      body.description !== undefined ? body.description : existing.description,
      body.category ?? existing.category,
      body.subcategory !== undefined ? body.subcategory : existing.subcategory,
      body.manufacturer !== undefined ? body.manufacturer : existing.manufacturer,
      body.brand !== undefined ? body.brand : existing.brand,
      body.supplier !== undefined ? body.supplier : existing.supplier,
      body.unit !== undefined ? body.unit : existing.unit,
      newPrice,
      body.currency ?? existing.currency,
      body.remarks !== undefined ? body.remarks : existing.remarks,
      body.isActive !== undefined ? Number(Boolean(body.isActive)) : existing.isActive,
      id
    );
    recordPriceHistory(id, existing[priceCol], newPrice, { updatedBy: body.updatedBy, supplier: body.supplier });
    res.json(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id));
  });

  router.post("/:id/duplicate", (req, res) => {
    const existing = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(Number(req.params.id));
    if (!existing) return res.status(404).json({ error: "Not found" });
    const result = db.prepare(
      `INSERT INTO ${table} (code, name, description, category, subcategory, manufacturer, brand, supplier, unit, ${priceCol}, currency, remarks, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).run(
      existing.code ? `${existing.code}-COPY` : null,
      `${existing.name} (Copy)`,
      existing.description, existing.category, existing.subcategory,
      existing.manufacturer, existing.brand, existing.supplier,
      existing.unit, existing[priceCol], existing.currency, existing.remarks
    );
    const created = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(result.lastInsertRowid);
    recordPriceHistory(created.id, null, created[priceCol], { notes: `duplicated from ${existing.id}` });
    res.status(201).json(created);
  });

  router.put("/:id/deactivate", (req, res) => {
    const id = Number(req.params.id);
    db.prepare(`UPDATE ${table} SET isActive = 0, updatedAt = datetime('now') WHERE id = ?`).run(id);
    res.json(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id));
  });

  router.put("/:id/activate", (req, res) => {
    const id = Number(req.params.id);
    db.prepare(`UPDATE ${table} SET isActive = 1, updatedAt = datetime('now') WHERE id = ?`).run(id);
    res.json(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id));
  });

  // Soft delete — distinct from deactivate. Deleted items are hidden from all
  // views; deactivated items are visible in the "inactive" filter.
  router.delete("/:id", (req, res) => {
    const id = Number(req.params.id);
    db.prepare(`UPDATE ${table} SET deletedAt = datetime('now'), updatedAt = datetime('now') WHERE id = ?`).run(id);
    res.status(204).end();
  });

  router.put("/:id/restore", (req, res) => {
    const id = Number(req.params.id);
    db.prepare(`UPDATE ${table} SET deletedAt = NULL, isActive = 1, updatedAt = datetime('now') WHERE id = ?`).run(id);
    res.json(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id));
  });

  router.get("/:id/price-history", (req, res) => {
    const rows = db.prepare(
      `SELECT * FROM catalog_price_history WHERE catalogType = ? AND catalogId = ? ORDER BY createdAt DESC LIMIT 100`
    ).all(catalogType, Number(req.params.id));
    res.json(rows);
  });

  return router;
}
