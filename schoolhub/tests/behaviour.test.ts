/*
 * Behaviour ingestion — pure-logic unit tests.
 * Run: tsx tests/behaviour.test.ts
 * Covers classification (reward vs consequence), validation, normalization
 * (idempotency id + point magnitude/sign), guardian behaviour-restriction, and
 * net-points. DB-bound ingestion (student match, upsert, provenance, notify) is
 * covered by the integration spec in the project doc.
 */
import assert from "node:assert";
import { classify, validateEvent, normalizeEvent, guardianCanSeeBehaviour, netPoints } from "../src/lib/integration/behaviour-logic";

let passed = 0, failed = 0;
function test(n: string, fn: () => void) { try { fn(); passed++; console.log("  ✓ " + n); } catch (e: any) { failed++; console.log("  ✗ " + n + "\n      " + (e?.message || e)); } }
function group(n: string) { console.log("\n" + n); }

group("classify");
test("known reward types are positive", () => {
  assert.deepStrictEqual(classify("merit", 2), { type: "merit", positive: true });
  assert.deepStrictEqual(classify("House Point", 1).positive, true);
  assert.strictEqual(classify("badge").positive, true);
});
test("known consequence types are negative", () => {
  assert.deepStrictEqual(classify("detention"), { type: "detention", positive: false });
  assert.strictEqual(classify("sanction", 1).positive, false);
  assert.strictEqual(classify("incident").positive, false);
});
test("unknown type inferred from points sign", () => {
  assert.deepStrictEqual(classify("xyz", -3), { type: "sanction", positive: false });
  assert.deepStrictEqual(classify("xyz", 5), { type: "merit", positive: true });
  assert.deepStrictEqual(classify(undefined, undefined), { type: "comment", positive: true });
});

group("validateEvent");
test("requires externalId + externalRef", () => {
  assert.ok(!validateEvent({}).ok);
  assert.ok(validateEvent({ externalId: "e1", externalRef: "STU-1" }).ok);
  assert.ok(validateEvent({ externalId: "e1", externalRef: "STU-1", points: "abc" }).issues.some(i => i.includes("points")));
  assert.ok(validateEvent({ externalId: "e1", externalRef: "STU-1", at: "nope" }).issues.some(i => i.includes("date")));
});

group("normalizeEvent");
test("normalizes a reward with magnitude + sign", () => {
  const r = normalizeEvent({ externalId: "cc-100", externalRef: "STU-1001", type: "merit", points: 2, note: "Great work", teacherName: "Mr Reed", at: "2026-08-05T09:00:00Z" })!;
  assert.strictEqual(r.externalId, "cc-100");
  assert.strictEqual(r.type, "merit");
  assert.strictEqual(r.points, 2);
  assert.strictEqual(r.positive, true);
  assert.ok(r.at instanceof Date);
});
test("negative points → consequence with positive magnitude", () => {
  const r = normalizeEvent({ externalId: "cc-101", externalRef: "STU-1001", type: "sanction", points: -1 })!;
  assert.strictEqual(r.positive, false);
  assert.strictEqual(r.points, 1); // magnitude only; sign carried by positive
});
test("returns null without identifiers; string points coerced", () => {
  assert.strictEqual(normalizeEvent({ type: "merit" }), null);
  assert.strictEqual(normalizeEvent({ externalId: "e", externalRef: "r", points: "3" })!.points, 3);
});
test("idempotency key is stable (externalId preserved)", () => {
  const a = normalizeEvent({ externalId: "cc-100", externalRef: "STU-1001", type: "merit", points: 2 })!;
  const b = normalizeEvent({ externalId: "cc-100", externalRef: "STU-1001", type: "merit", points: 9, note: "edited" })!;
  assert.strictEqual(a.externalId, b.externalId); // same id → upsert, not duplicate
});

group("guardian visibility + net");
test("behaviour restriction hides behaviour", () => {
  assert.ok(guardianCanSeeBehaviour([]));
  assert.ok(guardianCanSeeBehaviour(["medical"]));
  assert.ok(!guardianCanSeeBehaviour(["behaviour"]));
  assert.ok(!guardianCanSeeBehaviour(["Behaviour", "medical"]));
});
test("netPoints adds rewards, subtracts consequences", () => {
  assert.strictEqual(netPoints([{ points: 2, positive: true }, { points: 3, positive: true }, { points: 1, positive: false }]), 4);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
