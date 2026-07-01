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
