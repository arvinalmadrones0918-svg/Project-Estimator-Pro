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

// Indexes on every foreign key and common filter column, created only after
// the columns above are guaranteed to exist. With line-item volumes in the
// 100k+ range, these are required for per-module and per-project rollup
// queries to stay fast.
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_projects_deletedAt ON projects(deletedAt);
  CREATE INDEX IF NOT EXISTS idx_materials_category ON materials(category);
  CREATE INDEX IF NOT EXISTS idx_materials_isActive ON materials(isActive);
  CREATE INDEX IF NOT EXISTS idx_labor_specializations_isActive ON labor_specializations(isActive);
  CREATE INDEX IF NOT EXISTS idx_equipment_category ON equipment(category);
  CREATE INDEX IF NOT EXISTS idx_equipment_isActive ON equipment(isActive);
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
