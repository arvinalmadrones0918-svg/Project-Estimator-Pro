import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// DB_PATH lets tests point at an isolated, throwaway database.
export const dbPath = process.env.DB_PATH || path.join(__dirname, "..", "data.db");

export const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
  -- Future multi-user support: every project/module can be attributed to a user.
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'estimator',
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    projectNumber TEXT,
    client TEXT,
    owner TEXT,
    consultant TEXT,
    location TEXT,
    estimator TEXT,
    revision TEXT,
    date TEXT,
    currency TEXT NOT NULL DEFAULT 'USD',
    createdByUserId INTEGER REFERENCES users(id),
    deletedAt TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Work Breakdown Structure. "code" holds a CSI-style cost code (e.g. 23 00 00)
  -- so estimates can be sorted/exported the way professional estimators expect.
  CREATE TABLE IF NOT EXISTS wbs_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    code TEXT,
    sortOrder INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS wbs_subcategories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wbsCategoryId INTEGER NOT NULL REFERENCES wbs_categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT,
    sortOrder INTEGER NOT NULL DEFAULT 0,
    UNIQUE (wbsCategoryId, name)
  );

  -- Master/reference catalogs. Rows are never hard-deleted once referenced by a
  -- line item: isActive=0 (deactivated) keeps history intact and prevents
  -- historical estimates from losing their catalog reference.
  CREATE TABLE IF NOT EXISTS materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    unit TEXT NOT NULL,
    unitPrice REAL NOT NULL,
    isActive INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS labor_specializations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT,
    name TEXT NOT NULL,
    hourlyRate REAL NOT NULL,
    isActive INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS equipment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    unit TEXT NOT NULL,
    unitPrice REAL NOT NULL,
    isActive INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS work_modules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    projectId INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    wbsCategoryId INTEGER REFERENCES wbs_categories(id),
    wbsSubcategoryId INTEGER REFERENCES wbs_subcategories(id),
    sortOrder INTEGER NOT NULL DEFAULT 0,
    createdByUserId INTEGER REFERENCES users(id),
    deletedAt TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Line items store a price/rate snapshot taken at the time they were added
  -- (unitPriceAtEntry / hourlyRateAtEntry) in addition to the catalog FK.
  -- This is the standard professional-estimating pattern: an estimate's cost
  -- must stay frozen even if the master catalog price changes afterward.
  CREATE TABLE IF NOT EXISTS module_materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workModuleId INTEGER NOT NULL REFERENCES work_modules(id) ON DELETE CASCADE,
    materialId INTEGER NOT NULL REFERENCES materials(id),
    quantity REAL NOT NULL,
    unitPriceAtEntry REAL NOT NULL DEFAULT 0,
    notes TEXT,
    sortOrder INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS module_labor (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workModuleId INTEGER NOT NULL REFERENCES work_modules(id) ON DELETE CASCADE,
    specializationId INTEGER NOT NULL REFERENCES labor_specializations(id),
    quantity REAL NOT NULL,
    hourlyRateAtEntry REAL NOT NULL DEFAULT 0,
    notes TEXT,
    sortOrder INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS module_equipment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workModuleId INTEGER NOT NULL REFERENCES work_modules(id) ON DELETE CASCADE,
    equipmentId INTEGER NOT NULL REFERENCES equipment(id),
    quantity REAL NOT NULL,
    unitPriceAtEntry REAL NOT NULL DEFAULT 0,
    notes TEXT,
    sortOrder INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS module_subcontract (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workModuleId INTEGER NOT NULL REFERENCES work_modules(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    cost REAL NOT NULL,
    notes TEXT,
    sortOrder INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS module_other_costs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workModuleId INTEGER NOT NULL REFERENCES work_modules(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    cost REAL NOT NULL,
    notes TEXT,
    sortOrder INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Cost assemblies: reusable bundles of materials/labor/equipment/
  -- subcontract/other-cost items (e.g. "Install 1 AHU") that can be dropped
  -- into a work module as a single priced line item. "version" lets an
  -- assembly be revised without breaking modules that already reference an
  -- older version's frozen cost (see module_assemblies.unitCostAtEntry).
  CREATE TABLE IF NOT EXISTS assemblies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT,
    name TEXT NOT NULL,
    description TEXT,
    unit TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    isActive INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- A child item of an assembly. itemType selects which catalog FK / direct
  -- cost fields apply, mirroring the module_* line-item tables exactly:
  -- material/labor/equipment reference a catalog row + quantity + a price
  -- snapshot; subcontract/other store a direct description + cost.
  CREATE TABLE IF NOT EXISTS assembly_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assemblyId INTEGER NOT NULL REFERENCES assemblies(id) ON DELETE CASCADE,
    itemType TEXT NOT NULL CHECK (itemType IN ('material', 'labor', 'equipment', 'subcontract', 'other')),
    materialId INTEGER REFERENCES materials(id),
    specializationId INTEGER REFERENCES labor_specializations(id),
    equipmentId INTEGER REFERENCES equipment(id),
    description TEXT,
    quantity REAL,
    unitPriceAtEntry REAL,
    hourlyRateAtEntry REAL,
    cost REAL,
    notes TEXT,
    sortOrder INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- A work module's reference to a cost assembly, the assembly-line
  -- counterpart to module_materials/module_labor/etc. Like every other line
  -- item, the assembly's per-unit cost is snapshotted at entry time so the
  -- module's total doesn't shift if the assembly is revised later.
  CREATE TABLE IF NOT EXISTS module_assemblies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workModuleId INTEGER NOT NULL REFERENCES work_modules(id) ON DELETE CASCADE,
    assemblyId INTEGER NOT NULL REFERENCES assemblies(id),
    quantity REAL NOT NULL,
    unitCostAtEntry REAL NOT NULL DEFAULT 0,
    notes TEXT,
    sortOrder INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_wbs_subcategories_wbsCategoryId ON wbs_subcategories(wbsCategoryId);
  CREATE INDEX IF NOT EXISTS idx_assemblies_isActive ON assemblies(isActive);
  CREATE INDEX IF NOT EXISTS idx_assembly_items_assemblyId ON assembly_items(assemblyId);
  CREATE INDEX IF NOT EXISTS idx_assembly_items_materialId ON assembly_items(materialId);
  CREATE INDEX IF NOT EXISTS idx_assembly_items_specializationId ON assembly_items(specializationId);
  CREATE INDEX IF NOT EXISTS idx_assembly_items_equipmentId ON assembly_items(equipmentId);
  CREATE INDEX IF NOT EXISTS idx_module_assemblies_workModuleId ON module_assemblies(workModuleId);
  CREATE INDEX IF NOT EXISTS idx_module_assemblies_assemblyId ON module_assemblies(assemblyId);
`);

function ensureColumn(table, column, ddl) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

// SQLite forbids non-constant defaults (e.g. datetime('now')) in ALTER TABLE
// ADD COLUMN, so timestamp columns are added as plain nullable TEXT and
// backfilled here for any pre-existing rows.
function ensureTimestampColumns(table) {
  ensureColumn(table, "createdAt", "createdAt TEXT");
  ensureColumn(table, "updatedAt", "updatedAt TEXT");
  db.exec(`UPDATE ${table} SET createdAt = datetime('now') WHERE createdAt IS NULL`);
  db.exec(`UPDATE ${table} SET updatedAt = datetime('now') WHERE updatedAt IS NULL`);
}

// --- Non-destructive migrations for databases created before this schema revision ---

// Phase 0 -> Phase 1: link work_modules to projects/WBS.
ensureColumn("work_modules", "projectId", "projectId INTEGER REFERENCES projects(id)");
ensureColumn("work_modules", "wbsCategoryId", "wbsCategoryId INTEGER REFERENCES wbs_categories(id)");
ensureColumn("work_modules", "wbsSubcategoryId", "wbsSubcategoryId INTEGER REFERENCES wbs_subcategories(id)");

// Phase 1 revision: scale, audit, multi-user, and price-snapshot columns.
ensureColumn("projects", "createdByUserId", "createdByUserId INTEGER REFERENCES users(id)");
ensureColumn("projects", "deletedAt", "deletedAt TEXT");
// "status" is independent from deletedAt: deletedAt is a soft-delete (hidden
// everywhere), while status lets a project be archived (read-only, but still
// listed/searchable) without being deleted.
ensureColumn("projects", "status", "status TEXT NOT NULL DEFAULT 'active'");

ensureColumn("wbs_categories", "code", "code TEXT");
ensureColumn("wbs_subcategories", "code", "code TEXT");

ensureColumn("materials", "code", "code TEXT");
ensureColumn("materials", "isActive", "isActive INTEGER NOT NULL DEFAULT 1");
ensureTimestampColumns("materials");

ensureColumn("labor_specializations", "code", "code TEXT");
ensureColumn("labor_specializations", "isActive", "isActive INTEGER NOT NULL DEFAULT 1");
ensureTimestampColumns("labor_specializations");

ensureColumn("equipment", "code", "code TEXT");
ensureColumn("equipment", "isActive", "isActive INTEGER NOT NULL DEFAULT 1");
ensureTimestampColumns("equipment");

ensureColumn("work_modules", "sortOrder", "sortOrder INTEGER NOT NULL DEFAULT 0");
ensureColumn("work_modules", "createdByUserId", "createdByUserId INTEGER REFERENCES users(id)");
ensureColumn("work_modules", "deletedAt", "deletedAt TEXT");
ensureTimestampColumns("work_modules");

for (const [table, fkColumn, rateColumn, sourceTable, sourceRateColumn] of [
  ["module_materials", "materialId", "unitPriceAtEntry", "materials", "unitPrice"],
  ["module_labor", "specializationId", "hourlyRateAtEntry", "labor_specializations", "hourlyRate"],
  ["module_equipment", "equipmentId", "unitPriceAtEntry", "equipment", "unitPrice"],
]) {
  ensureColumn(table, rateColumn, `${rateColumn} REAL NOT NULL DEFAULT 0`);
  ensureColumn(table, "notes", "notes TEXT");
  ensureColumn(table, "sortOrder", "sortOrder INTEGER NOT NULL DEFAULT 0");
  ensureTimestampColumns(table);
  // Backfill the snapshot for rows created before this column existed, so
  // existing line items keep showing a correct cost instead of $0.
  db.exec(`
    UPDATE ${table}
    SET ${rateColumn} = (SELECT ${sourceRateColumn} FROM ${sourceTable} WHERE ${sourceTable}.id = ${table}.${fkColumn})
    WHERE ${rateColumn} = 0
  `);
}

for (const table of ["module_subcontract", "module_other_costs"]) {
  ensureColumn(table, "notes", "notes TEXT");
  ensureColumn(table, "sortOrder", "sortOrder INTEGER NOT NULL DEFAULT 0");
  ensureTimestampColumns(table);
}

// Phase 3: Extended catalog fields — added non-destructively so existing data survives.
// labor_specializations needs category added (materials/equipment already have it in the CREATE TABLE).
ensureColumn("labor_specializations", "category", "category TEXT NOT NULL DEFAULT 'General'");

const catalogTables = ["materials", "labor_specializations", "equipment"];
for (const t of catalogTables) {
  ensureColumn(t, "description", "description TEXT");
  ensureColumn(t, "subcategory", "subcategory TEXT");
  ensureColumn(t, "manufacturer", "manufacturer TEXT");
  ensureColumn(t, "brand", "brand TEXT");
  ensureColumn(t, "supplier", "supplier TEXT");
  ensureColumn(t, "currency", "currency TEXT NOT NULL DEFAULT 'USD'");
  ensureColumn(t, "remarks", "remarks TEXT");
  ensureColumn(t, "deletedAt", "deletedAt TEXT");
  ensureColumn(t, "createdBy", "createdBy TEXT");
}

// Phase 3: Two new master-catalog tables (no prior equivalent).
db.exec(`
  CREATE TABLE IF NOT EXISTS subcontract_catalog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'General',
    subcategory TEXT,
    manufacturer TEXT,
    brand TEXT,
    supplier TEXT,
    unit TEXT,
    unitPrice REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    remarks TEXT,
    isActive INTEGER NOT NULL DEFAULT 1,
    deletedAt TEXT,
    createdBy TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS other_costs_catalog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'General',
    subcategory TEXT,
    manufacturer TEXT,
    brand TEXT,
    supplier TEXT,
    unit TEXT,
    unitPrice REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    remarks TEXT,
    isActive INTEGER NOT NULL DEFAULT 1,
    deletedAt TEXT,
    createdBy TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Append-only audit log of price changes for any catalog item.
  -- catalogType discriminates which table the catalogId refers to.
  CREATE TABLE IF NOT EXISTS catalog_price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    catalogType TEXT NOT NULL,
    catalogId INTEGER NOT NULL,
    oldPrice REAL,
    newPrice REAL NOT NULL,
    effectiveDate TEXT NOT NULL DEFAULT (date('now')),
    supplier TEXT,
    updatedBy TEXT,
    notes TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Phase 4: markup % and status on every line item table
const lineItemTables4 = [
  "module_materials", "module_labor", "module_equipment",
  "module_subcontract", "module_other_costs", "module_assemblies",
];
for (const t of lineItemTables4) {
  ensureColumn(t, "markup", "markup REAL NOT NULL DEFAULT 0");
  ensureColumn(t, "status", "status TEXT NOT NULL DEFAULT 'included'");
}
// Freeform code/category/supplier on subcontract and other-cost lines
for (const t of ["module_subcontract", "module_other_costs"]) {
  ensureColumn(t, "code", "code TEXT");
  ensureColumn(t, "category", "category TEXT");
  ensureColumn(t, "supplier", "supplier TEXT");
  ensureColumn(t, "unit", "unit TEXT");
}

// Phase 5: nested assemblies — an assembly_item can reference a child assembly.
// (CHECK constraint on itemType can't be altered in SQLite, but it only
// restricts the original set; new rows use childAssemblyId with itemType
// 'assembly', which the engine recognises regardless of the old CHECK.)
ensureColumn("assembly_items", "childAssemblyId", "childAssemblyId INTEGER REFERENCES assemblies(id)");

// The original assembly_items CHECK forbids itemType='assembly'. SQLite can't
// drop a CHECK in place, so rebuild the table without it (only when the old
// CHECK is still present) — copying every existing row verbatim first.
{
  const tableSql = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='assembly_items'")
    .get()?.sql ?? "";
  if (tableSql.includes("CHECK") && tableSql.includes("itemType IN")) {
    db.exec("PRAGMA foreign_keys = OFF;");
    db.exec("BEGIN");
    try {
      db.exec(`
        CREATE TABLE assembly_items_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          assemblyId INTEGER NOT NULL REFERENCES assemblies(id) ON DELETE CASCADE,
          itemType TEXT NOT NULL,
          materialId INTEGER REFERENCES materials(id),
          specializationId INTEGER REFERENCES labor_specializations(id),
          equipmentId INTEGER REFERENCES equipment(id),
          childAssemblyId INTEGER REFERENCES assemblies(id),
          description TEXT,
          quantity REAL,
          unitPriceAtEntry REAL,
          hourlyRateAtEntry REAL,
          cost REAL,
          notes TEXT,
          sortOrder INTEGER NOT NULL DEFAULT 0,
          createdAt TEXT NOT NULL DEFAULT (datetime('now')),
          updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO assembly_items_new
          (id, assemblyId, itemType, materialId, specializationId, equipmentId, childAssemblyId,
           description, quantity, unitPriceAtEntry, hourlyRateAtEntry, cost, notes, sortOrder, createdAt, updatedAt)
        SELECT id, assemblyId, itemType, materialId, specializationId, equipmentId, childAssemblyId,
               description, quantity, unitPriceAtEntry, hourlyRateAtEntry, cost, notes, sortOrder, createdAt, updatedAt
        FROM assembly_items;
        DROP TABLE assembly_items;
        ALTER TABLE assembly_items_new RENAME TO assembly_items;
        CREATE INDEX IF NOT EXISTS idx_assembly_items_assemblyId ON assembly_items(assemblyId);
        CREATE INDEX IF NOT EXISTS idx_assembly_items_materialId ON assembly_items(materialId);
        CREATE INDEX IF NOT EXISTS idx_assembly_items_specializationId ON assembly_items(specializationId);
        CREATE INDEX IF NOT EXISTS idx_assembly_items_equipmentId ON assembly_items(equipmentId);
        CREATE INDEX IF NOT EXISTS idx_assembly_items_childAssemblyId ON assembly_items(childAssemblyId);
      `);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    db.exec("PRAGMA foreign_keys = ON;");
  }
}

// Phase 5: Calculation engine — scenarios, indirect costs, revisions, audit.
db.exec(`
  -- An estimate scenario is an independent costing view of a project
  -- (Budget / Tender / Revised / Value-Engineering). Each holds its own
  -- indirect-cost configuration and produces independent totals. The line
  -- items themselves live on the project's work modules and are shared; a
  -- scenario layers its own indirect costs and (optionally) a frozen revision
  -- snapshot on top.
  CREATE TABLE IF NOT EXISTS estimate_scenarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projectId INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'tender',
    description TEXT,
    isActive INTEGER NOT NULL DEFAULT 1,
    isPrimary INTEGER NOT NULL DEFAULT 0,
    deletedAt TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Configurable indirect-cost line. "kind" places it in the waterfall:
  --   indirect  -> added to direct cost to form the subtotal
  --   vat       -> added to subtotal to form the bid price
  --   discount  -> subtracted from bid price to form the final tender price
  --   retention -> memo deduction shown against the final tender price
  -- "method" is percentage|fixed; "appliesTo" is project|module (a fixed
  -- per-module amount is multiplied by the module count).
  CREATE TABLE IF NOT EXISTS indirect_cost_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projectId INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    scenarioId INTEGER REFERENCES estimate_scenarios(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'indirect',
    method TEXT NOT NULL DEFAULT 'percentage',
    value REAL NOT NULL DEFAULT 0,
    appliesTo TEXT NOT NULL DEFAULT 'project',
    enabled INTEGER NOT NULL DEFAULT 1,
    sortOrder INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- A frozen snapshot of a scenario at a point in time. Revision 0 is the
  -- baseline; each subsequent revision preserves the full line-item/price/
  -- quantity/assembly state and the calculated totals as JSON so historical
  -- estimates can always be reproduced exactly.
  CREATE TABLE IF NOT EXISTS estimate_revisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projectId INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    scenarioId INTEGER REFERENCES estimate_scenarios(id) ON DELETE CASCADE,
    revisionNumber INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    snapshot TEXT NOT NULL,
    totals TEXT NOT NULL,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Append-only audit of every project-level calculation: the engine version,
  -- the formula applied, a summary of the source data, and the resulting
  -- totals, each stamped with a timestamp.
  CREATE TABLE IF NOT EXISTS calculation_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projectId INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    scenarioId INTEGER REFERENCES estimate_scenarios(id) ON DELETE CASCADE,
    calcVersion TEXT NOT NULL,
    formula TEXT NOT NULL,
    sourceData TEXT NOT NULL,
    totals TEXT NOT NULL,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Phase 6: Procurement & supplier quotation management.
db.exec(`
  -- Master supplier directory. Soft-deleted (deletedAt) and de-activatable
  -- (status) like the other catalogs so historical quotations keep their
  -- supplier reference.
  CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT,
    companyName TEXT NOT NULL,
    address TEXT,
    contactPerson TEXT,
    email TEXT,
    telephone TEXT,
    mobile TEXT,
    website TEXT,
    tin TEXT,
    vatRegistered INTEGER NOT NULL DEFAULT 0,
    tradeCategory TEXT,
    rating REAL NOT NULL DEFAULT 0,
    remarks TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    deletedAt TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- A supplier's quotation for a material. A material may have many. Exactly
  -- one can be flagged isSelected (the supplier the estimator picked); the
  -- selection also stamps the material's preferredQuotationId for fast lookup.
  CREATE TABLE IF NOT EXISTS material_quotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    materialId INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    supplierId INTEGER NOT NULL REFERENCES suppliers(id),
    quotedUnitCost REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    validityDate TEXT,
    leadTime TEXT,
    deliveryTerms TEXT,
    paymentTerms TEXT,
    quotationReference TEXT,
    remarks TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    isSelected INTEGER NOT NULL DEFAULT 0,
    selectionMethod TEXT,
    deletedAt TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Append-only audit of supplier/quotation selection changes for a material:
  -- who changed it, the previous and current supplier+quotation, and when.
  CREATE TABLE IF NOT EXISTS quotation_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    materialId INTEGER NOT NULL REFERENCES materials(id),
    action TEXT NOT NULL,
    previousSupplierId INTEGER,
    previousQuotationId INTEGER,
    previousUnitCost REAL,
    newSupplierId INTEGER,
    newQuotationId INTEGER,
    newUnitCost REAL,
    selectionMethod TEXT,
    changedBy TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Per-material selection pointer (which quotation is the chosen one).
ensureColumn("materials", "selectedQuotationId", "selectedQuotationId INTEGER REFERENCES material_quotations(id)");

// Cost Assemblies: category (for the library grouping) and a favorite flag.
ensureColumn("assemblies", "category", "category TEXT");
ensureColumn("assemblies", "isFavorite", "isFavorite INTEGER NOT NULL DEFAULT 0");

// Phase 7: Rate Analysis / Unit Price Analysis (UPA) engine.
db.exec(`
  -- A reusable Unit Price Analysis: a recipe of resources that produces a
  -- unit rate for one unit of work (e.g. "1 m³ of reinforced concrete").
  -- Regional factors adjust the computed direct cost into the final unit rate.
  CREATE TABLE IF NOT EXISTS unit_price_analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT,
    description TEXT NOT NULL,
    trade TEXT,
    category TEXT,
    subcategory TEXT,
    unit TEXT NOT NULL DEFAULT 'unit',
    revision INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'active',
    remarks TEXT,
    -- Regional factors: multipliers default 1, additive per-unit amounts default 0.
    locationAdjustment REAL NOT NULL DEFAULT 1,
    regionalMultiplier REAL NOT NULL DEFAULT 1,
    transportation REAL NOT NULL DEFAULT 0,
    mobilization REAL NOT NULL DEFAULT 0,
    deletedAt TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- A resource line within a UPA. resourceType selects which catalog FK
  -- applies (material/labor/equipment) or it's a direct subcontract/other.
  -- frozenCost is the price snapshot stored on the UPA; the catalog's live
  -- price is read separately as "current cost" for drift display.
  CREATE TABLE IF NOT EXISTS upa_resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    upaId INTEGER NOT NULL REFERENCES unit_price_analyses(id) ON DELETE CASCADE,
    resourceType TEXT NOT NULL,
    materialId INTEGER REFERENCES materials(id),
    specializationId INTEGER REFERENCES labor_specializations(id),
    equipmentId INTEGER REFERENCES equipment(id),
    description TEXT,
    quantity REAL NOT NULL DEFAULT 0,
    unit TEXT,
    wastePct REAL NOT NULL DEFAULT 0,
    -- Labor productivity
    crew REAL,
    outputPerDay REAL,
    outputPerHour REAL,
    laborHours REAL,
    manhours REAL,
    -- Equipment productivity
    operatingHours REAL,
    idleFactor REAL NOT NULL DEFAULT 0,
    fuelConsumption REAL,
    operatorCost REAL,
    frozenCost REAL NOT NULL DEFAULT 0,
    notes TEXT,
    sortOrder INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Frozen historical snapshots of a UPA for version comparison.
  CREATE TABLE IF NOT EXISTS upa_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    upaId INTEGER NOT NULL REFERENCES unit_price_analyses(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    revision INTEGER NOT NULL,
    note TEXT,
    snapshot TEXT NOT NULL,
    totals TEXT NOT NULL,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- A work module's reference to a UPA. The full cost-type breakdown is frozen
  -- per unit at entry (the price-freeze rule), so future UPA/catalog edits
  -- never change this estimate.
  CREATE TABLE IF NOT EXISTS module_upa (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workModuleId INTEGER NOT NULL REFERENCES work_modules(id) ON DELETE CASCADE,
    upaId INTEGER NOT NULL REFERENCES unit_price_analyses(id),
    quantity REAL NOT NULL DEFAULT 1,
    unitRateAtEntry REAL NOT NULL DEFAULT 0,
    matCostAtEntry REAL NOT NULL DEFAULT 0,
    laborCostAtEntry REAL NOT NULL DEFAULT 0,
    equipCostAtEntry REAL NOT NULL DEFAULT 0,
    subCostAtEntry REAL NOT NULL DEFAULT 0,
    otherCostAtEntry REAL NOT NULL DEFAULT 0,
    notes TEXT,
    markup REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    sortOrder INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Assemblies may reference UPA records (itemType 'upa' carries childUpaId).
ensureColumn("assembly_items", "childUpaId", "childUpaId INTEGER REFERENCES unit_price_analyses(id)");

// Phase 8: BOQ & reporting engine — reusable templates + generation history.
db.exec(`
  -- A saved report configuration (type, grouping, filters, include/exclude,
  -- page layout) that can be re-run. config is JSON.
  CREATE TABLE IF NOT EXISTS report_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    reportType TEXT NOT NULL,
    config TEXT NOT NULL,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Audit of generated reports: which report, for which project/scenario/
  -- revision, by whom and when.
  CREATE TABLE IF NOT EXISTS report_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projectId INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    reportType TEXT NOT NULL,
    scenarioId INTEGER,
    revision INTEGER,
    generatedBy TEXT,
    config TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Phase 9: Tendering, bid management & document control.
db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company TEXT NOT NULL,
    owner TEXT,
    address TEXT,
    contactPerson TEXT,
    telephone TEXT,
    email TEXT,
    tin TEXT,
    taxType TEXT,
    paymentTerms TEXT,
    preferredContractor TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    deletedAt TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tenders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenderNo TEXT,
    projectId INTEGER REFERENCES projects(id),
    clientId INTEGER REFERENCES clients(id),
    client TEXT,
    bidTitle TEXT NOT NULL,
    bidDate TEXT,
    submissionDate TEXT,
    openingDate TEXT,
    engineer TEXT,
    estimator TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    currency TEXT NOT NULL DEFAULT 'USD',
    remarks TEXT,
    deletedAt TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Polymorphic document attachment. entityType/entityId point at a project,
  -- tender, estimate, assembly, material, supplier or UPA. Each document keeps
  -- a version history in document_versions.
  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entityType TEXT NOT NULL,
    entityId INTEGER NOT NULL,
    name TEXT NOT NULL,
    fileType TEXT,
    currentVersion INTEGER NOT NULL DEFAULT 1,
    description TEXT,
    deletedAt TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS document_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    documentId INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    fileName TEXT,
    fileType TEXT,
    fileSize INTEGER,
    url TEXT,
    note TEXT,
    uploadedBy TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS drawings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projectId INTEGER REFERENCES projects(id),
    drawingNumber TEXT NOT NULL,
    revision TEXT,
    discipline TEXT,
    title TEXT,
    issueDate TEXT,
    currentRevision TEXT,
    supersededRevisions TEXT,
    status TEXT NOT NULL DEFAULT 'current',
    deletedAt TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS specifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projectId INTEGER REFERENCES projects(id),
    division TEXT,
    section TEXT,
    description TEXT NOT NULL,
    revision TEXT,
    specDate TEXT,
    linkedBoqItems TEXT,
    deletedAt TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS addenda (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projectId INTEGER REFERENCES projects(id),
    addendumNumber TEXT NOT NULL,
    addendumDate TEXT,
    affectedItems TEXT,
    costImpact REAL NOT NULL DEFAULT 0,
    description TEXT,
    deletedAt TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS rfis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projectId INTEGER REFERENCES projects(id),
    requestNumber TEXT NOT NULL,
    question TEXT,
    answer TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    dateSent TEXT,
    dateClosed TEXT,
    linkedBoqItems TEXT,
    deletedAt TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Global change log: who changed what, old/new value and the reason.
  CREATE TABLE IF NOT EXISTS change_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entityType TEXT NOT NULL,
    entityId INTEGER,
    field TEXT,
    previousValue TEXT,
    newValue TEXT,
    reason TEXT,
    changedBy TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Phase 10: Professional General Requirements (GR) Builder — a dedicated
// module, separate from work_modules, with its own tables.
db.exec(`
  -- A General Requirements estimate (the GR counterpart of a project's set of
  -- work modules). Holds the project parameters that drive automatic
  -- duration/area/personnel-based calculations.
  CREATE TABLE IF NOT EXISTS gr_sheets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    projectId INTEGER REFERENCES projects(id),
    description TEXT,
    durationDays REAL NOT NULL DEFAULT 0,
    workingDays REAL NOT NULL DEFAULT 0,
    calendarMonths REAL NOT NULL DEFAULT 0,
    projectArea REAL NOT NULL DEFAULT 0,
    buildingCount REAL NOT NULL DEFAULT 1,
    floorCount REAL NOT NULL DEFAULT 1,
    projectValue REAL NOT NULL DEFAULT 0,
    personnelCount REAL NOT NULL DEFAULT 0,
    inflation REAL NOT NULL DEFAULT 0,
    escalation REAL NOT NULL DEFAULT 0,
    deletedAt TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- A GR line item. itemType selects an optional catalog/assembly/UPA
  -- reference; method selects the estimating method (lump sum, unit rate,
  -- %-of-direct/project/category, monthly/weekly/daily, rental, allowance,
  -- formula). frozenCost is the price snapshot for catalog references.
  CREATE TABLE IF NOT EXISTS gr_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sheetId INTEGER NOT NULL REFERENCES gr_sheets(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    itemType TEXT NOT NULL DEFAULT 'manual',
    materialId INTEGER REFERENCES materials(id),
    specializationId INTEGER REFERENCES labor_specializations(id),
    equipmentId INTEGER REFERENCES equipment(id),
    assemblyId INTEGER REFERENCES assemblies(id),
    upaId INTEGER REFERENCES unit_price_analyses(id),
    description TEXT NOT NULL,
    unit TEXT,
    method TEXT NOT NULL DEFAULT 'lumpSum',
    quantity REAL NOT NULL DEFAULT 1,
    rate REAL NOT NULL DEFAULT 0,
    value REAL NOT NULL DEFAULT 0,
    pct REAL NOT NULL DEFAULT 0,
    durationValue REAL,
    formula TEXT,
    frozenCost REAL NOT NULL DEFAULT 0,
    markup REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'included',
    notes TEXT,
    sortOrder INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Reusable GR templates (Commercial Building, Hospital, ...) and their items.
  CREATE TABLE IF NOT EXISTS gr_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    projectType TEXT,
    description TEXT,
    isBuiltIn INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS gr_template_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    templateId INTEGER NOT NULL REFERENCES gr_templates(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    unit TEXT,
    method TEXT NOT NULL DEFAULT 'lumpSum',
    quantity REAL NOT NULL DEFAULT 1,
    rate REAL NOT NULL DEFAULT 0,
    value REAL NOT NULL DEFAULT 0,
    pct REAL NOT NULL DEFAULT 0,
    formula TEXT,
    sortOrder INTEGER NOT NULL DEFAULT 0
  );

  -- Editable manpower templates used to populate the Project Staff category.
  CREATE TABLE IF NOT EXISTS gr_staff_library (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,
    monthlyRate REAL NOT NULL DEFAULT 0,
    notes TEXT,
    sortOrder INTEGER NOT NULL DEFAULT 0
  );
`);

// Phase 12: Multi-user, security & approval workflow (additive layer).
db.exec(`
  CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    permissions TEXT NOT NULL DEFAULT '{}',
    isBuiltIn INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    rememberMe INTEGER NOT NULL DEFAULT 0,
    expiresAt TEXT NOT NULL,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expiresAt TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Multi-level approval records for a project's estimate.
  CREATE TABLE IF NOT EXISTS approvals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projectId INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    level INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'pending',
    approverUserId INTEGER REFERENCES users(id),
    approverName TEXT,
    comment TEXT,
    actedAt TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Audit trail of user actions (login/logout/create/edit/delete/approve/...).
  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER REFERENCES users(id),
    userName TEXT,
    action TEXT NOT NULL,
    entityType TEXT,
    entityId INTEGER,
    detail TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- One active editor per project.
  CREATE TABLE IF NOT EXISTS project_locks (
    projectId INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    userId INTEGER NOT NULL REFERENCES users(id),
    userName TEXT,
    lockedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    link TEXT,
    isRead INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    projectId INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    UNIQUE (userId, projectId)
  );
`);

// Extend the existing users table (kept backward-compatible: name/role stay).
ensureColumn("users", "employeeId", "employeeId TEXT");
ensureColumn("users", "username", "username TEXT");
ensureColumn("users", "passwordHash", "passwordHash TEXT");
ensureColumn("users", "passwordSalt", "passwordSalt TEXT");
ensureColumn("users", "firstName", "firstName TEXT");
ensureColumn("users", "lastName", "lastName TEXT");
ensureColumn("users", "position", "position TEXT");
ensureColumn("users", "department", "department TEXT");
ensureColumn("users", "office", "office TEXT");
ensureColumn("users", "mobile", "mobile TEXT");
ensureColumn("users", "status", "status TEXT NOT NULL DEFAULT 'active'");
ensureColumn("users", "photo", "photo TEXT");
ensureColumn("users", "signature", "signature TEXT");
ensureColumn("users", "failedLogins", "failedLogins INTEGER NOT NULL DEFAULT 0");
ensureColumn("users", "lockedUntil", "lockedUntil TEXT");
ensureColumn("users", "lastLoginAt", "lastLoginAt TEXT");
ensureColumn("users", "roleId", "roleId INTEGER REFERENCES roles(id)");
ensureColumn("users", "company", "company TEXT");
ensureColumn("users", "designation", "designation TEXT");

// Phase 10 (Enterprise): richer audit trail — old/new value, IP and browser.
ensureColumn("activity_log", "oldValue", "oldValue TEXT");
ensureColumn("activity_log", "newValue", "newValue TEXT");
ensureColumn("activity_log", "ipAddress", "ipAddress TEXT");
ensureColumn("activity_log", "userAgent", "userAgent TEXT");
ensureColumn("activity_log", "category", "category TEXT NOT NULL DEFAULT 'general'");

// Refresh-token support for sessions (a long-lived companion to the access
// token; rotating it issues a fresh access token).
ensureColumn("sessions", "refreshToken", "refreshToken TEXT");
ensureColumn("sessions", "refreshExpiresAt", "refreshExpiresAt TEXT");

// Phase 10 (Enterprise): Organization — company profile, branches, departments,
// business units, currencies and tax settings.
db.exec(`
  CREATE TABLE IF NOT EXISTS company_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL DEFAULT 'My Company',
    legalName TEXT, registrationNo TEXT, taxId TEXT,
    address TEXT, city TEXT, country TEXT,
    phone TEXT, email TEXT, website TEXT, logo TEXT,
    baseCurrency TEXT NOT NULL DEFAULT 'USD',
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS org_branches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, code TEXT, address TEXT, city TEXT, country TEXT,
    phone TEXT, manager TEXT, isHeadOffice INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS org_departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, code TEXT, branchId INTEGER REFERENCES org_branches(id),
    head TEXT, status TEXT NOT NULL DEFAULT 'active',
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS org_business_units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, code TEXT, manager TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS org_currencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL, name TEXT, symbol TEXT,
    exchangeRate REAL NOT NULL DEFAULT 1,
    isBase INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active'
  );
  CREATE TABLE IF NOT EXISTS org_tax_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, taxType TEXT, ratePct REAL NOT NULL DEFAULT 0,
    isDefault INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active'
  );
  CREATE INDEX IF NOT EXISTS idx_activity_log_category ON activity_log(category);
`);

// Phase 11 (Production): application settings (key/value) and backup history.
db.exec(`
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS backup_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fileName TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'manual',
    sizeBytes INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    createdBy TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Seed default application settings once (system prefs, formats, units…).
{
  const DEFAULTS = {
    systemName: "Project Estimator Pro",
    companyLogo: "",
    baseCurrency: "USD",
    currencySymbol: "$",
    defaultTaxRate: 12,
    taxLabel: "VAT",
    units: "metric",
    dateFormat: "YYYY-MM-DD",
    numberFormat: "1,234.56",
    decimalPlaces: 2,
    autoBackup: false,
    autoBackupIntervalHours: 24,
    theme: "system",
  };
  const has = db.prepare("SELECT 1 FROM app_settings WHERE key = ?");
  const put = db.prepare("INSERT INTO app_settings (key, value) VALUES (?, ?)");
  for (const [k, v] of Object.entries(DEFAULTS)) if (!has.get(k)) put.run(k, JSON.stringify(v));
}

// Seed the singleton company profile + a base currency + default tax once.
if (!db.prepare("SELECT id FROM company_profile WHERE id = 1").get()) {
  db.prepare("INSERT INTO company_profile (id, name, baseCurrency) VALUES (1, 'Project Estimator Pro', 'USD')").run();
}
if (db.prepare("SELECT COUNT(*) AS c FROM org_currencies").get().c === 0) {
  const insC = db.prepare("INSERT INTO org_currencies (code, name, symbol, exchangeRate, isBase) VALUES (?, ?, ?, ?, ?)");
  insC.run("USD", "US Dollar", "$", 1, 1);
  insC.run("EUR", "Euro", "€", 0.92, 0);
  insC.run("PHP", "Philippine Peso", "₱", 56, 0);
}
if (db.prepare("SELECT COUNT(*) AS c FROM org_tax_settings").get().c === 0) {
  db.prepare("INSERT INTO org_tax_settings (name, taxType, ratePct, isDefault) VALUES ('Standard VAT', 'VAT', 12, 1)").run();
}

// Estimate workflow status, independent of the active/archived status column.
ensureColumn("projects", "workflowStatus", "workflowStatus TEXT NOT NULL DEFAULT 'draft'");
ensureColumn("projects", "approvalLevel", "approvalLevel INTEGER NOT NULL DEFAULT 0");

// Phase 13: Project cost control & financial management.
db.exec(`
  -- Official project budget snapshots created from an approved estimate.
  CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projectId INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'original',
    version INTEGER NOT NULL DEFAULT 1,
    amount REAL NOT NULL DEFAULT 0,
    snapshot TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    note TEXT,
    createdBy TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Budget transfers between WBS / trade / category / GR (approval required).
  CREATE TABLE IF NOT EXISTS budget_transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projectId INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    dimension TEXT NOT NULL DEFAULT 'wbs',
    fromKey TEXT NOT NULL,
    toKey TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    reason TEXT,
    requestedBy TEXT,
    approvedBy TEXT,
    actedAt TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS purchase_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    poNumber TEXT,
    projectId INTEGER REFERENCES projects(id),
    supplierId INTEGER REFERENCES suppliers(id),
    supplier TEXT,
    wbs TEXT,
    poDate TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    currency TEXT NOT NULL DEFAULT 'USD',
    deliveryDate TEXT,
    terms TEXT,
    remarks TEXT,
    amount REAL NOT NULL DEFAULT 0,
    deletedAt TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS subcontracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projectId INTEGER REFERENCES projects(id),
    supplierId INTEGER REFERENCES suppliers(id),
    packageName TEXT NOT NULL,
    contractAmount REAL NOT NULL DEFAULT 0,
    retentionPct REAL NOT NULL DEFAULT 0,
    advancePayment REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    remarks TEXT,
    deletedAt TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS variation_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projectId INTEGER REFERENCES projects(id),
    subcontractId INTEGER REFERENCES subcontracts(id),
    voNumber TEXT,
    voType TEXT NOT NULL DEFAULT 'client',
    nature TEXT NOT NULL DEFAULT 'additive',
    amount REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    description TEXT,
    deletedAt TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS progress_billings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projectId INTEGER REFERENCES projects(id),
    billingNo TEXT,
    billingDate TEXT,
    percentComplete REAL NOT NULL DEFAULT 0,
    grossAmount REAL NOT NULL DEFAULT 0,
    retentionPct REAL NOT NULL DEFAULT 0,
    vatPct REAL NOT NULL DEFAULT 0,
    previousBilling REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft',
    deletedAt TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS actual_costs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projectId INTEGER REFERENCES projects(id),
    category TEXT NOT NULL DEFAULT 'material',
    description TEXT,
    amount REAL NOT NULL DEFAULT 0,
    costDate TEXT,
    deletedAt TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Indexes on every foreign key and common filter column, created only after
// the columns above are guaranteed to exist. With line-item volumes in the
// 100k+ range, these are required for per-module and per-project rollup
// queries to stay fast.
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_projects_deletedAt ON projects(deletedAt);
  CREATE INDEX IF NOT EXISTS idx_materials_category ON materials(category);
  CREATE INDEX IF NOT EXISTS idx_materials_isActive ON materials(isActive);
  CREATE INDEX IF NOT EXISTS idx_materials_deletedAt ON materials(deletedAt);
  CREATE INDEX IF NOT EXISTS idx_materials_supplier ON materials(supplier);
  CREATE INDEX IF NOT EXISTS idx_labor_specializations_isActive ON labor_specializations(isActive);
  CREATE INDEX IF NOT EXISTS idx_labor_specializations_deletedAt ON labor_specializations(deletedAt);
  CREATE INDEX IF NOT EXISTS idx_equipment_category ON equipment(category);
  CREATE INDEX IF NOT EXISTS idx_equipment_isActive ON equipment(isActive);
  CREATE INDEX IF NOT EXISTS idx_equipment_deletedAt ON equipment(deletedAt);
  CREATE INDEX IF NOT EXISTS idx_subcontract_catalog_isActive ON subcontract_catalog(isActive);
  CREATE INDEX IF NOT EXISTS idx_subcontract_catalog_deletedAt ON subcontract_catalog(deletedAt);
  CREATE INDEX IF NOT EXISTS idx_other_costs_catalog_isActive ON other_costs_catalog(isActive);
  CREATE INDEX IF NOT EXISTS idx_other_costs_catalog_deletedAt ON other_costs_catalog(deletedAt);
  CREATE INDEX IF NOT EXISTS idx_price_history_catalog ON catalog_price_history(catalogType, catalogId);
  CREATE INDEX IF NOT EXISTS idx_work_modules_projectId ON work_modules(projectId);
  CREATE INDEX IF NOT EXISTS idx_work_modules_wbsCategoryId ON work_modules(wbsCategoryId);
  CREATE INDEX IF NOT EXISTS idx_work_modules_wbsSubcategoryId ON work_modules(wbsSubcategoryId);
  CREATE INDEX IF NOT EXISTS idx_work_modules_deletedAt ON work_modules(deletedAt);
  CREATE INDEX IF NOT EXISTS idx_module_materials_workModuleId ON module_materials(workModuleId);
  CREATE INDEX IF NOT EXISTS idx_module_materials_materialId ON module_materials(materialId);
  CREATE INDEX IF NOT EXISTS idx_module_labor_workModuleId ON module_labor(workModuleId);
  CREATE INDEX IF NOT EXISTS idx_module_labor_specializationId ON module_labor(specializationId);
  CREATE INDEX IF NOT EXISTS idx_module_equipment_workModuleId ON module_equipment(workModuleId);
  CREATE INDEX IF NOT EXISTS idx_module_equipment_equipmentId ON module_equipment(equipmentId);
  CREATE INDEX IF NOT EXISTS idx_module_subcontract_workModuleId ON module_subcontract(workModuleId);
  CREATE INDEX IF NOT EXISTS idx_module_other_costs_workModuleId ON module_other_costs(workModuleId);
  CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
  CREATE INDEX IF NOT EXISTS idx_scenarios_projectId ON estimate_scenarios(projectId);
  CREATE INDEX IF NOT EXISTS idx_indirect_projectId ON indirect_cost_items(projectId);
  CREATE INDEX IF NOT EXISTS idx_indirect_scenarioId ON indirect_cost_items(scenarioId);
  CREATE INDEX IF NOT EXISTS idx_revisions_projectId ON estimate_revisions(projectId);
  CREATE INDEX IF NOT EXISTS idx_revisions_scenarioId ON estimate_revisions(scenarioId);
  CREATE INDEX IF NOT EXISTS idx_audit_projectId ON calculation_audit(projectId);
  CREATE INDEX IF NOT EXISTS idx_suppliers_status ON suppliers(status);
  CREATE INDEX IF NOT EXISTS idx_suppliers_deletedAt ON suppliers(deletedAt);
  CREATE INDEX IF NOT EXISTS idx_suppliers_tradeCategory ON suppliers(tradeCategory);
  CREATE INDEX IF NOT EXISTS idx_quotations_materialId ON material_quotations(materialId);
  CREATE INDEX IF NOT EXISTS idx_quotations_supplierId ON material_quotations(supplierId);
  CREATE INDEX IF NOT EXISTS idx_quotations_isSelected ON material_quotations(isSelected);
  CREATE INDEX IF NOT EXISTS idx_quotations_deletedAt ON material_quotations(deletedAt);
  CREATE INDEX IF NOT EXISTS idx_quotation_audit_materialId ON quotation_audit(materialId);
  CREATE INDEX IF NOT EXISTS idx_upa_status ON unit_price_analyses(status);
  CREATE INDEX IF NOT EXISTS idx_upa_deletedAt ON unit_price_analyses(deletedAt);
  CREATE INDEX IF NOT EXISTS idx_upa_trade ON unit_price_analyses(trade);
  CREATE INDEX IF NOT EXISTS idx_upa_resources_upaId ON upa_resources(upaId);
  CREATE INDEX IF NOT EXISTS idx_upa_versions_upaId ON upa_versions(upaId);
  CREATE INDEX IF NOT EXISTS idx_module_upa_workModuleId ON module_upa(workModuleId);
  CREATE INDEX IF NOT EXISTS idx_module_upa_upaId ON module_upa(upaId);
  CREATE INDEX IF NOT EXISTS idx_assembly_items_childUpaId ON assembly_items(childUpaId);
  CREATE INDEX IF NOT EXISTS idx_report_history_projectId ON report_history(projectId);
  CREATE INDEX IF NOT EXISTS idx_report_templates_type ON report_templates(reportType);
  CREATE INDEX IF NOT EXISTS idx_clients_deletedAt ON clients(deletedAt);
  CREATE INDEX IF NOT EXISTS idx_tenders_projectId ON tenders(projectId);
  CREATE INDEX IF NOT EXISTS idx_tenders_deletedAt ON tenders(deletedAt);
  CREATE INDEX IF NOT EXISTS idx_documents_entity ON documents(entityType, entityId);
  CREATE INDEX IF NOT EXISTS idx_document_versions_documentId ON document_versions(documentId);
  CREATE INDEX IF NOT EXISTS idx_drawings_projectId ON drawings(projectId);
  CREATE INDEX IF NOT EXISTS idx_specifications_projectId ON specifications(projectId);
  CREATE INDEX IF NOT EXISTS idx_addenda_projectId ON addenda(projectId);
  CREATE INDEX IF NOT EXISTS idx_rfis_projectId ON rfis(projectId);
  CREATE INDEX IF NOT EXISTS idx_change_log_entity ON change_log(entityType, entityId);
  CREATE INDEX IF NOT EXISTS idx_gr_sheets_projectId ON gr_sheets(projectId);
  CREATE INDEX IF NOT EXISTS idx_gr_sheets_deletedAt ON gr_sheets(deletedAt);
  CREATE INDEX IF NOT EXISTS idx_gr_items_sheetId ON gr_items(sheetId);
  CREATE INDEX IF NOT EXISTS idx_gr_items_category ON gr_items(category);
  CREATE INDEX IF NOT EXISTS idx_gr_template_items_templateId ON gr_template_items(templateId);
  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
  CREATE INDEX IF NOT EXISTS idx_sessions_userId ON sessions(userId);
  CREATE INDEX IF NOT EXISTS idx_approvals_projectId ON approvals(projectId);
  CREATE INDEX IF NOT EXISTS idx_activity_log_userId ON activity_log(userId);
  CREATE INDEX IF NOT EXISTS idx_activity_log_action ON activity_log(action);
  CREATE INDEX IF NOT EXISTS idx_notifications_userId ON notifications(userId);
  CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  CREATE INDEX IF NOT EXISTS idx_budgets_projectId ON budgets(projectId);
  CREATE INDEX IF NOT EXISTS idx_budget_transfers_projectId ON budget_transfers(projectId);
  CREATE INDEX IF NOT EXISTS idx_purchase_orders_projectId ON purchase_orders(projectId);
  CREATE INDEX IF NOT EXISTS idx_subcontracts_projectId ON subcontracts(projectId);
  CREATE INDEX IF NOT EXISTS idx_variation_orders_projectId ON variation_orders(projectId);
  CREATE INDEX IF NOT EXISTS idx_progress_billings_projectId ON progress_billings(projectId);
  CREATE INDEX IF NOT EXISTS idx_actual_costs_projectId ON actual_costs(projectId);
`);

// ── Phase 8: Procurement workflow ────────────────────────────────────────────
// A project-centric procurement pipeline layered on top of the existing
// suppliers table: RFQ → supplier quotations → bid comparison → award →
// purchase request → purchase order, plus supplier performance, attachments,
// and a shared Draft/For Approval/Approved/Rejected/Cancelled workflow.
db.exec(`
  CREATE TABLE IF NOT EXISTS rfqs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projectId INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    rfqNumber TEXT,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    dueDate TEXT,
    notes TEXT,
    createdBy TEXT,
    deletedAt TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Line items requested in an RFQ, typically generated from estimate items.
  CREATE TABLE IF NOT EXISTS rfq_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rfqId INTEGER NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    unit TEXT,
    quantity REAL NOT NULL DEFAULT 0,
    sourceType TEXT,
    sourceRefId INTEGER,
    sortOrder INTEGER NOT NULL DEFAULT 0
  );

  -- Suppliers invited to quote on an RFQ.
  CREATE TABLE IF NOT EXISTS rfq_suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rfqId INTEGER NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
    supplierId INTEGER NOT NULL REFERENCES suppliers(id)
  );

  -- A supplier's quotation header for one RFQ (many per RFQ).
  CREATE TABLE IF NOT EXISTS supplier_quotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rfqId INTEGER NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
    supplierId INTEGER NOT NULL REFERENCES suppliers(id),
    quoteNumber TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    currency TEXT NOT NULL DEFAULT 'USD',
    leadTimeDays INTEGER,
    validityDate TEXT,
    remarks TEXT,
    isAwarded INTEGER NOT NULL DEFAULT 0,
    deletedAt TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- A supplier's price for one RFQ line item.
  CREATE TABLE IF NOT EXISTS supplier_quotation_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quotationId INTEGER NOT NULL REFERENCES supplier_quotations(id) ON DELETE CASCADE,
    rfqItemId INTEGER NOT NULL REFERENCES rfq_items(id) ON DELETE CASCADE,
    unitPrice REAL NOT NULL DEFAULT 0,
    remarks TEXT
  );

  -- A purchase request generated from approved estimate items.
  CREATE TABLE IF NOT EXISTS purchase_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projectId INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    prNumber TEXT,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    requiredDate TEXT,
    notes TEXT,
    createdBy TEXT,
    deletedAt TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS purchase_request_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prId INTEGER NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    unit TEXT,
    quantity REAL NOT NULL DEFAULT 0,
    estimatedUnitCost REAL NOT NULL DEFAULT 0,
    sourceType TEXT,
    sourceRefId INTEGER,
    sortOrder INTEGER NOT NULL DEFAULT 0
  );

  -- Line items on a purchase order (the header lives in purchase_orders).
  CREATE TABLE IF NOT EXISTS purchase_order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    poId INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    unit TEXT,
    quantity REAL NOT NULL DEFAULT 0,
    unitPrice REAL NOT NULL DEFAULT 0,
    sortOrder INTEGER NOT NULL DEFAULT 0
  );

  -- Supplier performance evaluation, optionally tied to a project / PO.
  CREATE TABLE IF NOT EXISTS supplier_performance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplierId INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    projectId INTEGER REFERENCES projects(id),
    poId INTEGER REFERENCES purchase_orders(id),
    deliveryRating REAL NOT NULL DEFAULT 0,
    qualityRating REAL NOT NULL DEFAULT 0,
    priceRating REAL NOT NULL DEFAULT 0,
    overallScore REAL NOT NULL DEFAULT 0,
    remarks TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Attachments (PDF / Excel / drawings / images) for any procurement entity.
  CREATE TABLE IF NOT EXISTS procurement_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entityType TEXT NOT NULL,
    entityId INTEGER NOT NULL,
    fileName TEXT NOT NULL,
    fileType TEXT,
    size INTEGER NOT NULL DEFAULT 0,
    dataUrl TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_rfqs_projectId ON rfqs(projectId);
  CREATE INDEX IF NOT EXISTS idx_rfq_items_rfqId ON rfq_items(rfqId);
  CREATE INDEX IF NOT EXISTS idx_rfq_suppliers_rfqId ON rfq_suppliers(rfqId);
  CREATE INDEX IF NOT EXISTS idx_supplier_quotations_rfqId ON supplier_quotations(rfqId);
  CREATE INDEX IF NOT EXISTS idx_supplier_quotation_items_quotationId ON supplier_quotation_items(quotationId);
  CREATE INDEX IF NOT EXISTS idx_purchase_requests_projectId ON purchase_requests(projectId);
  CREATE INDEX IF NOT EXISTS idx_purchase_request_items_prId ON purchase_request_items(prId);
  CREATE INDEX IF NOT EXISTS idx_purchase_order_items_poId ON purchase_order_items(poId);
  CREATE INDEX IF NOT EXISTS idx_supplier_performance_supplierId ON supplier_performance(supplierId);
  CREATE INDEX IF NOT EXISTS idx_procurement_attachments_entity ON procurement_attachments(entityType, entityId);
`);

// Link a purchase order back to the RFQ / quotation / purchase request it came
// from, and carry the shared approval workflow status on the PO header.
ensureColumn("purchase_orders", "rfqId", "rfqId INTEGER REFERENCES rfqs(id)");
ensureColumn("purchase_orders", "quotationId", "quotationId INTEGER REFERENCES supplier_quotations(id)");
ensureColumn("purchase_orders", "prId", "prId INTEGER REFERENCES purchase_requests(id)");
ensureColumn("purchase_orders", "approvalStatus", "approvalStatus TEXT NOT NULL DEFAULT 'draft'");

// Seed built-in roles and a default administrator once.
{
  const ALL_MODULES = ["Projects", "Catalogs", "UPA", "Assemblies", "GeneralRequirements", "Procurement", "Tender", "Reports", "Administration", "Import", "Export"];
  const ALL_ACTIONS = ["view", "edit", "delete", "approve"];
  const full = {};
  ALL_MODULES.forEach((m) => { full[m] = [...ALL_ACTIONS]; });
  const viewOnly = {};
  ALL_MODULES.forEach((m) => { viewOnly[m] = ["view"]; });
  const estimator = {};
  ALL_MODULES.forEach((m) => { estimator[m] = m === "Administration" ? [] : ["view", "edit"]; });
  const approver = { ...estimator, Reports: ["view"], Tender: ["view", "edit", "approve"], Projects: ["view", "edit", "approve"] };

  const ROLES = [
    ["Administrator", full], ["Senior Estimator", { ...estimator, Export: ["view", "edit"], Import: ["view", "edit"] }],
    ["Estimator", estimator], ["Project Engineer", estimator], ["Project Manager", approver],
    ["Reviewer", { ...viewOnly, Projects: ["view", "edit"] }], ["Approver", approver],
    ["Procurement Officer", { ...viewOnly, Procurement: ["view", "edit"] }], ["Viewer", viewOnly],
  ];
  const existing = db.prepare("SELECT COUNT(*) AS c FROM roles").get().c;
  if (existing === 0) {
    const ins = db.prepare("INSERT INTO roles (name, permissions, isBuiltIn) VALUES (?, ?, 1)");
    for (const [name, perms] of ROLES) ins.run(name, JSON.stringify(perms));
  }

  // Ensure the enterprise built-in roles exist (idempotent, also on upgrades).
  const ENTERPRISE_ROLES = [
    ["Administrator", full], ["Estimator", estimator], ["Project Engineer", estimator],
    ["Project Manager", approver], ["Procurement", { ...viewOnly, Procurement: ["view", "edit"] }],
    ["Accounting", { ...viewOnly, Reports: ["view", "edit"] }],
    ["Executive", { ...viewOnly, Reports: ["view", "edit", "approve"] }], ["Viewer", viewOnly],
  ];
  const ensureRole = db.prepare("INSERT OR IGNORE INTO roles (name, permissions, isBuiltIn) VALUES (?, ?, 1)");
  for (const [name, perms] of ENTERPRISE_ROLES) ensureRole.run(name, JSON.stringify(perms));

  // Seed the admin user with a scrypt-hashed password (admin / admin123).
  const adminRoleId = db.prepare("SELECT id FROM roles WHERE name = 'Administrator'").get()?.id ?? null;
  const haveAdmin = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
  if (!haveAdmin) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync("admin123", salt, 64).toString("hex");
    // The users table requires email + name (NOT NULL); fill them in.
    db.prepare(
      `INSERT INTO users (email, name, role, roleId, username, passwordHash, passwordSalt, firstName, lastName, position, status)
       VALUES ('admin@estimator.local', 'Administrator', 'Administrator', ?, 'admin', ?, ?, 'System', 'Administrator', 'Administrator', 'active')`
    ).run(adminRoleId, hash, salt);
  }
}

// Seed the project-staff library and a couple of built-in GR templates once.
const grStaffCount = db.prepare("SELECT COUNT(*) AS c FROM gr_staff_library").get().c;
if (grStaffCount === 0) {
  const STAFF = [
    ["Project Director", 12000], ["Construction Manager", 9000], ["Project Manager", 8000],
    ["Resident Engineer", 6000], ["Mechanical Engineer", 5000], ["Electrical Engineer", 5000],
    ["Civil Engineer", 5000], ["Structural Engineer", 5500], ["Architect", 5000],
    ["Planning Engineer", 4800], ["QAQC Engineer", 4800], ["Safety Officer", 4000],
    ["Quantity Surveyor", 4500], ["Cost Engineer", 4800], ["Document Controller", 2500],
    ["Procurement Officer", 3500], ["Warehouse Supervisor", 3000], ["Storekeeper", 1800],
    ["Timekeeper", 1500], ["Foreman", 2800], ["Administrative Staff", 1800],
    ["Driver", 1200], ["Utility Worker", 1000],
  ];
  const ins = db.prepare("INSERT INTO gr_staff_library (role, monthlyRate, sortOrder) VALUES (?, ?, ?)");
  STAFF.forEach(([role, rate], i) => ins.run(role, rate, i));
}

const grTemplateCount = db.prepare("SELECT COUNT(*) AS c FROM gr_templates WHERE isBuiltIn = 1").get().c;
if (grTemplateCount === 0) {
  // A compact built-in template; users can duplicate/extend it. method+pct/
  // value/rate drive the calculation via the cost engine.
  const COMMON = [
    ["Mobilization / Demobilization", "Mobilization & demobilization", "ls", "lumpSum", 0, 0, 0],
    ["Temporary Facilities", "Site office (monthly)", "month", "monthly", 0, 1500, 0],
    ["Temporary Utilities", "Temporary power & water", "month", "monthly", 0, 800, 0],
    ["Project Staff", "Project management team", "month", "monthly", 0, 25000, 0],
    ["Safety Requirements", "PPE, signages & safety program", "%", "percentageOfDirect", 1.5, 0, 0],
    ["Quality Assurance / Quality Control", "QA/QC program", "%", "percentageOfDirect", 1.0, 0, 0],
    ["Bonds & Insurance", "Performance bond & CAR insurance", "%", "percentageOfProject", 2.0, 0, 0],
    ["Permits & Government Fees", "Permits & government fees", "ls", "allowance", 0, 0, 5000],
    ["Testing & Commissioning", "T&C of systems", "%", "percentageOfDirect", 0.75, 0, 0],
    ["Project Closeout", "As-builts, O&M, final cleaning", "ls", "lumpSum", 0, 0, 3000],
  ];
  const insT = db.prepare("INSERT INTO gr_templates (name, projectType, description, isBuiltIn) VALUES (?, ?, ?, 1)");
  const insI = db.prepare("INSERT INTO gr_template_items (templateId, category, description, unit, method, pct, rate, value, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
  for (const tpl of ["Commercial Building", "Office Building", "Hospital", "Warehouse", "School"]) {
    const { lastInsertRowid: tid } = insT.run(tpl, tpl, `Standard general requirements for a ${tpl.toLowerCase()}`);
    COMMON.forEach((c, i) => insI.run(tid, c[0], c[1], c[2], c[3], c[4], c[5], c[6], i));
  }
}

// Seed the standard CSI-style WBS tree once, on first run only. Never
// re-runs once a category exists, so user edits/additions are never
// overwritten on subsequent app starts.
const wbsCategoryCount = db.prepare("SELECT COUNT(*) AS count FROM wbs_categories").get().count;
if (wbsCategoryCount === 0) {
  const DEFAULT_WBS = [
    {
      name: "Mechanical",
      subcategories: [
        "HVAC",
        "Fire Protection",
        "Plumbing",
        "Sanitary",
        "Ventilation",
        "Pumps",
        "Medical Gas",
        "Compressed Air",
        "Fuel System",
        "Building Automation",
      ],
    },
    { name: "Electrical", subcategories: [] },
    { name: "Civil", subcategories: [] },
    { name: "Architectural", subcategories: [] },
    { name: "General Requirements", subcategories: [] },
  ];
  const insertCategory = db.prepare("INSERT INTO wbs_categories (name, sortOrder) VALUES (?, ?)");
  const insertSubcategory = db.prepare(
    "INSERT INTO wbs_subcategories (wbsCategoryId, name, sortOrder) VALUES (?, ?, ?)"
  );
  DEFAULT_WBS.forEach((category, categoryIndex) => {
    const { lastInsertRowid: categoryId } = insertCategory.run(category.name, categoryIndex);
    category.subcategories.forEach((name, subIndex) => {
      insertSubcategory.run(categoryId, name, subIndex);
    });
  });
}
