// End-to-end test of the core estimating journey, driven by Playwright against
// the live backend + frontend. Steps:
//   1 Create Project   2 Create Work Module   3 Add Materials   4 Add Labor
//   5 Add Equipment    6 Add Assembly         7 Verify totals   8 Export BOQ
//
// Run with both servers up:  npm run e2e
// Browser journey (login + dashboard) uses the UI; data steps use Playwright's
// end-to-end APIRequestContext (real HTTP against the running server).

import { chromium, request as pwRequest } from "playwright";

const FRONTEND = process.env.E2E_URL || "http://localhost:5173";
const BACKEND = process.env.E2E_API || "http://localhost:4000";
const CHROME = process.env.PW_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

let passed = 0;
const checks = [];
function check(name, cond) {
  checks.push({ name, ok: !!cond });
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else console.error(`  ✗ ${name}`);
}

async function run() {
  const api = await pwRequest.newContext({ baseURL: BACKEND });

  // ── UI: login + dashboard render (real browser) ──────────────────────────
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  await page.goto(FRONTEND);
  await page.waitForTimeout(1200);
  await page.fill('.login-form input[autocomplete="username"]', "admin");
  await page.fill('.login-form input[type=password]', "admin123");
  await page.click('button:has-text("Sign In")');
  await page.waitForTimeout(1500);
  check("UI: signed in (executive dashboard visible)", await page.$(".exec-dashboard"));
  await page.click('nav button:has-text("Projects")');
  await page.waitForTimeout(1000);
  check("UI: projects page reachable", await page.$(".dashboard-toolbar, .project-table, .recent-projects, table"));

  // ── Step 1: Create Project ───────────────────────────────────────────────
  const stamp = Date.now();
  const proj = await (await api.post("/api/projects", { data: { name: `E2E Tower ${stamp}`, client: "E2E Client" } })).json();
  check("1. Create Project", proj.id && proj.name.includes("E2E Tower"));

  // ── Step 2: Create Work Module ───────────────────────────────────────────
  const mod = await (await api.post("/api/modules", { data: { name: "E2E Module", projectId: proj.id } })).json();
  check("2. Create Work Module", !!mod.id);

  // Seed catalog items needed by steps 3-6.
  const material = await (await api.post("/api/materials", { data: { name: `E2E Steel ${stamp}`, category: "Structural", unit: "kg", unitPrice: 10 } })).json();
  const labor = await (await api.post("/api/labor-specializations", { data: { name: `E2E Mason ${stamp}`, hourlyRate: 25 } })).json();
  const equip = await (await api.post("/api/equipment", { data: { name: `E2E Crane ${stamp}`, category: "Lifting", unit: "hr", unitPrice: 100 } })).json();

  // ── Step 3: Add Materials (qty 4 × 10 = 40) ──────────────────────────────
  const matRes = await api.post(`/api/modules/${mod.id}/materials`, { data: { materialId: material.id, quantity: 4 } });
  check("3. Add Materials", matRes.ok());

  // ── Step 4: Add Labor (qty 8 × 25 = 200) ─────────────────────────────────
  const labRes = await api.post(`/api/modules/${mod.id}/labor`, { data: { specializationId: labor.id, quantity: 8 } });
  check("4. Add Labor", labRes.ok());

  // ── Step 5: Add Equipment (qty 2 × 100 = 200) ────────────────────────────
  const eqRes = await api.post(`/api/modules/${mod.id}/equipment`, { data: { equipmentId: equip.id, quantity: 2 } });
  check("5. Add Equipment", eqRes.ok());

  // ── Step 6: Add Assembly (assembly total 50, qty 1) ──────────────────────
  const asm = await (await api.post("/api/assemblies", { data: { name: `E2E Assembly ${stamp}`, unit: "ea" } })).json();
  await api.post(`/api/assemblies/${asm.id}/items/materials`, { data: { materialId: material.id, quantity: 5 } }); // 5 × 10 = 50
  const asmRes = await api.post(`/api/modules/${mod.id}/assemblies`, { data: { assemblyId: asm.id, quantity: 1 } });
  check("6. Add Assembly", asmRes.ok());

  // ── Step 7: Verify totals (engine = single source of truth) ──────────────
  const calc = await (await api.get(`/api/estimate/module/${mod.id}/calculate`)).json();
  // material 40 + assembly material 50 = 90; labor 200; equipment 200 → direct 490
  check("7a. Material cost = 90", Math.abs(calc.materialCost - 90) < 0.01);
  check("7b. Labor cost = 200", Math.abs(calc.laborCost - 200) < 0.01);
  check("7c. Equipment cost = 200", Math.abs(calc.equipmentCost - 200) < 0.01);
  check("7d. Direct cost = 490", Math.abs(calc.directCost - 490) < 0.01);

  // ── Step 8: Export BOQ (xlsx) ────────────────────────────────────────────
  const boq = await api.get(`/api/reports/export/boq?projectId=${proj.id}&format=xlsx`);
  const buf = await boq.body();
  check("8. Export BOQ (valid xlsx)", boq.ok() && buf.length > 1000 && buf.slice(0, 2).toString() === "PK");

  check("No console errors in UI", consoleErrors.length === 0);

  await browser.close();
  await api.dispose();

  console.log(`\n${passed}/${checks.length} checks passed`);
  if (passed !== checks.length) process.exit(1);
}

run().catch((e) => { console.error("E2E failed:", e.message); process.exit(1); });
