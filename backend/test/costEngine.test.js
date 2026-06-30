import { test } from "node:test";
import assert from "node:assert/strict";
import { applyIndirectCosts } from "../src/services/costEngine.js";

// The indirect-cost waterfall is the financial heart of the engine. These
// tests pin the order of operations and every item method/scope combination.

function item(over) {
  return { id: 1, name: "x", kind: "indirect", method: "percentage", value: 0, appliesTo: "project", enabled: true, ...over };
}

test("empty config: final price equals direct cost", () => {
  const r = applyIndirectCosts(1000, []);
  assert.equal(r.directCost, 1000);
  assert.equal(r.indirectTotal, 0);
  assert.equal(r.subtotal, 1000);
  assert.equal(r.vatTotal, 0);
  assert.equal(r.bidPrice, 1000);
  assert.equal(r.discountTotal, 0);
  assert.equal(r.finalTenderPrice, 1000);
  assert.equal(r.retentionTotal, 0);
  assert.equal(r.netPayable, 1000);
});

test("percentage indirect applies to direct cost", () => {
  const r = applyIndirectCosts(1000, [item({ name: "Overhead", value: 10 })]);
  assert.equal(r.indirectTotal, 100);
  assert.equal(r.subtotal, 1100);
});

test("fixed indirect adds a flat amount", () => {
  const r = applyIndirectCosts(1000, [item({ name: "Mobilization", method: "fixed", value: 250 })]);
  assert.equal(r.indirectTotal, 250);
  assert.equal(r.subtotal, 1250);
});

test("fixed per-module indirect multiplies by module count", () => {
  const r = applyIndirectCosts(1000, [item({ method: "fixed", appliesTo: "module", value: 50 })], 4);
  assert.equal(r.indirectTotal, 200); // 50 * 4
});

test("percentage per-module still applies to total direct cost", () => {
  // A flat percentage gives the same result whether scoped per-project or
  // per-module, since pct*total == sum(pct*each).
  const r = applyIndirectCosts(1000, [item({ appliesTo: "module", value: 10 })], 4);
  assert.equal(r.indirectTotal, 100);
});

test("VAT applies to the subtotal, not the direct cost", () => {
  const r = applyIndirectCosts(1000, [
    item({ name: "Overhead", value: 10 }), // subtotal 1100
    item({ name: "VAT", kind: "vat", value: 15 }),
  ]);
  assert.equal(r.subtotal, 1100);
  assert.equal(r.vatTotal, 165); // 15% of 1100
  assert.equal(r.bidPrice, 1265);
});

test("discount applies to the bid price", () => {
  const r = applyIndirectCosts(1000, [
    item({ name: "VAT", kind: "vat", value: 10 }), // bid 1100
    item({ name: "Discount", kind: "discount", value: 5 }),
  ]);
  assert.equal(r.bidPrice, 1100);
  assert.equal(r.discountTotal, 55); // 5% of 1100
  assert.equal(r.finalTenderPrice, 1045);
});

test("retention is a memo against the final tender price", () => {
  const r = applyIndirectCosts(1000, [item({ name: "Retention", kind: "retention", value: 10 })]);
  assert.equal(r.finalTenderPrice, 1000); // retention does not change the price
  assert.equal(r.retentionTotal, 100);
  assert.equal(r.netPayable, 900);
});

test("disabled items are ignored", () => {
  const r = applyIndirectCosts(1000, [item({ value: 10, enabled: false })]);
  assert.equal(r.indirectTotal, 0);
  assert.equal(r.finalTenderPrice, 1000);
});

test("full waterfall in correct order", () => {
  const r = applyIndirectCosts(1000, [
    item({ name: "Overhead", value: 8 }),
    item({ name: "Profit", value: 10 }),
    item({ name: "Contingency", value: 5 }),
    item({ name: "VAT", kind: "vat", value: 15 }),
    item({ name: "Discount", kind: "discount", value: 2 }),
    item({ name: "Retention", kind: "retention", value: 10 }),
  ]);
  // indirect = 23% of 1000 = 230
  assert.equal(r.indirectTotal, 230);
  assert.equal(r.subtotal, 1230);
  // vat = 15% of 1230 = 184.5
  assert.equal(r.vatTotal, 184.5);
  assert.equal(r.bidPrice, 1414.5);
  // discount = 2% of 1414.5 = 28.29
  assert.equal(r.discountTotal, 28.29);
  assert.equal(r.finalTenderPrice, 1386.21);
  // retention = 10% of 1386.21
  assert.ok(Math.abs(r.retentionTotal - 138.621) < 1e-9);
  assert.ok(Math.abs(r.netPayable - 1247.589) < 1e-9);
});

test("multiple indirect lines accumulate and are itemised", () => {
  const r = applyIndirectCosts(1000, [
    item({ id: 1, name: "A", value: 5 }),
    item({ id: 2, name: "B", method: "fixed", value: 100 }),
  ]);
  assert.equal(r.indirectLines.length, 2);
  assert.equal(r.indirectTotal, 150); // 50 + 100
  assert.equal(r.indirectLines[0].amount, 50);
  assert.equal(r.indirectLines[1].amount, 100);
});
