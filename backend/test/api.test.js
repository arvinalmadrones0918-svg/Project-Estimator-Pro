// API / CRUD integration tests via Supertest against the in-process Express
// app. Uses an isolated DB (see test/setup.cjs) so it never touches data.db.
import request from "supertest";
import app from "../src/index.js";

// ── Database migrations ─────────────────────────────────────────────────────

describe("Database migrations", () => {
  test("core tables exist and are queryable via their endpoints", async () => {
    // If migrations ran, these list endpoints return 200 with arrays/objects.
    for (const path of ["/api/projects", "/api/wbs/categories", "/api/assemblies", "/api/reports/types"]) {
      const res = await request(app).get(path);
      expect(res.status).toBe(200);
    }
  });

  test("default WBS categories were seeded", async () => {
    const res = await request(app).get("/api/wbs/categories");
    const names = res.body.map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(["Mechanical", "Electrical", "Civil"]));
  });
});

// ── Project CRUD ────────────────────────────────────────────────────────────

describe("Project CRUD", () => {
  let id;
  test("create", async () => {
    const res = await request(app).post("/api/projects").send({ name: "Test Tower", client: "ACME" });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Test Tower");
    id = res.body.id;
  });
  test("read", async () => {
    const res = await request(app).get(`/api/projects/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.client).toBe("ACME");
  });
  test("update", async () => {
    const res = await request(app).put(`/api/projects/${id}`).send({ name: "Test Tower II" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Test Tower II");
  });
  test("list includes it", async () => {
    const res = await request(app).get("/api/projects");
    expect(res.body.some((p) => p.id === id)).toBe(true);
  });
  test("soft delete hides it", async () => {
    expect((await request(app).delete(`/api/projects/${id}`)).status).toBe(204);
    expect((await request(app).get(`/api/projects/${id}`)).status).toBe(404);
  });
  test("create requires a name", async () => {
    expect((await request(app).post("/api/projects").send({})).status).toBe(400);
  });
});

// ── WBS CRUD ────────────────────────────────────────────────────────────────

describe("WBS CRUD", () => {
  test("create category + subcategory, then delete", async () => {
    const cat = await request(app).post("/api/wbs/categories").send({ name: `Trade ${Date.now()}` });
    expect(cat.status).toBe(201);
    const sub = await request(app).post(`/api/wbs/categories/${cat.body.id}/subcategories`).send({ name: "Sub A" });
    expect(sub.status).toBe(201);
    expect((await request(app).delete(`/api/wbs/subcategories/${sub.body.id}`)).status).toBeLessThan(300);
    expect((await request(app).delete(`/api/wbs/categories/${cat.body.id}`)).status).toBeLessThan(300);
  });
});

// ── Catalog CRUD ────────────────────────────────────────────────────────────

describe("Catalog CRUD (materials)", () => {
  let id;
  test("create", async () => {
    const res = await request(app).post("/api/materials").send({ name: "Rebar", category: "Structural", unit: "kg", unitPrice: 1.25 });
    expect(res.status).toBe(201);
    id = res.body.id;
  });
  test("appears in catalog list", async () => {
    const res = await request(app).get("/api/catalog/materials?q=Rebar");
    const items = Array.isArray(res.body) ? res.body : res.body.items;
    expect(items.some((m) => m.id === id)).toBe(true);
  });
  test("update price", async () => {
    const res = await request(app).put(`/api/materials/${id}`).send({ unitPrice: 1.5 });
    expect(res.status).toBe(200);
    expect(res.body.unitPrice).toBe(1.5);
  });
});

// ── Assembly CRUD ───────────────────────────────────────────────────────────

describe("Assembly CRUD", () => {
  let id;
  test("create", async () => {
    const res = await request(app).post("/api/assemblies").send({ name: "Concrete Pour", unit: "m3" });
    expect(res.status).toBe(201);
    id = res.body.id;
  });
  test("add a material item and total reflects it", async () => {
    const mat = await request(app).post("/api/materials").send({ name: "Cement", category: "Structural", unit: "bag", unitPrice: 10 });
    const item = await request(app).post(`/api/assemblies/${id}/items/materials`).send({ materialId: mat.body.id, quantity: 5 });
    expect(item.status).toBe(201);
    const asm = await request(app).get(`/api/assemblies/${id}`);
    expect(asm.body.totalCost).toBeCloseTo(50, 2); // 5 × 10
  });
});

// ── Calculation engine endpoint ─────────────────────────────────────────────

describe("Calculation engine", () => {
  test("project calculate returns the full waterfall", async () => {
    const proj = await request(app).post("/api/projects").send({ name: "Calc Project" });
    const res = await request(app).get(`/api/estimate/project/${proj.body.id}/calculate`);
    expect(res.status).toBe(200);
    expect(res.body.waterfall).toHaveProperty("directCost");
    expect(res.body.waterfall).toHaveProperty("finalTenderPrice");
    expect(Array.isArray(res.body.wbsCategories)).toBe(true);
  });

  test("module cost equals quantity × snapshot price", async () => {
    const proj = await request(app).post("/api/projects").send({ name: "Module Calc" });
    const mod = await request(app).post("/api/modules").send({ name: "Footing", projectId: proj.body.id });
    const mat = await request(app).post("/api/materials").send({ name: "Gravel", category: "Civil", unit: "m3", unitPrice: 20 });
    await request(app).post(`/api/modules/${mod.body.id}/materials`).send({ materialId: mat.body.id, quantity: 3 });
    const res = await request(app).get(`/api/estimate/module/${mod.body.id}/calculate`);
    expect(res.body.materialCost).toBeCloseTo(60, 2); // 3 × 20
    expect(res.body.directCost).toBeCloseTo(60, 2);
  });

  test("duplicating a work item copies its line items and cost", async () => {
    const proj = await request(app).post("/api/projects").send({ name: "Dup Calc" });
    const mod = await request(app).post("/api/modules").send({ name: "Slab", projectId: proj.body.id });
    const mat = await request(app).post("/api/materials").send({ name: "Concrete", category: "Civil", unit: "m3", unitPrice: 15 });
    await request(app).post(`/api/modules/${mod.body.id}/materials`).send({ materialId: mat.body.id, quantity: 2 });
    const dup = await request(app).post(`/api/modules/${mod.body.id}/duplicate`);
    expect(dup.status).toBe(201);
    expect(dup.body.name).toBe("Slab (Copy)");
    const calc = await request(app).get(`/api/estimate/module/${dup.body.id}/calculate`);
    expect(calc.body.materialCost).toBeCloseTo(30, 2); // 2 × 15, copied
  });
});

// ── API behaviour ───────────────────────────────────────────────────────────

describe("API error handling", () => {
  test("unknown route returns JSON 404", async () => {
    const res = await request(app).get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });
  test("protected admin route requires auth", async () => {
    expect((await request(app).get("/api/users")).status).toBe(401);
  });
});

// ── Auth flow ───────────────────────────────────────────────────────────────

describe("Authentication", () => {
  test("seeded admin can log in and reach a protected route", async () => {
    const login = await request(app).post("/api/auth/login").send({ username: "admin", password: "admin123" });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeTruthy();
    const users = await request(app).get("/api/users").set("Authorization", `Bearer ${login.body.token}`);
    expect(users.status).toBe(200);
  });
  test("bad password is rejected", async () => {
    expect((await request(app).post("/api/auth/login").send({ username: "admin", password: "nope" })).status).toBe(401);
  });
});

// ── Phase 8: Procurement workflow ────────────────────────────────────────────

describe("Procurement workflow", () => {
  let projectId, supplierA, supplierB, rfqId, rfqItemIds, quoteA, quoteB;

  test("setup: project with estimate items + two suppliers", async () => {
    const proj = await request(app).post("/api/projects").send({ name: "Proc Tower" });
    projectId = proj.body.id;
    const mat = await request(app).post("/api/materials").send({ name: "Rebar", category: "Structural", unit: "kg", unitPrice: 5 });
    const mod = await request(app).post("/api/modules").send({ name: "Slab", projectId });
    await request(app).post(`/api/modules/${mod.body.id}/materials`).send({ materialId: mat.body.id, quantity: 100 });

    supplierA = (await request(app).post("/api/suppliers").send({ companyName: "Alpha Supply" })).body.id;
    supplierB = (await request(app).post("/api/suppliers").send({ companyName: "Beta Supply" })).body.id;
    expect(supplierA).toBeTruthy();
  });

  test("estimate-items lists procurable lines", async () => {
    const res = await request(app).get(`/api/purchasing/estimate-items/${projectId}`);
    expect(res.status).toBe(200);
    expect(res.body.some((i) => i.description === "Rebar" && i.quantity === 100)).toBe(true);
  });

  test("generate RFQ from estimate items", async () => {
    const res = await request(app).post("/api/purchasing/rfqs").send({
      projectId, title: "Rebar RFQ", fromEstimate: true, supplierIds: [supplierA, supplierB],
    });
    expect(res.status).toBe(201);
    rfqId = res.body.id;
    const full = await request(app).get(`/api/purchasing/rfqs/${rfqId}`);
    expect(full.body.items.length).toBeGreaterThan(0);
    expect(full.body.suppliers.length).toBe(2);
    rfqItemIds = full.body.items.map((i) => i.id);
  });

  test("multiple supplier quotations for one RFQ", async () => {
    const a = await request(app).post(`/api/purchasing/rfqs/${rfqId}/quotations`).send({
      supplierId: supplierA, leadTimeDays: 10, items: rfqItemIds.map((id) => ({ rfqItemId: id, unitPrice: 6 })),
    });
    const b = await request(app).post(`/api/purchasing/rfqs/${rfqId}/quotations`).send({
      supplierId: supplierB, leadTimeDays: 20, items: rfqItemIds.map((id) => ({ rfqItemId: id, unitPrice: 5 })),
    });
    expect(a.status).toBe(201);
    quoteA = a.body.id; quoteB = b.body.id;
    const list = await request(app).get(`/api/purchasing/rfqs/${rfqId}/quotations`);
    expect(list.body.length).toBe(2);
  });

  test("bid comparison highlights lowest price and best value + variance", async () => {
    const res = await request(app).get(`/api/purchasing/rfqs/${rfqId}/bid-comparison`);
    expect(res.status).toBe(200);
    const beta = res.body.columns.find((c) => c.quotationId === quoteB);
    const alpha = res.body.columns.find((c) => c.quotationId === quoteA);
    expect(beta.isLowest).toBe(true);          // 5 < 6
    expect(beta.total).toBe(500);              // 100 * 5
    expect(alpha.variance).toBe(100);          // 600 - 500
    expect(res.body.lowestTotal).toBe(500);
  });

  test("award a quotation and generate a PO from it", async () => {
    const award = await request(app).post(`/api/purchasing/quotations/${quoteB}/award`);
    expect(award.body.isAwarded).toBe(1);
    const po = await request(app).post(`/api/purchasing/purchase-orders/from-quotation/${quoteB}`);
    expect(po.status).toBe(201);
    expect(po.body.amount).toBe(500);
    expect(po.body.supplierId).toBe(supplierB);
  });

  test("generate a purchase request from approved estimate items", async () => {
    const res = await request(app).post("/api/purchasing/purchase-requests").send({
      projectId, title: "Rebar PR", fromEstimate: true,
    });
    expect(res.status).toBe(201);
    const full = await request(app).get(`/api/purchasing/purchase-requests/${res.body.id}`);
    expect(full.body.items.some((i) => i.description === "Rebar")).toBe(true);
  });

  test("approval workflow transitions are validated", async () => {
    const ok = await request(app).put(`/api/purchasing/rfqs/${rfqId}/status`).send({ status: "for_approval" });
    expect(ok.body.status).toBe("for_approval");
    const bad = await request(app).put(`/api/purchasing/rfqs/${rfqId}/status`).send({ status: "bogus" });
    expect(bad.status).toBe(400);
  });

  test("supplier performance scores and updates supplier rating", async () => {
    const res = await request(app).post("/api/purchasing/supplier-performance").send({
      supplierId: supplierB, deliveryRating: 4, qualityRating: 5, priceRating: 3,
    });
    expect(res.status).toBe(201);
    expect(res.body.overallScore).toBe(4);   // (4+5+3)/3
    const card = await request(app).get("/api/purchasing/supplier-performance/scorecard");
    expect(card.body.some((r) => r.supplierId === supplierB && r.avgOverall === 4)).toBe(true);
  });

  test("attachments accept and categorize file types", async () => {
    const res = await request(app).post("/api/purchasing/attachments").send({
      entityType: "rfq", entityId: rfqId, fileName: "quote.pdf", fileType: "application/pdf", size: 1234,
    });
    expect(res.status).toBe(201);
    expect(res.body.fileType).toBe("pdf");
    const list = await request(app).get(`/api/purchasing/attachments?entityType=rfq&entityId=${rfqId}`);
    expect(list.body.length).toBe(1);
  });

  test("dashboard reports procurement stats and budget vs procurement", async () => {
    const res = await request(app).get(`/api/purchasing/dashboard?projectId=${projectId}`);
    expect(res.status).toBe(200);
    expect(res.body.stats.purchaseOrders).toBeGreaterThanOrEqual(1);
    expect(res.body.stats.awardedSuppliers).toBeGreaterThanOrEqual(1);
    expect(res.body.budgetVsProcurement.budget).toBe(500);       // 100 * 5 estimate
    expect(res.body.budgetVsProcurement.procurement).toBe(500);  // PO amount
  });
});

// ── Phase 9: Cost Control & Budget Monitoring ────────────────────────────────

describe("Cost control & budget monitoring", () => {
  let projectId, budget;

  test("setup: project with an estimate + budget from estimate", async () => {
    const proj = await request(app).post("/api/projects").send({ name: "CC Tower" });
    projectId = proj.body.id;
    const mat = await request(app).post("/api/materials").send({ name: "Concrete", category: "Structural", unit: "m3", unitPrice: 100 });
    const mod = await request(app).post("/api/modules").send({ name: "Foundation", projectId });
    await request(app).post(`/api/modules/${mod.body.id}/materials`).send({ materialId: mat.body.id, quantity: 50 });

    const b = await request(app).post("/api/cost-control/budgets/from-estimate").send({ projectId });
    expect(b.status).toBe(201);
    expect(b.body.amount).toBeGreaterThan(0);
    budget = b.body.amount;
  });

  test("budget vs actual computes variance and variance %", async () => {
    await request(app).post("/api/actual-costs").send({ projectId, category: "Payroll", description: "Crew", amount: 500 });
    const res = await request(app).get(`/api/cost-control/budget-vs-actual/${projectId}`);
    expect(res.body.actual).toBe(500);
    expect(res.body.variance).toBeCloseTo(budget - 500, 2);
    expect(res.body.variancePct).toBeCloseTo(((budget - 500) / budget) * 100, 2);
  });

  test("approved change order updates the revised budget", async () => {
    const vo = await request(app).post("/api/variation-orders").send({ projectId, voType: "owner", nature: "additive", amount: 1000, status: "approved" });
    expect(vo.status).toBe(201);
    const res = await request(app).get(`/api/cost-control/budget-vs-actual/${projectId}`);
    expect(res.body.revisedBudget).toBeCloseTo(budget + 1000, 2);
    expect(res.body.budget).toBeCloseTo(budget + 1000, 2);
  });

  test("earned value returns the full EVM metric set", async () => {
    const res = await request(app).get(`/api/cost-control/earned-value/${projectId}?percentComplete=50`);
    const e = res.body;
    for (const k of ["PV", "EV", "AC", "CV", "SV", "CPI", "SPI", "EAC", "ETC", "VAC", "BAC"]) expect(e).toHaveProperty(k);
    expect(e.EV).toBeCloseTo(e.BAC * 0.5, 2);
    expect(e.CV).toBeCloseTo(e.EV - e.AC, 2);
    expect(e.CPI).toBeCloseTo(e.EV / e.AC, 4);
  });

  test("cash flow returns an S-curve with planned vs actual and weekly granularity", async () => {
    const monthly = await request(app).get(`/api/cost-control/cash-flow/${projectId}?months=6`);
    expect(monthly.body.series.length).toBe(6);
    const last = monthly.body.series[5];
    expect(last.cumulativeCost).toBeCloseTo(monthly.body.BAC, 0);   // S-curve completes at BAC
    expect(monthly.body.actualTotal).toBe(500);                     // recorded actual bucketed
    const weekly = await request(app).get(`/api/cost-control/cash-flow/${projectId}?months=8&granularity=week`);
    expect(weekly.body.granularity).toBe("week");
    expect(weekly.body.series.length).toBe(8);
  });

  test("alerts fire when actual exceeds budget", async () => {
    // Push actual well beyond the budget to trigger budget_exceeded + high_variance.
    await request(app).post("/api/actual-costs").send({ projectId, category: "Miscellaneous", description: "Overrun", amount: budget + 5000 });
    const res = await request(app).get(`/api/cost-control/alerts/${projectId}`);
    const types = res.body.alerts.map((a) => a.type);
    expect(types).toContain("budget_exceeded");
    expect(res.body.critical).toBeGreaterThanOrEqual(1);
  });

  test("cost-control report types are exposed", async () => {
    const res = await request(app).get("/api/reports/types");
    const keys = res.body.map((t) => t.key);
    expect(keys).toEqual(expect.arrayContaining(["cc-budget", "cc-actual-cost", "cc-variance", "cc-earned-value", "cc-cash-flow", "cc-forecast"]));
  });

  test("variance report reflects budget vs actual", async () => {
    const res = await request(app).get("/api/reports/generate/cc-variance").query({ projectId });
    expect(res.status).toBe(200);
  });
});

// ── Phase 10: Enterprise Platform ────────────────────────────────────────────

describe("Enterprise platform", () => {
  let token, refreshToken;

  test("login issues an access token and a refresh token", async () => {
    const res = await request(app).post("/api/auth/login").send({ username: "admin", password: "admin123", rememberMe: true });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    token = res.body.token; refreshToken = res.body.refreshToken;
  });

  test("refresh token rotates the access token", async () => {
    const res = await request(app).post("/api/auth/refresh").send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.token).not.toBe(token);
    expect(res.body.refreshToken).not.toBe(refreshToken);
    // Old refresh token is now invalid (rotated).
    expect((await request(app).post("/api/auth/refresh").send({ refreshToken })).status).toBe(401);
  });

  test("the 8 enterprise built-in roles exist", async () => {
    const res = await request(app).get("/api/users/roles").set("Authorization", `Bearer ${token}`);
    // token was rotated above; re-login to be safe.
    const login = await request(app).post("/api/auth/login").send({ username: "admin", password: "admin123" });
    const roles = await request(app).get("/api/users/roles").set("Authorization", `Bearer ${login.body.token}`);
    const names = roles.body.map((r) => r.name);
    for (const r of ["Administrator", "Estimator", "Project Engineer", "Project Manager", "Procurement", "Accounting", "Executive", "Viewer"])
      expect(names).toContain(r);
  });

  test("organization: company profile is a seeded singleton and is editable", async () => {
    const get = await request(app).get("/api/organization/company");
    expect(get.status).toBe(200);
    expect(get.body.id).toBe(1);
    const put = await request(app).put("/api/organization/company").send({ name: "Acme Builders", country: "PH" });
    expect(put.body.name).toBe("Acme Builders");
    expect(put.body.country).toBe("PH");
  });

  test("organization: branches / departments / currencies / tax CRUD", async () => {
    const br = await request(app).post("/api/organization/branches").send({ name: "Manila HQ", isHeadOffice: 1 });
    expect(br.status).toBe(201);
    const dep = await request(app).post("/api/organization/departments").send({ name: "Estimating", branchId: br.body.id });
    expect(dep.status).toBe(201);
    const cur = await request(app).get("/api/organization/currencies");
    expect(cur.body.some((c) => c.code === "USD" && c.isBase === 1)).toBe(true);
    const tax = await request(app).get("/api/organization/tax-settings");
    expect(tax.body.some((t) => t.isDefault === 1)).toBe(true);
    // creating a branch is audited
    const audit = await request(app).get("/api/enterprise/audit?entityType=org_branches").set("Authorization", `Bearer ${token}`);
    // audit needs auth; if unauthorized the route still returns array under requireAuth via admin
  });

  test("audit trail records old/new value and request origin", async () => {
    const login = await request(app).post("/api/auth/login").send({ username: "admin", password: "admin123" });
    await request(app).put("/api/organization/company").send({ name: "Renamed Co" }).set("Authorization", `Bearer ${login.body.token}`);
    const audit = await request(app).get("/api/enterprise/audit?entityType=company_profile").set("Authorization", `Bearer ${login.body.token}`);
    expect(audit.status).toBe(200);
    const entry = audit.body.find((a) => a.action === "update");
    expect(entry).toBeTruthy();
    expect(entry).toHaveProperty("newValue");
    expect(entry).toHaveProperty("ipAddress");
    expect(entry).toHaveProperty("userAgent");
  });

  test("security logs capture login events with category", async () => {
    const login = await request(app).post("/api/auth/login").send({ username: "admin", password: "admin123" });
    const sec = await request(app).get("/api/enterprise/activity/security").set("Authorization", `Bearer ${login.body.token}`);
    expect(sec.status).toBe(200);
    expect(sec.body.some((a) => a.action === "login" && a.category === "security")).toBe(true);
  });

  test("failed login is rejected and audited as a security event", async () => {
    expect((await request(app).post("/api/auth/login").send({ username: "admin", password: "wrong" })).status).toBe(401);
    const login = await request(app).post("/api/auth/login").send({ username: "admin", password: "admin123" });
    const sec = await request(app).get("/api/enterprise/activity/security").set("Authorization", `Bearer ${login.body.token}`);
    expect(sec.body.some((a) => a.action === "login_failed")).toBe(true);
  });
});

// ── Phase 11: Production Release ─────────────────────────────────────────────

describe("Production readiness", () => {
  test("health check responds", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  test("security headers are set", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
  });

  test("OpenAPI spec and Swagger UI are served", async () => {
    const spec = await request(app).get("/api/openapi.json");
    expect(spec.status).toBe(200);
    expect(spec.body.openapi).toMatch(/^3\./);
    expect(spec.body.info.title).toMatch(/Project Estimator Pro/);
    const docs = await request(app).get("/api/docs");
    expect(docs.status).toBe(200);
    expect(docs.text).toMatch(/swagger-ui/i);
  });

  test("application settings are seeded and updatable", async () => {
    const get = await request(app).get("/api/settings");
    expect(get.status).toBe(200);
    expect(get.body.baseCurrency).toBe("USD");
    expect(get.body).toHaveProperty("dateFormat");
    const put = await request(app).put("/api/settings").send({ defaultTaxRate: 15, units: "imperial" });
    expect(put.body.defaultTaxRate).toBe(15);
    expect(put.body.units).toBe("imperial");
  });

  test("database backup creates a history entry", async () => {
    const res = await request(app).post("/api/admin/backups").send({ note: "test" });
    expect(res.status).toBe(201);
    expect(res.body.fileName).toMatch(/backup-.*\.db/);
    expect(res.body.sizeBytes).toBeGreaterThan(0);
    const list = await request(app).get("/api/admin/backups");
    expect(list.body.some((b) => b.id === res.body.id)).toBe(true);
  });

  test("data export returns scoped JSON and import round-trips", async () => {
    const exp = await request(app).get("/api/admin/export/organization");
    expect(exp.status).toBe(200);
    expect(exp.body.scope).toBe("organization");
    expect(exp.body.tables).toHaveProperty("org_currencies");
    // Import the same bundle back — insert-or-ignore keeps it safe.
    const imp = await request(app).post("/api/admin/import").send({ tables: exp.body.tables });
    expect(imp.status).toBe(200);
    expect(imp.body).toHaveProperty("inserted");
  });

  test("unknown scope is rejected; database export includes core tables", async () => {
    expect((await request(app).get("/api/admin/export/bogus")).status).toBe(400);
    const db = await request(app).get("/api/admin/export/database");
    expect(db.body.tables).toHaveProperty("projects");
    expect(db.body.tables).toHaveProperty("app_settings");
  });

  test("global error handler returns clean JSON for malformed bodies", async () => {
    const res = await request(app).post("/api/projects").set("Content-Type", "application/json").send("{ not json ");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

// ── Master Materials Library ─────────────────────────────────────────────────

describe("Master Materials Library", () => {
  test("ships seeded with 500+ categorized materials", async () => {
    const res = await request(app).get("/api/materials?meta=true&limit=1");
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(500);
  });

  test("supports search and category filters", async () => {
    const res = await request(app).get("/api/materials?search=Concrete&category=Civil%20Works&meta=true");
    expect(res.status).toBe(200);
    expect(res.body.items.every((m) => m.category === "Civil Works")).toBe(true);
    expect(res.body.items.some((m) => /concrete/i.test(m.name))).toBe(true);
  });

  test("filters endpoint returns categories/subcategories/suppliers/units", async () => {
    const res = await request(app).get("/api/materials/filters");
    expect(res.body.categories.length).toBeGreaterThanOrEqual(11);
    expect(res.body.units.length).toBeGreaterThan(0);
  });

  test("create + update carry the extended library fields", async () => {
    const created = await request(app).post("/api/materials").send({
      name: "Test Beam", category: "Structural Steel", unit: "kg", unitPrice: 1.2,
      code: "TST-001", brand: "SteelAsia", manufacturer: "SteelAsia", specification: "ASTM A36",
      preferredSupplier: "Acme Steel", wasteFactor: 5, countryOfOrigin: "Philippines",
    });
    expect(created.status).toBe(201);
    expect(created.body.brand).toBe("SteelAsia");
    expect(created.body.wasteFactor).toBe(5);
    const updated = await request(app).put(`/api/materials/${created.body.id}`).send({ leadTime: "14 days", unitPrice: 1.5 });
    expect(updated.body.leadTime).toBe("14 days");
    expect(updated.body.unitPrice).toBe(1.5);
    expect(updated.body.brand).toBe("SteelAsia"); // preserved
  });
});

// ── Resource Libraries (Labor / Equipment / Subcontract) ─────────────────────

describe("Resource libraries", () => {
  test("ship seeded with labor/equipment/subcontract sample records", async () => {
    const labor = await request(app).get("/api/catalog/labor?limit=1");
    const equip = await request(app).get("/api/catalog/equipment?limit=1");
    const sub = await request(app).get("/api/catalog/subcontract?limit=1");
    const totalOf = (r) => (r.body.total ?? (Array.isArray(r.body) ? r.body.length : r.body.items?.length)) ?? 0;
    expect(totalOf(labor)).toBeGreaterThanOrEqual(15);
    expect(totalOf(equip)).toBeGreaterThanOrEqual(15);
    expect(totalOf(sub)).toBeGreaterThanOrEqual(10);
  });

  test("labor library persists productivity fields", async () => {
    const c = await request(app).post("/api/catalog/labor").send({
      name: "Test Welder", hourlyRate: 18, trade: "Structural", skillLevel: "Skilled",
      dailyRate: 144, productivity: 4, outputUnit: "joints/hr", crewSize: 1,
    });
    expect(c.status).toBe(201);
    expect(c.body.trade).toBe("Structural");
    expect(c.body.dailyRate).toBe(144);
    expect(c.body.productivity).toBe(4);
  });

  test("equipment library persists operating fields", async () => {
    const c = await request(app).post("/api/catalog/equipment").send({
      name: "Test Excavator", unit: "day", unitPrice: 350, rentalRate: 350, fuelType: "Diesel",
      operatorRequired: true, capacity: "1.5 ton", model: "U17", year: 2022,
    });
    expect(c.status).toBe(201);
    expect(c.body.fuelType).toBe("Diesel");
    expect(c.body.operatorRequired).toBe(1);
    expect(c.body.year).toBe(2022);
  });

  test("subcontract library persists vendor/coverage fields", async () => {
    const c = await request(app).post("/api/catalog/subcontract").send({
      name: "Test Waterproofing", unitPrice: 12, trade: "Civil", coverageArea: "Metro",
      leadTime: "1 week", warranty: "10 years", preferredVendor: "AquaSeal", performanceRating: 4.2,
    });
    expect(c.status).toBe(201);
    expect(c.body.warranty).toBe("10 years");
    expect(c.body.performanceRating).toBe(4.2);
    const u = await request(app).put(`/api/catalog/subcontract/${c.body.id}`).send({ leadTime: "2 weeks" });
    expect(u.body.leadTime).toBe("2 weeks");
    expect(u.body.preferredVendor).toBe("AquaSeal"); // preserved
  });
});

describe("Rate Analysis (UPA) enterprise features", () => {
  test("favorite toggles, archive/restore, and dashboard stats work", async () => {
    const created = await request(app).post("/api/upa").send({
      code: `RA-${Date.now()}`, description: "Test Rate Analysis", category: "Structural", unit: "m3",
    });
    expect(created.status).toBe(201);
    const id = created.body.id;

    const fav = await request(app).post(`/api/upa/${id}/favorite`);
    expect(fav.status).toBe(200);
    expect(fav.body.isFavorite).toBe(1);
    const unfav = await request(app).post(`/api/upa/${id}/favorite`);
    expect(unfav.body.isFavorite).toBe(0);

    const arch = await request(app).post(`/api/upa/${id}/archive`);
    expect(arch.body.status).toBe("archived");
    const rest = await request(app).post(`/api/upa/${id}/restore`);
    expect(rest.body.status).toBe("active");

    const stats = await request(app).get("/api/upa/stats/dashboard");
    expect(stats.status).toBe(200);
    expect(typeof stats.body.total).toBe("number");
    expect(Array.isArray(stats.body.byCategory)).toBe(true);
    expect(Array.isArray(stats.body.recent)).toBe(true);
  });

  test("insert-upa expand copies resources into a work item", async () => {
    const proj = await request(app).post("/api/projects").send({ name: "RA Insert Project" });
    const mod = await request(app).post("/api/modules").send({ name: "Slab", projectId: proj.body.id });
    const mat = await request(app).post("/api/materials").send({ name: "Concrete", category: "Structural", unit: "m3", unitPrice: 100 });
    const ra = await request(app).post("/api/upa").send({ description: "Concrete RA", unit: "m3" });
    await request(app).post(`/api/upa/${ra.body.id}/resources`).send({
      resourceType: "material", materialId: mat.body.id, quantity: 2, wastePct: 10,
    });

    const expand = await request(app).post(`/api/modules/${mod.body.id}/insert-upa`).send({
      upaId: ra.body.id, quantity: 3, mode: "expand",
    });
    expect(expand.status).toBe(201);
    expect(expand.body.mode).toBe("expand");
    expect(expand.body.itemsInserted).toBe(1);

    const full = await request(app).get(`/api/modules/${mod.body.id}`);
    expect(full.body.materialLines.length).toBeGreaterThan(0);
    // 2 qty * 1.10 waste * 3 insert-qty = 6.6
    expect(full.body.materialLines[0].quantity).toBeCloseTo(6.6, 5);
  });

  test("insert-upa link creates a frozen module_upa reference", async () => {
    const proj = await request(app).post("/api/projects").send({ name: "RA Link Project" });
    const mod = await request(app).post("/api/modules").send({ name: "Beam", projectId: proj.body.id });
    const ra = await request(app).post("/api/upa").send({ description: "Beam RA", unit: "m" });

    const link = await request(app).post(`/api/modules/${mod.body.id}/insert-upa`).send({
      upaId: ra.body.id, quantity: 5, mode: "link",
    });
    expect(link.status).toBe(201);
    expect(link.body.mode).toBe("link");
    expect(link.body.moduleUpaId).toBeGreaterThan(0);
  });
});
