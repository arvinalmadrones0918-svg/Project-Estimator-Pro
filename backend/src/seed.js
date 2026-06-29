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

const countMaterials = db.prepare("SELECT COUNT(*) AS c FROM materials").get().c;
const countLabor = db.prepare("SELECT COUNT(*) AS c FROM labor_specializations").get().c;

if (countMaterials === 0) {
  const insert = db.prepare(
    "INSERT INTO materials (name, category, unit, unitPrice) VALUES (?, ?, ?, ?)"
  );
  for (const m of materials) insert.run(...m);
  console.log(`Seeded ${materials.length} materials.`);
} else {
  console.log("Materials already seeded, skipping.");
}

if (countLabor === 0) {
  const insert = db.prepare(
    "INSERT INTO labor_specializations (name, hourlyRate) VALUES (?, ?)"
  );
  for (const l of laborSpecializations) insert.run(...l);
  console.log(`Seeded ${laborSpecializations.length} labor specializations.`);
} else {
  console.log("Labor specializations already seeded, skipping.");
}
