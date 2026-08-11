/*
 * Phase 17d pure-logic tests. Run: tsx tests/phase17d.test.ts
 * Covers policy acknowledgement: applicability by audience, version-aware
 * re-acknowledgement, viewer annotation, and admin status rollup. Also a light
 * check that announcement channel gating still holds (used by the real adapters).
 */
import assert from "node:assert";
import { policyAppliesTo, hasAcknowledged, needsAck, annotateForViewer, ackStatus } from "../src/lib/policy-ack-logic";
import { deliverableChannels, normalizeChannels } from "../src/lib/announce-logic";

let passed = 0, failed = 0;
function test(n: string, fn: () => void) { try { fn(); passed++; console.log("  ✓ " + n); } catch (e: any) { failed++; console.log("  ✗ " + n + "\n      " + (e?.message || e)); } }
function group(n: string) { console.log("\n" + n); }

const pol = (over: any = {}) => ({ id: "p1", version: "1.0", requireAck: true, audience: "parents", published: true, ...over });

group("policy applicability");
test("audience all vs role-specific", () => {
  assert.ok(policyAppliesTo(pol({ audience: "all" }), ["Parent"]));
  assert.ok(policyAppliesTo(pol({ audience: "parents" }), ["Parent"]));
  assert.ok(!policyAppliesTo(pol({ audience: "teachers" }), ["Parent"]));
  assert.ok(policyAppliesTo(pol({ audience: "teachers" }), ["Teacher"]));
  assert.ok(policyAppliesTo(pol({ audience: "staff" }), ["SchoolAdministrator"]));
});

group("acknowledgement state");
const acks = [
  { policyId: "p1", userId: "u1", version: "1.0", acknowledgedAt: "2026-08-01" },
  { policyId: "p1", userId: "u2", version: "0.9", acknowledgedAt: "2026-07-01" }, // old version
];
test("hasAcknowledged is version-specific", () => {
  assert.ok(hasAcknowledged(pol(), acks, "u1"));
  assert.ok(!hasAcknowledged(pol(), acks, "u2"));    // acked an older version
  assert.ok(!hasAcknowledged(pol(), acks, "u3"));
});
test("needsAck respects requireAck, audience, publish, version", () => {
  assert.ok(!needsAck(pol(), acks, { userId: "u1", roles: ["Parent"] }));      // already acked current
  assert.ok(needsAck(pol(), acks, { userId: "u2", roles: ["Parent"] }));       // acked old version → re-ack
  assert.ok(needsAck(pol(), acks, { userId: "u3", roles: ["Parent"] }));       // never acked
  assert.ok(!needsAck(pol({ requireAck: false }), acks, { userId: "u3", roles: ["Parent"] })); // ack not required
  assert.ok(!needsAck(pol({ published: false }), acks, { userId: "u3", roles: ["Parent"] }));  // unpublished
  assert.ok(!needsAck(pol({ audience: "teachers" }), acks, { userId: "u3", roles: ["Parent"] })); // not in audience
});
test("version bump re-triggers ack", () => {
  const bumped = pol({ version: "2.0" });
  assert.ok(needsAck(bumped, acks, { userId: "u1", roles: ["Parent"] })); // u1 only acked 1.0
});

group("viewer annotation");
test("annotateForViewer flags action required", () => {
  const rows = annotateForViewer([pol(), pol({ id: "p2", requireAck: false })], acks, { userId: "u3", roles: ["Parent"] });
  const p1 = rows.find(r => r.id === "p1")!;
  const p2 = rows.find(r => r.id === "p2")!;
  assert.strictEqual(p1.actionRequired, true);
  assert.strictEqual(p1.acknowledged, false);
  assert.strictEqual(p2.actionRequired, false); // ack not required
});

group("admin rollup");
test("ackStatus computes acknowledged/pending/pct", () => {
  const audience = ["u1", "u2", "u3", "u4"];
  const s = ackStatus(pol(), audience, acks); // only u1 acked current version
  assert.strictEqual(s.total, 4);
  assert.strictEqual(s.acknowledged, 1);
  assert.strictEqual(s.pending, 3);
  assert.strictEqual(s.pct, 25);
  assert.deepStrictEqual(s.pendingUserIds.sort(), ["u2", "u3", "u4"]);
});
test("ackStatus short-circuits when ack not required", () => {
  const s = ackStatus(pol({ requireAck: false }), ["u1", "u2"], []);
  assert.strictEqual(s.requireAck, false);
  assert.strictEqual(s.pct, 100);
});

group("announcement channel gating (real-adapter contract)");
test("deliverableChannels still enforces consent", () => {
  assert.deepStrictEqual(normalizeChannels(["email"]), ["inapp", "email"]);
  const r = { userId: "p", phone: "1", email: "e@x.com", smsOptOut: true, whatsappOptIn: false };
  assert.deepStrictEqual(deliverableChannels(r, ["email", "sms", "whatsapp"]), ["email"]); // sms opted out, no wa opt-in
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
