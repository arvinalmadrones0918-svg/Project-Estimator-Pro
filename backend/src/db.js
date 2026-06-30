import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "..", "data.db");

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
`);

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
