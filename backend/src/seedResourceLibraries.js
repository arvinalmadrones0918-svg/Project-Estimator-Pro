// Seeds professionally categorized sample records for the Labor, Equipment and
// Subcontract resource libraries. Idempotent per library (guarded by the code
// prefix marker), so it never duplicates and never clobbers user data.

const LABOR = [
  // [name, trade, skillLevel, hourlyRate, dailyRate, otRate, productivity, outputUnit, crew, stdHours]
  ["Mason", "Civil", "Skilled", 15, 120, 22.5, 1.2, "m²/hr", 2, 8],
  ["Carpenter", "Civil", "Skilled", 14, 112, 21, 1.0, "m²/hr", 2, 8],
  ["Steel Fixer", "Structural", "Skilled", 16, 128, 24, 120, "kg/hr", 3, 8],
  ["Welder", "Structural", "Skilled", 18, 144, 27, 4, "joints/hr", 1, 8],
  ["Electrician", "Electrical", "Skilled", 18, 144, 27, 20, "m/hr", 2, 8],
  ["Plumber", "Plumbing", "Skilled", 17, 136, 25.5, 15, "m/hr", 2, 8],
  ["Pipefitter", "Mechanical", "Skilled", 19, 152, 28.5, 12, "m/hr", 2, 8],
  ["HVAC Technician", "Mechanical", "Skilled", 20, 160, 30, 8, "m²/hr", 2, 8],
  ["Painter", "Finishes", "Skilled", 12, 96, 18, 10, "m²/hr", 1, 8],
  ["Tiler", "Finishes", "Skilled", 13, 104, 19.5, 3, "m²/hr", 1, 8],
  ["Rigger", "Structural", "Skilled", 15, 120, 22.5, null, "lift", 3, 8],
  ["Heavy Equipment Operator", "Civil", "Skilled", 20, 160, 30, null, "hr", 1, 8],
  ["Foreman", "General", "Supervisor", 25, 200, 37.5, null, "hr", 1, 8],
  ["Site Engineer", "General", "Professional", 30, 240, 45, null, "hr", 1, 8],
  ["Safety Officer", "Safety", "Professional", 22, 176, 33, null, "hr", 1, 8],
  ["Surveyor", "Civil", "Professional", 24, 192, 36, null, "hr", 2, 8],
  ["General Laborer", "General", "Unskilled", 9, 72, 13.5, null, "hr", 5, 8],
  ["Scaffolder", "Structural", "Skilled", 14, 112, 21, 6, "m²/hr", 2, 8],
  ["Glazier", "Architectural", "Skilled", 16, 128, 24, 4, "m²/hr", 2, 8],
  ["Insulation Installer", "Mechanical", "Skilled", 13, 104, 19.5, 12, "m²/hr", 2, 8],
];

const EQUIPMENT = [
  // [name, category, unitPrice/day, rentalRate, fuel, fuelType, operator, prod, outUnit, idle, maint, capacity, mfr, model, year]
  ["Mini Excavator", "Earthmoving", 350, 350, 8, "Diesel", 1, 40, "m³/hr", 120, 25, "1.5 ton", "Kubota", "U17", 2022],
  ["Backhoe Loader", "Earthmoving", 420, 420, 12, "Diesel", 1, 60, "m³/hr", 150, 30, "1.0 m³", "JCB", "3CX", 2021],
  ["Bulldozer", "Earthmoving", 780, 780, 25, "Diesel", 1, 120, "m³/hr", 260, 55, "D6", "Caterpillar", "D6", 2020],
  ["Wheel Loader", "Earthmoving", 560, 560, 18, "Diesel", 1, 90, "m³/hr", 180, 40, "2.5 m³", "Volvo", "L90", 2021],
  ["Tower Crane", "Lifting", 1500, 1500, 0, "Electric", 1, null, "lift", 400, 120, "8 ton", "Liebherr", "85EC", 2019],
  ["Mobile Crane", "Lifting", 950, 950, 20, "Diesel", 1, null, "lift", 300, 80, "50 ton", "Grove", "GMK", 2020],
  ["Concrete Mixer", "Concrete", 85, 85, 3, "Diesel", 0, 4, "m³/hr", 20, 8, "0.5 m³", "Generic", "CM350", 2022],
  ["Concrete Pump", "Concrete", 650, 650, 15, "Diesel", 1, 30, "m³/hr", 150, 45, "30 m³/hr", "Putzmeister", "BSF", 2020],
  ["Transit Mixer", "Concrete", 480, 480, 14, "Diesel", 1, null, "trip", 120, 35, "6 m³", "Generic", "TM6", 2021],
  ["Scissor Lift", "Access", 180, 180, 0, "Electric", 0, null, "hr", 40, 12, "10 m", "Genie", "GS1930", 2022],
  ["Boom Lift", "Access", 260, 260, 6, "Diesel", 0, null, "hr", 70, 18, "20 m", "JLG", "600S", 2021],
  ["Air Compressor", "Mechanical", 75, 75, 5, "Diesel", 0, null, "hr", 20, 6, "185 cfm", "Atlas Copco", "XAS", 2022],
  ["Generator 20kW", "Electrical", 150, 150, 6, "Diesel", 0, null, "hr", 30, 10, "20 kVA", "Cummins", "C20", 2021],
  ["Generator 100kW", "Electrical", 420, 420, 18, "Diesel", 0, null, "hr", 90, 25, "100 kVA", "Cummins", "C100", 2020],
  ["Welding Machine", "Mechanical", 95, 95, 0, "Electric", 0, null, "hr", 15, 5, "400A", "Lincoln", "LN25", 2022],
  ["Plate Compactor", "Earthmoving", 60, 60, 2, "Gasoline", 0, 200, "m²/hr", 12, 4, "90 kg", "Wacker", "VP1550", 2022],
  ["Road Roller", "Earthmoving", 520, 520, 16, "Diesel", 1, 400, "m²/hr", 130, 35, "10 ton", "Bomag", "BW211", 2020],
  ["Forklift", "Lifting", 220, 220, 5, "LPG", 1, null, "hr", 55, 15, "3 ton", "Toyota", "8FG", 2021],
  ["Dump Truck", "Hauling", 380, 380, 22, "Diesel", 1, null, "trip", 90, 30, "10 m³", "Isuzu", "FVR", 2021],
  ["Scaffolding (set)", "Access", 220, 220, 0, "None", 0, null, "week", 0, 8, "100 m²", "Generic", "Cuplock", 2022],
];

const SUBCONTRACT = [
  // [name, trade, unitCost, unit, coverageArea, leadTime, warranty, vendor, contact, rating]
  ["Structural Steel Erection", "Structural", 1.4, "kg", "Nationwide", "3 weeks", "1 year", "SteelWorks Inc.", "steel@vendor.example", 4.5],
  ["Waterproofing System", "Civil", 12, "m²", "Metro", "1 week", "10 years", "AquaSeal Co.", "sales@aquaseal.example", 4.2],
  ["Ductwork Fabrication & Install", "Mechanical", 34, "m²", "Metro", "2 weeks", "2 years", "AirFlow Systems", "info@airflow.example", 4.0],
  ["Fire Sprinkler Installation", "Fire Protection", 28, "point", "Nationwide", "3 weeks", "2 years", "FireGuard Ltd.", "quote@fireguard.example", 4.6],
  ["Electrical Rough-In & Fit-Out", "Electrical", 22, "point", "Metro", "2 weeks", "1 year", "PowerLine Electric", "pm@powerline.example", 4.1],
  ["Plumbing & Sanitary", "Plumbing", 18, "point", "Metro", "2 weeks", "1 year", "FlowRight Plumbing", "ops@flowright.example", 3.9],
  ["Gypsum Partition & Ceiling", "Architectural", 16, "m²", "Metro", "1 week", "1 year", "DriBuild Interiors", "sales@dribuild.example", 4.3],
  ["Painting & Coatings", "Finishes", 6, "m²", "Nationwide", "1 week", "2 years", "ColorPro Painters", "hello@colorpro.example", 4.0],
  ["Tiling & Stone Works", "Finishes", 14, "m²", "Metro", "2 weeks", "1 year", "StoneCraft", "info@stonecraft.example", 4.2],
  ["Aluminum & Glazing", "Architectural", 65, "m²", "Metro", "4 weeks", "5 years", "GlassLine Systems", "sales@glassline.example", 4.4],
  ["Elevator Supply & Install", "Mechanical", 22000, "unit", "Nationwide", "12 weeks", "5 years", "LiftTech", "projects@lifttech.example", 4.7],
  ["Landscaping & Softworks", "Civil", 9, "m²", "Metro", "2 weeks", "1 year", "GreenScape", "info@greenscape.example", 3.8],
  ["Asphalt Paving", "Civil", 11, "m²", "Nationwide", "3 weeks", "3 years", "RoadWorks Co.", "bids@roadworks.example", 4.1],
  ["Fire Alarm & Detection", "Fire Protection", 45, "point", "Nationwide", "3 weeks", "2 years", "SafeAlarm", "sales@safealarm.example", 4.5],
  ["HVAC Testing & Balancing", "Mechanical", 3.5, "m²", "Metro", "1 week", "1 year", "BalancePro", "tab@balancepro.example", 4.0],
];

export function seedResourceLibraries(db) {
  let n = 0;
  const laborSeeded = db.prepare("SELECT COUNT(*) AS c FROM labor_specializations WHERE code LIKE 'LB-%'").get().c;
  if (laborSeeded === 0) {
    const ins = db.prepare(
      `INSERT INTO labor_specializations (code, name, category, trade, skillLevel, hourlyRate, dailyRate, overtimeRate,
        productivity, outputUnit, crewSize, standardHours, region, currency, isActive, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Default', 'USD', 1, datetime('now'), datetime('now'))`
    );
    LABOR.forEach((r, i) => { ins.run(`LB-${String(i + 1).padStart(3, "0")}`, r[0], r[1], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9]); n++; });
  }
  const eqSeeded = db.prepare("SELECT COUNT(*) AS c FROM equipment WHERE code LIKE 'EQ-%'").get().c;
  if (eqSeeded === 0) {
    const ins = db.prepare(
      `INSERT INTO equipment (code, name, category, unit, unitPrice, rentalRate, fuelConsumption, fuelType, operatorRequired,
        productivity, outputUnit, idleCost, maintenanceCost, capacity, manufacturer, model, year, currency, isActive, createdAt, updatedAt)
       VALUES (?, ?, ?, 'day', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'USD', 1, datetime('now'), datetime('now'))`
    );
    EQUIPMENT.forEach((r, i) => { ins.run(`EQ-${String(i + 1).padStart(3, "0")}`, r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10], r[11], r[12], r[13], r[14]); n++; });
  }
  const scSeeded = db.prepare("SELECT COUNT(*) AS c FROM subcontract_catalog WHERE code LIKE 'SC-%'").get().c;
  if (scSeeded === 0) {
    const ins = db.prepare(
      `INSERT INTO subcontract_catalog (code, name, category, trade, unit, unitPrice, coverageArea, leadTime, warranty,
        preferredVendor, contactInformation, performanceRating, currency, isActive, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'USD', 1, datetime('now'), datetime('now'))`
    );
    SUBCONTRACT.forEach((r, i) => { ins.run(`SC-${String(i + 1).padStart(3, "0")}`, r[0], r[1], r[1], r[3], r[2], r[4], r[5], r[6], r[7], r[8], r[9]); n++; });
  }
  return n;
}
