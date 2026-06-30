import { Router } from "express";
import * as XLSX from "xlsx";
import { db } from "../db.js";
import {
  buildBOQ, buildResourceSummary, buildAssemblySummary, buildCostBreakdown,
  buildProjectCostSummary, buildUpaReport, buildProcurementSummary,
  buildSupplierComparison, buildGRSummary, boqToRows,
} from "../services/reportService.js";

const router = Router();

// ════════════════════════════════════════════════════════════════════════════
// EXCEL IMPORT / EXPORT — generic, registry-driven data-exchange layer.
//
// One engine validates, previews, de-duplicates and commits rows for every
// entity. It does NOT re-implement cost calculations or per-entity business
// rules — it writes to the same tables the existing CRUD routes use, with the
// same column sets, so estimate accuracy and relationships are preserved.
// ════════════════════════════════════════════════════════════════════════════

// field: { key (=db column), label, required?, type?(text|number|date),
//          unique?(for duplicate detection), ref?({table,column}) }
const ENTITIES = {
  projects: {
    label: "Projects", table: "projects", softDelete: true,
    fields: [
      { key: "name", label: "Name", required: true },
      { key: "projectNumber", label: "Project Number", unique: true },
      { key: "client", label: "Client" },
      { key: "location", label: "Location" },
      { key: "estimator", label: "Estimator" },
      { key: "currency", label: "Currency" },
    ],
  },
  wbs: {
    label: "WBS Categories", table: "wbs_categories", softDelete: false,
    fields: [
      { key: "name", label: "Name", required: true, unique: true },
      { key: "code", label: "Code" },
    ],
  },
  materials: {
    label: "Materials", table: "materials", softDelete: true,
    fields: [
      { key: "code", label: "Code", unique: true },
      { key: "name", label: "Name", required: true },
      { key: "category", label: "Category", required: true },
      { key: "unit", label: "Unit", required: true },
      { key: "unitPrice", label: "Unit Price", type: "number", required: true },
    ],
  },
  labor: {
    label: "Labor", table: "labor_specializations", softDelete: true,
    fields: [
      { key: "code", label: "Code", unique: true },
      { key: "name", label: "Name", required: true },
      { key: "category", label: "Category" },
      { key: "hourlyRate", label: "Hourly Rate", type: "number", required: true },
    ],
  },
  equipment: {
    label: "Equipment", table: "equipment", softDelete: true,
    fields: [
      { key: "code", label: "Code", unique: true },
      { key: "name", label: "Name", required: true },
      { key: "category", label: "Category", required: true },
      { key: "unit", label: "Unit", required: true },
      { key: "unitPrice", label: "Unit Price", type: "number", required: true },
    ],
  },
  subcontract: {
    label: "Subcontract", table: "subcontract_catalog", softDelete: true,
    fields: [
      { key: "code", label: "Code", unique: true },
      { key: "name", label: "Name", required: true },
      { key: "category", label: "Category" },
      { key: "unit", label: "Unit" },
      { key: "unitPrice", label: "Unit Price", type: "number" },
    ],
  },
  otherCosts: {
    label: "Other Costs", table: "other_costs_catalog", softDelete: true,
    fields: [
      { key: "code", label: "Code", unique: true },
      { key: "name", label: "Name", required: true },
      { key: "category", label: "Category" },
      { key: "unit", label: "Unit" },
      { key: "unitPrice", label: "Unit Price", type: "number" },
    ],
  },
  assemblies: {
    label: "Assemblies", table: "assemblies", softDelete: false,
    fields: [
      { key: "code", label: "Code", unique: true },
      { key: "name", label: "Name", required: true },
      { key: "unit", label: "Unit", required: true },
      { key: "description", label: "Description" },
    ],
  },
  upa: {
    label: "Unit Price Analysis", table: "unit_price_analyses", softDelete: true,
    fields: [
      { key: "code", label: "Code", unique: true },
      { key: "description", label: "Description", required: true },
      { key: "trade", label: "Trade" },
      { key: "unit", label: "Unit", required: true },
    ],
  },
  workModules: {
    label: "Work Modules", table: "work_modules", softDelete: true,
    fields: [
      { key: "name", label: "Name", required: true },
      { key: "description", label: "Description" },
      { key: "projectId", label: "Project ID", type: "number", ref: { table: "projects", column: "id" } },
    ],
  },
  generalRequirements: {
    label: "General Requirements", table: "gr_sheets", softDelete: true,
    fields: [
      { key: "name", label: "Name", required: true },
      { key: "projectId", label: "Project ID", type: "number", ref: { table: "projects", column: "id" } },
      { key: "durationDays", label: "Duration (days)", type: "number" },
      { key: "calendarMonths", label: "Calendar Months", type: "number" },
      { key: "projectValue", label: "Project Value", type: "number" },
    ],
  },
  suppliers: {
    label: "Suppliers", table: "suppliers", softDelete: true,
    fields: [
      { key: "code", label: "Code", unique: true },
      { key: "companyName", label: "Company Name", required: true },
      { key: "tradeCategory", label: "Trade Category" },
      { key: "email", label: "Email" },
      { key: "telephone", label: "Telephone" },
      { key: "rating", label: "Rating", type: "number" },
    ],
  },
  quotations: {
    label: "Supplier Quotations", table: "material_quotations", softDelete: true,
    fields: [
      { key: "materialId", label: "Material ID", type: "number", required: true, ref: { table: "materials", column: "id" } },
      { key: "supplierId", label: "Supplier ID", type: "number", required: true, ref: { table: "suppliers", column: "id" } },
      { key: "quotedUnitCost", label: "Quoted Unit Cost", type: "number", required: true },
      { key: "currency", label: "Currency" },
      { key: "validityDate", label: "Validity Date", type: "date" },
    ],
  },
  tenders: {
    label: "Tender Register", table: "tenders", softDelete: true,
    fields: [
      { key: "tenderNo", label: "Tender No.", unique: true },
      { key: "bidTitle", label: "Bid Title", required: true },
      { key: "client", label: "Client" },
      { key: "status", label: "Status" },
    ],
  },
  clients: {
    label: "Client Register", table: "clients", softDelete: true,
    fields: [
      { key: "company", label: "Company", required: true, unique: true },
      { key: "contactPerson", label: "Contact Person" },
      { key: "email", label: "Email" },
      { key: "telephone", label: "Telephone" },
      { key: "tin", label: "TIN" },
      { key: "paymentTerms", label: "Payment Terms" },
    ],
  },
};

function entityOr404(req, res) {
  const e = ENTITIES[req.params.entity];
  if (!e) { res.status(400).json({ error: `Unknown entity: ${req.params.entity}` }); return null; }
  return e;
}

// List importable entities + their field schema (drives templates + mapping).
router.get("/entities", (req, res) => {
  res.json(Object.entries(ENTITIES).map(([key, e]) => ({
    key, label: e.label,
    fields: e.fields.map((f) => ({ key: f.key, label: f.label, required: !!f.required, type: f.type || "text", unique: !!f.unique, ref: f.ref ? f.ref.table : null })),
  })));
});

// Downloadable template: header row + one example row.
router.get("/template/:entity", (req, res) => {
  const e = entityOr404(req, res);
  if (!e) return;
  const header = {};
  const example = {};
  for (const f of e.fields) {
    header[f.label] = f.label;
    example[f.label] = f.type === "number" ? 0 : f.type === "date" ? "2026-12-31" : (f.required ? `<${f.label}>` : "");
  }
  const ws = XLSX.utils.json_to_sheet([example], { header: e.fields.map((f) => f.label) });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, e.label.slice(0, 28));
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.set("Content-Disposition", `attachment; filename="${req.params.entity}-template.xlsx"`);
  res.set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
});

// Map a raw row (keyed by either field label or field key) to field keys.
function normalizeRow(entity, raw, mapping) {
  const out = {};
  for (const f of entity.fields) {
    // mapping: { fieldKey: sourceHeader }. Default maps by label or key.
    const source = mapping?.[f.key] ?? f.label;
    let v = raw[source];
    if (v === undefined) v = raw[f.key]; // fall back to key-named column
    out[f.key] = v;
  }
  return out;
}

function validateValue(f, value) {
  if (value === undefined || value === null || value === "") {
    if (f.required) return { problem: `${f.label} is required`, suggestedFix: `Provide a value for ${f.label}` };
    return null;
  }
  if (f.type === "number" && Number.isNaN(Number(value)))
    return { problem: `${f.label} must be a number (got “${value}”)`, suggestedFix: "Enter a numeric value" };
  if (f.type === "date") {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return { problem: `${f.label} is not a valid date (got “${value}”)`, suggestedFix: "Use YYYY-MM-DD" };
  }
  if (f.ref) {
    const exists = db.prepare(`SELECT 1 FROM ${f.ref.table} WHERE ${f.ref.column} = ?`).get(Number(value));
    if (!exists) return { problem: `${f.label} references a missing ${f.ref.table} (${value})`, suggestedFix: `Use an existing ${f.ref.table} id` };
  }
  return null;
}

// Validate + duplicate-detect a batch of rows. Pure read — no writes.
function analyzeRows(entity, rows, mapping) {
  const uniqueFields = entity.fields.filter((f) => f.unique);
  const seen = {}; // per unique field: Set of values seen earlier in the file
  uniqueFields.forEach((f) => { seen[f.key] = new Set(); });

  return rows.map((raw, i) => {
    const data = normalizeRow(entity, raw, mapping);
    const problems = [];
    for (const f of entity.fields) {
      const p = validateValue(f, data[f.key]);
      if (p) problems.push({ column: f.label, ...p });
    }

    // Duplicate detection: against DB and earlier rows in the file.
    let duplicateId = null;
    for (const f of uniqueFields) {
      const val = data[f.key];
      if (val === undefined || val === null || val === "") continue;
      if (seen[f.key].has(String(val))) problems.push({ column: f.label, problem: `Duplicate ${f.label} within the file`, suggestedFix: "Remove or rename the duplicate" });
      seen[f.key].add(String(val));
      const whereDeleted = entity.softDelete ? " AND deletedAt IS NULL" : "";
      const existing = db.prepare(`SELECT id FROM ${entity.table} WHERE ${f.key} = ?${whereDeleted}`).get(val);
      if (existing) duplicateId = existing.id;
    }

    const status = problems.length ? "error" : duplicateId ? "duplicate" : "ok";
    return { rowIndex: i + 1, data, problems, duplicateId, status };
  });
}

router.post("/import/:entity/preview", (req, res) => {
  const entity = entityOr404(req, res);
  if (!entity) return;
  const { rows, mapping } = req.body;
  if (!Array.isArray(rows)) return res.status(400).json({ error: "rows[] is required" });
  const analyzed = analyzeRows(entity, rows, mapping);
  const summary = {
    total: analyzed.length,
    ok: analyzed.filter((r) => r.status === "ok").length,
    duplicates: analyzed.filter((r) => r.status === "duplicate").length,
    errors: analyzed.filter((r) => r.status === "error").length,
  };
  res.json({ entity: req.params.entity, fields: entity.fields.map((f) => ({ key: f.key, label: f.label })), summary, rows: analyzed.slice(0, 1000), rowCountReturned: Math.min(analyzed.length, 1000) });
});

// Commit rows with an import option. Errors are always skipped.
router.post("/import/:entity/commit", (req, res) => {
  const entity = entityOr404(req, res);
  if (!entity) return;
  const { rows, mapping, option = "append" } = req.body;
  if (!Array.isArray(rows)) return res.status(400).json({ error: "rows[] is required" });

  const analyzed = analyzeRows(entity, rows, mapping);
  let inserted = 0, updated = 0, skipped = 0, errors = 0;

  db.exec("BEGIN");
  try {
    if (option === "replace" && entity.softDelete) {
      db.exec(`UPDATE ${entity.table} SET deletedAt = datetime('now') WHERE deletedAt IS NULL`);
    }
    for (const r of analyzed) {
      if (r.status === "error") { errors++; continue; }
      if (r.status === "duplicate") {
        if (option === "ignoreDuplicates") { skipped++; continue; }
        if (option === "updateExisting" && r.duplicateId) {
          const cols = entity.fields.filter((f) => r.data[f.key] !== undefined && r.data[f.key] !== "");
          if (cols.length) {
            db.prepare(`UPDATE ${entity.table} SET ${cols.map((f) => `${f.key} = ?`).join(", ")} WHERE id = ?`)
              .run(...cols.map((f) => coerce(f, r.data[f.key])), r.duplicateId);
            updated++;
          } else skipped++;
          continue;
        }
        // append / replace fall through to insert a new row
      }
      const cols = entity.fields.filter((f) => r.data[f.key] !== undefined && r.data[f.key] !== "");
      if (!cols.length) { skipped++; continue; }
      db.prepare(`INSERT INTO ${entity.table} (${cols.map((f) => f.key).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`)
        .run(...cols.map((f) => coerce(f, r.data[f.key])));
      inserted++;
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    return res.status(500).json({ error: e.message });
  }
  res.json({ inserted, updated, skipped, errors });
});

function coerce(f, v) {
  if (f.type === "number") return Number(v) || 0;
  return v;
}

// Excel error report: Row / Column / Problem / Suggested Fix.
router.post("/error-report/:entity", (req, res) => {
  const entity = entityOr404(req, res);
  if (!entity) return;
  const { rows, mapping } = req.body;
  const analyzed = analyzeRows(entity, rows || [], mapping);
  const errorRows = [];
  for (const r of analyzed) {
    for (const p of r.problems) errorRows.push({ Row: r.rowIndex, Column: p.column, Problem: p.problem, "Suggested Fix": p.suggestedFix });
  }
  const ws = XLSX.utils.json_to_sheet(errorRows.length ? errorRows : [{ Row: "", Column: "", Problem: "No errors", "Suggested Fix": "" }]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Errors");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.set("Content-Disposition", `attachment; filename="${req.params.entity}-errors.xlsx"`);
  res.set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
});

// ── Exports ─────────────────────────────────────────────────────────────────

const EXPORTS = [
  "boq", "detailed-estimate", "cost-breakdown", "material-summary", "labor-summary",
  "equipment-summary", "assembly-summary", "upa", "general-requirements",
  "procurement-packages", "supplier-comparison", "tender-register", "project-summary",
];
router.get("/exports", (req, res) => res.json(EXPORTS));

// Multi-sheet "Summary Workbook" for a project — reuses reportService builders.
router.get("/export/summary-workbook", (req, res) => {
  const projectId = Number(req.query.projectId);
  if (!projectId) return res.status(400).json({ error: "projectId is required" });
  const wb = XLSX.utils.book_new();
  const addSheet = (name, rows) => {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: "No data" }]);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 28));
  };

  addSheet("BOQ", boqToRows(buildBOQ(projectId, { groupBy: "wbs" })));
  addSheet("Cost Breakdown", costBreakdownRows(buildCostBreakdown(projectId)));
  for (const t of ["material", "labor", "equipment"]) {
    const s = buildResourceSummary(projectId, t);
    addSheet(`${s.label} Summary`, s.rows.map((r) => ({ Code: r.code, Description: r.description, Unit: r.unit, Quantity: r.quantity, Amount: r.amount })));
  }
  const asm = buildAssemblySummary(projectId);
  addSheet("Assembly Summary", asm.rows.map((r) => ({ Code: r.code, Description: r.description, Amount: r.amount })));
  const pcs = buildProjectCostSummary(projectId);
  addSheet("Project Summary", costBreakdownRows({ waterfall: pcs.waterfall }));

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.set("Content-Disposition", `attachment; filename="project-${projectId}-summary.xlsx"`);
  res.set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
});

function costBreakdownRows(data) {
  const w = data.waterfall;
  return [
    { Item: "Direct Cost", Amount: w.directCost },
    ...w.indirectLines.map((l) => ({ Item: `+ ${l.name}`, Amount: l.amount })),
    { Item: "Subtotal", Amount: w.subtotal },
    ...w.vatLines.map((l) => ({ Item: `+ ${l.name}`, Amount: l.amount })),
    { Item: "Bid Price", Amount: w.bidPrice },
    ...w.discountLines.map((l) => ({ Item: `- ${l.name}`, Amount: l.amount })),
    { Item: "Final Tender Price", Amount: w.finalTenderPrice },
  ];
}

export default router;
