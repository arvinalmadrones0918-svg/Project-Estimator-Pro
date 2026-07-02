// Demo data seeder — creates a Demo Company and six sample projects (one per
// discipline) so a fresh install shows a realistic, populated workspace.
//
//   node src/demoSeed.js
//
// Idempotent: it skips any project whose name already exists. It never touches
// application logic — it only inserts catalog + project rows through the same
// schema the app uses.
import { db } from "./db.js";

console.log("Seeding demo company and sample projects…");

// ── Demo company ─────────────────────────────────────────────────────────────
db.prepare(
  `UPDATE company_profile SET name = ?, legalName = ?, registrationNo = ?, taxId = ?,
     address = ?, city = ?, country = ?, phone = ?, email = ?, website = ?, baseCurrency = ?, updatedAt = datetime('now')
   WHERE id = 1`
).run(
  "Cornerstone Builders Demo", "Cornerstone Builders & Engineering Co.", "REG-2026-000123", "TAX-998877",
  "1200 Skyline Avenue, Business Bay", "Metro City", "Philippines", "+63 2 8555 0100",
  "info@cornerstone-demo.example", "https://cornerstone-demo.example", "USD"
);
console.log("• Demo company set.");

// ── Catalog helpers (get-or-create by name) ──────────────────────────────────
function getOrCreateMaterial(name, category, unit, unitPrice) {
  const found = db.prepare("SELECT id, unitPrice FROM materials WHERE name = ?").get(name);
  if (found) return found;
  const r = db.prepare("INSERT INTO materials (name, category, unit, unitPrice) VALUES (?, ?, ?, ?)").run(name, category, unit, unitPrice);
  return { id: r.lastInsertRowid, unitPrice };
}
function getOrCreateLabor(name, hourlyRate) {
  const found = db.prepare("SELECT id, hourlyRate FROM labor_specializations WHERE name = ?").get(name);
  if (found) return found;
  const r = db.prepare("INSERT INTO labor_specializations (name, hourlyRate) VALUES (?, ?)").run(name, hourlyRate);
  return { id: r.lastInsertRowid, hourlyRate };
}
function getOrCreateEquipment(name, category, unit, unitPrice) {
  const found = db.prepare("SELECT id, unitPrice FROM equipment WHERE name = ?").get(name);
  if (found) return found;
  const r = db.prepare("INSERT INTO equipment (name, category, unit, unitPrice) VALUES (?, ?, ?, ?)").run(name, category, unit, unitPrice);
  return { id: r.lastInsertRowid, unitPrice };
}

function categoryId(name) { return db.prepare("SELECT id FROM wbs_categories WHERE name = ?").get(name)?.id ?? null; }
function subcategoryId(catId, name) { return db.prepare("SELECT id FROM wbs_subcategories WHERE wbsCategoryId = ? AND name = ?").get(catId, name)?.id ?? null; }

// ── Sample projects, one per discipline ──────────────────────────────────────
const PROJECTS = [
  {
    name: "Mechanical — Central Plant HVAC", client: "Cornerstone Builders Demo",
    category: "Mechanical", subcategory: "HVAC", module: "AHU & Ductwork Package",
    materials: [["Galvanized Duct Sheet", "Mechanical", "sq meter", 32, 400]],
    labor: [["HVAC Technician", 22, 320]],
    equipment: [["Welding Machine", "Mechanical", "day", 95, 8]],
    subcontract: [["Ductwork insulation & balancing", 12500]],
    other: [["Testing & commissioning", 3000]],
  },
  {
    name: "Electrical — Power Distribution", client: "Cornerstone Builders Demo",
    category: "Electrical", subcategory: null, module: "MV/LV Distribution",
    materials: [["Copper Wire 12AWG", "Electrical", "meter", 1.1, 5000], ["Cable Tray 300mm", "Electrical", "meter", 14, 600]],
    labor: [["Electrician", 18, 480]],
    equipment: [["Generator 20kW", "Electrical", "day", 150, 6]],
    subcontract: [["Switchgear installation & testing", 22000]],
    other: [],
  },
  {
    name: "Civil — Foundations & Structure", client: "Cornerstone Builders Demo",
    category: "Civil", subcategory: null, module: "Reinforced Concrete Foundations",
    materials: [["Portland Cement", "Concrete", "bag (40kg)", 6.5, 800], ["Rebar 10mm", "Steel", "length (6m)", 4.2, 1200], ["Gravel", "Concrete", "cubic meter", 25, 90]],
    labor: [["Mason", 15, 640], ["General Laborer", 9, 900]],
    equipment: [["Backhoe Loader", "Earthmoving", "day", 420, 5], ["Concrete Mixer", "Concrete", "day", 85, 10]],
    subcontract: [["Pile driving", 45000]],
    other: [["Soil testing", 4500]],
  },
  {
    name: "Architectural — Interior Fit-Out", client: "Cornerstone Builders Demo",
    category: "Architectural", subcategory: null, module: "Finishes Package",
    materials: [["Ceramic Tile", "Finishing", "sq meter", 14, 700], ["Interior Paint", "Finishing", "gallon", 28, 120], ["Plywood 1/2in", "Lumber", "sheet", 18, 200]],
    labor: [["Painter", 12, 400], ["Carpenter", 14, 360]],
    equipment: [["Scissor Lift", "Access", "day", 180, 12]],
    subcontract: [["Gypsum partition & ceiling", 18000]],
    other: [],
  },
  {
    name: "Plumbing — Domestic Water & Drainage", client: "Cornerstone Builders Demo",
    category: "Mechanical", subcategory: "Plumbing", module: "Water Supply & Sanitary",
    materials: [["PVC Pipe 4in", "Plumbing", "length (3m)", 9, 300], ["Copper Pipe 22mm", "Plumbing", "meter", 6.5, 450]],
    labor: [["Plumber", 17, 520]],
    equipment: [["Pipe Threading Machine", "Plumbing", "day", 110, 6]],
    subcontract: [["Pump skid installation", 9500]],
    other: [["Pressure testing", 1500]],
  },
  {
    name: "Fire Protection — Sprinkler System", client: "Cornerstone Builders Demo",
    category: "Mechanical", subcategory: "Fire Protection", module: "Wet Sprinkler Network",
    materials: [["Black Steel Pipe 4in", "Fire Protection", "length (6m)", 24, 350], ["Sprinkler Head", "Fire Protection", "piece", 12, 600]],
    labor: [["Pipefitter", 19, 480]],
    equipment: [["Welding Machine", "Mechanical", "day", 95, 7]],
    subcontract: [["Fire pump & controller", 28000]],
    other: [["Hydrostatic testing & certification", 3500]],
  },
];

let created = 0;
for (const p of PROJECTS) {
  if (db.prepare("SELECT id FROM projects WHERE name = ? AND deletedAt IS NULL").get(p.name)) {
    console.log(`• Skipped (exists): ${p.name}`);
    continue;
  }
  const catId = categoryId(p.category);
  const subId = p.subcategory ? subcategoryId(catId, p.subcategory) : null;

  const projectId = db.prepare(
    "INSERT INTO projects (name, client, estimator, currency, workflowStatus) VALUES (?, ?, 'Demo Estimator', 'USD', 'draft')"
  ).run(p.name, p.client).lastInsertRowid;

  const moduleId = db.prepare(
    "INSERT INTO work_modules (name, projectId, wbsCategoryId, wbsSubcategoryId, sortOrder) VALUES (?, ?, ?, ?, 0)"
  ).run(p.module, projectId, catId, subId).lastInsertRowid;

  p.materials.forEach(([name, cat, unit, price, qty], i) => {
    const m = getOrCreateMaterial(name, cat, unit, price);
    db.prepare("INSERT INTO module_materials (workModuleId, materialId, quantity, unitPriceAtEntry, sortOrder) VALUES (?, ?, ?, ?, ?)")
      .run(moduleId, m.id, qty, m.unitPrice, i);
  });
  p.labor.forEach(([name, rate, hours], i) => {
    const l = getOrCreateLabor(name, rate);
    db.prepare("INSERT INTO module_labor (workModuleId, specializationId, quantity, hourlyRateAtEntry, sortOrder) VALUES (?, ?, ?, ?, ?)")
      .run(moduleId, l.id, hours, l.hourlyRate, i);
  });
  p.equipment.forEach(([name, cat, unit, price, qty], i) => {
    const e = getOrCreateEquipment(name, cat, unit, price);
    db.prepare("INSERT INTO module_equipment (workModuleId, equipmentId, quantity, unitPriceAtEntry, sortOrder) VALUES (?, ?, ?, ?, ?)")
      .run(moduleId, e.id, qty, e.unitPrice, i);
  });
  p.subcontract.forEach(([desc, cost], i) => {
    db.prepare("INSERT INTO module_subcontract (workModuleId, description, cost, sortOrder) VALUES (?, ?, ?, ?)").run(moduleId, desc, cost, i);
  });
  p.other.forEach(([desc, cost], i) => {
    db.prepare("INSERT INTO module_other_costs (workModuleId, description, cost, sortOrder) VALUES (?, ?, ?, ?)").run(moduleId, desc, cost, i);
  });

  created += 1;
  console.log(`• Created: ${p.name}`);
}

console.log(`Demo seed complete — ${created} project(s) created.`);
