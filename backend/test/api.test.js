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
