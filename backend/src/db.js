import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "..", "data.db");

export const db = new DatabaseSync(dbPath);

db.exec(`
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
`);
