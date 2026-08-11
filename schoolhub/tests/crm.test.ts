/*
 * CRM + Phase 17 pure-logic unit tests. Run: tsx tests/crm.test.ts
 * Covers: email normalise/validate, unsubscribe token HMAC round-trip,
 * audience filter matching + role resolution, recipient de-dup, campaign
 * state machine + send eligibility, merge-tag rendering, stat rollups,
 * integration reference preview, multi-driver roster rules, and parent-
 * subscription summary maths.
 */
import assert from "node:assert";
import {
  normalizeEmail, isValidEmail, unsubToken, verifyUnsubToken,
  normalizeFilter, contactMatches, rolesForFilter, dedupeRecipients,
  canTransition, canSendNow, renderTemplate, firstName, rollup, audienceToRole, isValidAudience,
} from "../src/lib/crm-logic";
import { buildPreview, similarIntegrations } from "../src/lib/integration-preview";
import { validateRoster, ensurePrimary, effectiveDriver, primaryDriver, normalizeAssignments } from "../src/lib/route-drivers-logic";
import { summarize, bySchool, monthlyMinor, formatGBP } from "../src/lib/parent-sub-logic";

let passed = 0, failed = 0;
function test(n: string, fn: () => void) { try { fn(); passed++; console.log("  ✓ " + n); } catch (e: any) { failed++; console.log("  ✗ " + n + "\n      " + (e?.message || e)); } }
function group(n: string) { console.log("\n" + n); }

const NOW = new Date("2026-08-07T12:00:00Z");
const future = new Date(NOW.getTime() + 3600_000);
const past = new Date(NOW.getTime() - 3600_000);

group("email");
test("normalize + validate", () => {
  assert.strictEqual(normalizeEmail("  Foo@Bar.COM "), "foo@bar.com");
  assert.ok(isValidEmail("a@b.co"));
  assert.ok(!isValidEmail("nope"));
  assert.ok(!isValidEmail("a@b"));
  assert.ok(!isValidEmail(""));
});

group("unsubscribe token");
test("round-trips and rejects tampering", () => {
  const tok = unsubToken("Parent@Example.com");
  assert.ok(verifyUnsubToken("parent@example.com", tok)); // case-insensitive
  assert.ok(!verifyUnsubToken("other@example.com", tok));
  assert.ok(!verifyUnsubToken("parent@example.com", tok + "x"));
  assert.ok(!verifyUnsubToken("parent@example.com", "garbage"));
});

group("audiences");
test("audience → role mapping", () => {
  assert.strictEqual(audienceToRole("parent"), "Parent");
  assert.strictEqual(audienceToRole("driver"), "Driver");
  assert.strictEqual(audienceToRole("tenant_admin"), "SchoolAdministrator");
  assert.strictEqual(audienceToRole("subscriber"), null);
  assert.ok(isValidAudience("driver"));
  assert.ok(!isValidAudience("aliens"));
});
test("filter normalises + matches contacts", () => {
  const f = normalizeFilter({ audiences: ["parent", "bogus"], tags: ["newsletter"] });
  assert.deepStrictEqual(f.audiences, ["parent"]);
  assert.strictEqual(f.status, "subscribed");
  const c1 = { email: "p@x.com", audience: "parent", status: "subscribed", tagsJson: '["newsletter","vip"]', schoolId: "s1" };
  const c2 = { email: "d@x.com", audience: "driver", status: "subscribed", tagsJson: "[]" };
  const c3 = { email: "p2@x.com", audience: "parent", status: "unsubscribed", tagsJson: '["newsletter"]' };
  assert.ok(contactMatches(c1, f));
  assert.ok(!contactMatches(c2, f));   // wrong audience
  assert.ok(!contactMatches(c3, f));   // unsubscribed
});
test("school + consent scoping", () => {
  const f = normalizeFilter({ audiences: ["parent"], schoolIds: ["s1"], consentRequired: true });
  assert.ok(contactMatches({ email: "a@x.com", audience: "parent", status: "subscribed", schoolId: "s1", consent: true, tagsJson: "[]" }, f));
  assert.ok(!contactMatches({ email: "b@x.com", audience: "parent", status: "subscribed", schoolId: "s2", consent: true, tagsJson: "[]" }, f));
  assert.ok(!contactMatches({ email: "c@x.com", audience: "parent", status: "subscribed", schoolId: "s1", consent: false, tagsJson: "[]" }, f));
});
test("rolesForFilter only returns user-backed audiences", () => {
  const f = normalizeFilter({ audiences: ["parent", "driver", "subscriber"] });
  assert.deepStrictEqual(rolesForFilter(f).sort(), ["Driver", "Parent"]);
});

group("recipient de-dup");
test("collapses duplicate emails, prefers userId + name", () => {
  const out = dedupeRecipients([
    { email: "A@x.com", name: null, contactId: "c1" },
    { email: "a@x.com", name: "Alice", userId: "u1" },
    { email: "bad", name: "Nope" },
    { email: "b@x.com", name: "Bob" },
  ]);
  assert.strictEqual(out.length, 2);
  const alice = out.find((r) => r.email === "a@x.com")!;
  assert.strictEqual(alice.name, "Alice");
  assert.strictEqual(alice.userId, "u1");
  assert.strictEqual(alice.contactId, "c1");
});

group("campaign state machine");
test("valid + invalid transitions", () => {
  assert.ok(canTransition("draft", "sending"));
  assert.ok(canTransition("scheduled", "sending"));
  assert.ok(canTransition("sending", "sent"));
  assert.ok(!canTransition("sent", "sending"));
  assert.ok(!canTransition("draft", "sent"));
});
test("canSendNow guards status, subject, schedule", () => {
  assert.ok(canSendNow({ status: "draft", subject: "Hi" }, NOW).ok);
  assert.strictEqual(canSendNow({ status: "sent", subject: "Hi" }, NOW).reason, "cannot send from 'sent'");
  assert.strictEqual(canSendNow({ status: "draft", subject: "  " }, NOW).reason, "subject required");
  assert.strictEqual(canSendNow({ status: "scheduled", subject: "Hi", scheduledFor: future }, NOW).reason, "scheduled for the future");
  assert.ok(canSendNow({ status: "scheduled", subject: "Hi", scheduledFor: past }, NOW).ok);
});

group("merge tags + stats");
test("renderTemplate substitutes and blanks unknowns", () => {
  assert.strictEqual(renderTemplate("Hi {{name}} <{{email}}>", { name: "Al", email: "a@x.com" }), "Hi Al <a@x.com>");
  assert.strictEqual(renderTemplate("Hi {{missing}}!", {}), "Hi !");
  assert.strictEqual(firstName("Alice Brown"), "Alice");
  assert.strictEqual(firstName(""), "there");
});
test("rollup computes rates off sent", () => {
  const r = rollup([{ status: "sent" }, { status: "opened" }, { status: "clicked" }, { status: "failed" }, { status: "unsubscribed" }]);
  // sent = sent+opened+clicked = 3; opened = opened+clicked = 2; clicked = 1
  assert.strictEqual(r.total, 5);
  assert.strictEqual(r.sent, 3);
  assert.strictEqual(r.failed, 1);
  assert.strictEqual(r.unsub, 1);
  assert.strictEqual(r.openRate, Math.round((2 / 3) * 1000) / 10);
  assert.strictEqual(r.clickRate, Math.round((1 / 3) * 1000) / 10);
});

group("integration reference preview");
const integ = [
  { id: "i1", name: "ClassCharts", connectorKey: "classcharts", category: "behaviour", status: "connected", supportedObjects: '["rewards","consequences"]', supportedOperations: '["read","webhook"]', lastSuccessAt: past },
  { id: "i2", name: "Old Behaviour", connectorKey: "oldb", category: "behaviour", status: "connected", supportedObjects: '["rewards"]', lastSuccessAt: new Date(past.getTime() - 99999) },
  { id: "i3", name: "SIMS", connectorKey: "sims", category: "mis", status: "connected" },
];
test("similarIntegrations filters, excludes, orders by recency", () => {
  const s = similarIntegrations(integ, "behaviour", "oldb");
  assert.strictEqual(s.length, 1);
  assert.strictEqual(s[0].connectorKey, "classcharts");
});
test("buildPreview surfaces objects + reference + sample", () => {
  const p = buildPreview({ category: "behaviour", all: integ, excludeConnectorKey: "newconn", sample: { pupil: "A. Pupil", type: "reward", points: 3 } });
  assert.strictEqual(p.referenceSystem, "ClassCharts");
  assert.deepStrictEqual(p.objects, ["rewards", "consequences"]);
  assert.deepStrictEqual(p.sample, { pupil: "A. Pupil", type: "reward", points: 3 });
});
test("buildPreview falls back to category defaults when nothing connected", () => {
  const p = buildPreview({ category: "catering", all: integ });
  assert.strictEqual(p.referenceSystem, null);
  assert.ok(p.objects.includes("menus"));
});

group("multi-driver roster");
test("normalise dedupes driver+session and defaults role/session", () => {
  const a = normalizeAssignments([
    { driverUserId: "d1", role: "primary" },
    { driverUserId: "d1", role: "relief" }, // dup (same session 'all') -> dropped
    { driverUserId: "d2", session: "pm" },
  ]);
  assert.strictEqual(a.length, 2);
  assert.strictEqual(a[0].session, "all");
});
test("validate rejects empty + multiple primaries + all/am clash", () => {
  assert.ok(!validateRoster([]).ok);
  assert.ok(!validateRoster([{ driverUserId: "d1", role: "primary" }, { driverUserId: "d2", role: "primary" }]).ok);
  assert.ok(!validateRoster([{ driverUserId: "d1", session: "all" }, { driverUserId: "d1", session: "am" }]).ok);
  assert.ok(validateRoster([{ driverUserId: "d1", role: "primary" }, { driverUserId: "d2", role: "relief" }]).ok);
});
test("ensurePrimary + primaryDriver + effectiveDriver", () => {
  const roster = ensurePrimary([{ driverUserId: "d1" }, { driverUserId: "d2", session: "pm" }]);
  assert.strictEqual(roster[0].role, "primary");
  assert.strictEqual(primaryDriver(roster), "d1");
  assert.strictEqual(effectiveDriver(roster, "pm"), "d2"); // session-specific wins
  assert.strictEqual(effectiveDriver(roster, "am"), "d1"); // falls back to primary/all
});

group("parent subscription summary");
const subs = [
  { status: "active", amountMinor: 500, interval: "month", schoolId: "s1" },
  { status: "active", amountMinor: 6000, interval: "year", schoolId: "s1" },   // 500/mo
  { status: "trialing", amountMinor: 500, interval: "month", schoolId: "s2" }, // 0
  { status: "canceled", amountMinor: 500, interval: "month", schoolId: "s2" }, // 0
  { status: "past_due", amountMinor: 500, interval: "month", schoolId: "s2" }, // billable
];
test("monthlyMinor honours interval + status", () => {
  assert.strictEqual(monthlyMinor(subs[0]), 500);
  assert.strictEqual(monthlyMinor(subs[1]), 500);
  assert.strictEqual(monthlyMinor(subs[2]), 0);
});
test("summarize totals + MRR/ARR/ARPU", () => {
  const s = summarize(subs);
  assert.strictEqual(s.total, 5);
  assert.strictEqual(s.active, 2);
  assert.strictEqual(s.trialing, 1);
  assert.strictEqual(s.pastDue, 1);
  assert.strictEqual(s.paying, 3);
  assert.strictEqual(s.mrrMinor, 1500); // 500 + 500 + 500(past_due)
  assert.strictEqual(s.arrMinor, 18000);
  assert.strictEqual(s.arpuMinor, 500);
});
test("bySchool ranks by MRR", () => {
  const rows = bySchool(subs);
  assert.strictEqual(rows[0].schoolId, "s1");
  assert.strictEqual(rows[0].mrrMinor, 1000);
  assert.strictEqual(formatGBP(1500), "£15.00");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
