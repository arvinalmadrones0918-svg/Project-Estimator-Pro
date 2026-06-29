import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "..", "data.db");

export const db = new DatabaseSync(dbPath);

db.exec(`
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
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS wbs_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    sortOrder INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS wbs_subcategories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wbsCategoryId INTEGER NOT NULL REFERENCES wbs_categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sortOrder INTEGER NOT NULL DEFAULT 0,
    UNIQUE (wbsCategoryId, name)
  );

  CREATE TABLE IF NOT EXISTS materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    unit TEXT NOT NULL,
    unitPrice REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS labor_specializations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    hourlyRate REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS equipment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    unit TEXT NOT NULL,
    unitPrice REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS work_modules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS module_materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workModuleId INTEGER NOT NULL REFERENCES work_modules(id) ON DELETE CASCADE,
    materialId INTEGER NOT NULL REFERENCES materials(id),
    quantity REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS module_labor (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workModuleId INTEGER NOT NULL REFERENCES work_modules(id) ON DELETE CASCADE,
    specializationId INTEGER NOT NULL REFERENCES labor_specializations(id),
    quantity REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS module_equipment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workModuleId INTEGER NOT NULL REFERENCES work_modules(id) ON DELETE CASCADE,
    equipmentId INTEGER NOT NULL REFERENCES equipment(id),
    quantity REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS module_subcontract (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workModuleId INTEGER NOT NULL REFERENCES work_modules(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    cost REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS module_other_costs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workModuleId INTEGER NOT NULL REFERENCES work_modules(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    cost REAL NOT NULL
  );
`);

function ensureColumn(table, column, ddl) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

// Migrate existing work_modules rows (Phase 0) to the WBS/Project structure (Phase 1)
// without dropping or rewriting any existing data.
ensureColumn("work_modules", "projectId", "projectId INTEGER REFERENCES projects(id)");
ensureColumn("work_modules", "wbsCategoryId", "wbsCategoryId INTEGER REFERENCES wbs_categories(id)");
ensureColumn("work_modules", "wbsSubcategoryId", "wbsSubcategoryId INTEGER REFERENCES wbs_subcategories(id)");
