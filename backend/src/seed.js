import { db } from "./db.js";

const materials = [
  ["Portland Cement", "Concrete", "bag (40kg)", 6.5],
  ["Sand", "Concrete", "cubic meter", 22],
  ["Gravel", "Concrete", "cubic meter", 25],
  ["Rebar 10mm", "Steel", "length (6m)", 4.2],
  ["Plywood 1/2in", "Lumber", "sheet", 18],
  ["2x4 Lumber", "Lumber", "8ft piece", 5.5],
  ["PVC Pipe 4in", "Plumbing", "length (3m)", 9],
  ["Copper Wire 12AWG", "Electrical", "meter", 1.1],
  ["Ceramic Tile", "Finishing", "sq meter", 14],
  ["Interior Paint", "Finishing", "gallon", 28],
];

const laborSpecializations = [
  ["Mason", 15],
  ["Carpenter", 14],
  ["Electrician", 18],
  ["Plumber", 17],
  ["Painter", 12],
  ["General Laborer", 9],
];

const equipment = [
  ["Mini Excavator", "Earthmoving", "day", 350],
  ["Backhoe Loader", "Earthmoving", "day", 420],
  ["Concrete Mixer", "Concrete", "day", 85],
  ["Scissor Lift", "Access", "day", 180],
  ["Welding Machine", "Mechanical", "day", 95],
  ["Pipe Threading Machine", "Plumbing", "day", 110],
  ["Air Compressor", "Mechanical", "day", 75],
  ["Generator 20kW", "Electrical", "day", 150],
  ["Scaffolding (set)", "Access", "week", 220],
  ["Crane (mobile)", "Lifting", "day", 950],
];

const wbsCategories = ["Mechanical", "Electrical", "Civil", "Architectural", "General Requirements"];

const mechanicalSubcategories = [
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
];

function seedTable(tableName, label, rows, columns) {
  const count = db.prepare(`SELECT COUNT(*) AS c FROM ${tableName}`).get().c;
  if (count > 0) {
    console.log(`${label} already seeded, skipping.`);
    return;
  }
  const placeholders = columns.map(() => "?").join(", ");
  const insert = db.prepare(`INSERT INTO ${tableName} (${columns.join(", ")}) VALUES (${placeholders})`);
  for (const row of rows) insert.run(...row);
  console.log(`Seeded ${rows.length} ${label}.`);
}

seedTable("materials", "materials", materials, ["name", "category", "unit", "unitPrice"]);
seedTable("labor_specializations", "labor specializations", laborSpecializations, ["name", "hourlyRate"]);
seedTable("equipment", "equipment", equipment, ["name", "category", "unit", "unitPrice"]);

const wbsCount = db.prepare("SELECT COUNT(*) AS c FROM wbs_categories").get().c;
if (wbsCount === 0) {
  const insertCategory = db.prepare("INSERT INTO wbs_categories (name, sortOrder) VALUES (?, ?)");
  const insertSubcategory = db.prepare(
    "INSERT INTO wbs_subcategories (wbsCategoryId, name, sortOrder) VALUES (?, ?, ?)"
  );

  let mechanicalId = null;
  wbsCategories.forEach((name, index) => {
    const result = insertCategory.run(name, index);
    if (name === "Mechanical") mechanicalId = result.lastInsertRowid;
  });

  mechanicalSubcategories.forEach((name, index) => {
    insertSubcategory.run(mechanicalId, name, index);
  });

  console.log(`Seeded ${wbsCategories.length} WBS categories and ${mechanicalSubcategories.length} Mechanical subcategories.`);
} else {
  console.log("WBS categories already seeded, skipping.");
}
