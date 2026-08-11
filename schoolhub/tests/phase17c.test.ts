/*
 * Phase 17c pure-logic tests. Run: tsx tests/phase17c.test.ts
 * Covers PII masking + platform-staff access grants, announcement audience +
 * channel gating, event/trip update sets + progress, and the report builder.
 */
import assert from "node:assert";
import { canSeePII, maskName, maskField, viewPupil, validateGrant } from "../src/lib/pii-logic";
import { normalizeChannels, resolveAudience, deliverableChannels, planAnnouncement, validateAnnouncement } from "../src/lib/announce-logic";
import { STANDARD_EVENT_UPDATES, updateSet, isValidUpdate, customKey, makeCustomUpdate, tripProgress, reportRollup } from "../src/lib/event-updates-logic";
import { buildReport, sectionToCsv, totalize, isValidReportType } from "../src/lib/report-builder-logic";

let passed = 0, failed = 0;
function test(n: string, fn: () => void) { try { fn(); passed++; console.log("  ✓ " + n); } catch (e: any) { failed++; console.log("  ✗ " + n + "\n      " + (e?.message || e)); } }
function group(n: string) { console.log("\n" + n); }

const NOW = new Date("2026-08-10T12:00:00Z");
const future = new Date(NOW.getTime() + 3600_000);
const past = new Date(NOW.getTime() - 3600_000);

group("PII masking + access");
test("in-tenant parent/teacher see PII; platform staff do not", () => {
  assert.ok(canSeePII({ isPlatformStaff: false, roles: ["Parent"] }));
  assert.ok(canSeePII({ isPlatformStaff: false, roles: ["Teacher"] }));
  assert.ok(!canSeePII({ isPlatformStaff: true }, { schoolId: "s1" }));
});
test("platform staff see PII only with a live, school-matched grant", () => {
  const grant = { schoolId: "s1", grantedByUserId: "adminU", grantedToUserId: "staffU", expiresAt: future };
  assert.ok(canSeePII({ isPlatformStaff: true }, { schoolId: "s1", grant, now: NOW }));
  assert.ok(!canSeePII({ isPlatformStaff: true }, { schoolId: "s2", grant, now: NOW })); // wrong school
  assert.ok(!canSeePII({ isPlatformStaff: true }, { schoolId: "s1", grant: { ...grant, expiresAt: past }, now: NOW })); // expired
});
test("maskName + maskField", () => {
  assert.strictEqual(maskName("Ella Blake"), "E••• B••••");
  assert.strictEqual(maskName(""), "•••");
  assert.match(maskField("ella@northwind.test", "email"), /^e•••@n/);
  assert.strictEqual(maskField("+44 7911 123456", "phone"), "•••••3456");
  assert.strictEqual(maskField("2015-04-02", "dob"), "••/••/••••");
});
test("viewPupil masks for platform staff, reveals for parent", () => {
  const pupil = { fullName: "Ella Blake", email: "ella@x.com", dob: "2015-04-02", ref: "STU-1" };
  const masked = viewPupil(pupil, { isPlatformStaff: true }, { schoolId: "s1" });
  assert.strictEqual(masked._piiMasked, true);
  assert.strictEqual(masked.fullName, "E••• B••••");
  assert.strictEqual(masked.ref, "STU-1"); // non-PII untouched
  const raw = viewPupil(pupil, { isPlatformStaff: false, roles: ["Parent"] });
  assert.strictEqual(raw._piiMasked, false);
  assert.strictEqual(raw.fullName, "Ella Blake");
});
test("validateGrant requires future expiry", () => {
  assert.ok(validateGrant({ schoolId: "s1", grantedToUserId: "u", expiresAt: future }, NOW).ok);
  assert.strictEqual(validateGrant({ schoolId: "s1", grantedToUserId: "u", expiresAt: past }, NOW).reason, "expiry must be in the future");
});

group("announcements");
const recips = [
  { userId: "p1", year: "4", className: "4B", email: "a@x.com", phone: "111", smsOptOut: false, whatsappOptIn: true },
  { userId: "p2", year: "4", className: "4A", email: "b@x.com", phone: "222", smsOptOut: true,  whatsappOptIn: false },
  { userId: "p3", year: "5", className: "5A", email: null,       phone: "333", smsOptOut: false, whatsappOptIn: false },
];
test("normalizeChannels always includes in-app, drops junk", () => {
  assert.deepStrictEqual(normalizeChannels(["email", "bogus"]), ["inapp", "email"]);
  assert.deepStrictEqual(normalizeChannels([]), ["inapp"]);
});
test("resolveAudience by all/year/class/list", () => {
  assert.strictEqual(resolveAudience(recips, { kind: "all" }).length, 3);
  assert.strictEqual(resolveAudience(recips, { kind: "year", years: ["4"] }).length, 2);
  assert.strictEqual(resolveAudience(recips, { kind: "class", classes: ["4B"] }).length, 1);
  assert.strictEqual(resolveAudience(recips, { kind: "list", userIds: ["p1", "p3"] }).length, 2);
});
test("deliverableChannels honours consent + contactability", () => {
  assert.deepStrictEqual(deliverableChannels(recips[0], ["inapp", "email", "sms", "whatsapp"]), ["inapp", "email", "sms", "whatsapp"]);
  assert.deepStrictEqual(deliverableChannels(recips[1], ["email", "sms", "whatsapp"]).sort(), ["email"]); // sms opt-out, no whatsapp opt-in
  assert.deepStrictEqual(deliverableChannels(recips[2], ["email", "sms"]), ["sms"]); // no email, sms ok
});
test("planAnnouncement rolls up per-channel counts", () => {
  const plan = planAnnouncement(recips, { kind: "all" }, ["email", "sms", "whatsapp"]);
  assert.strictEqual(plan.targeted, 3);
  assert.strictEqual(plan.perChannel.inapp, 3);
  assert.strictEqual(plan.perChannel.email, 2); // p3 has no email
  assert.strictEqual(plan.perChannel.sms, 2);   // p2 opted out
  assert.strictEqual(plan.perChannel.whatsapp, 1); // only p1 opted in
});
test("validateAnnouncement", () => {
  assert.ok(validateAnnouncement({ title: "Hi", body: "x", audience: { kind: "all" }, channels: ["email"] }).ok);
  assert.strictEqual(validateAnnouncement({ title: "", body: "x", audience: { kind: "all" } }).reason, "title required");
  assert.strictEqual(validateAnnouncement({ title: "a", body: "b", audience: { kind: "nope" } as any }).reason, "valid audience required");
});

group("event / trip updates");
test("standard set + remove + custom", () => {
  const set = updateSet({ removed: ["traffic"], custom: [makeCustomUpdate("Lunch stop", "🍽️")] });
  assert.ok(!set.some((u) => u.key === "traffic"));
  assert.ok(set.some((u) => u.key === "custom_lunch_stop"));
  assert.ok(isValidUpdate("journey_started", set));
  assert.ok(!isValidUpdate("traffic", set));
});
test("customKey slugifies", () => {
  assert.strictEqual(customKey("Lunch Stop!"), "custom_lunch_stop");
});
test("tripProgress detects completion + current status", () => {
  const events = [{ type: "journey_started", at: "2026-08-10T08:00:00Z" }, { type: "arrived", at: "2026-08-10T09:00:00Z" }];
  const p = tripProgress(events);
  assert.strictEqual(p.updates, 2);
  assert.strictEqual(p.complete, false);
  assert.strictEqual(p.currentStatus, "Arrived at venue");
  const done = tripProgress([...events, { type: "back_at_school", at: "2026-08-10T15:00:00Z" }]);
  assert.strictEqual(done.complete, true);
});
test("reportRollup aggregates across trips", () => {
  const r = reportRollup([
    { events: [{ type: "journey_started", at: NOW }, { type: "back_at_school", at: NOW }] },
    { events: [{ type: "journey_started", at: NOW }] },
  ]);
  assert.strictEqual(r.trips, 2);
  assert.strictEqual(r.totalUpdates, 3);
  assert.strictEqual(r.completed, 1);
  assert.strictEqual(r.byType["journey_started"], 2);
});

group("report builder");
test("isValidReportType", () => {
  assert.ok(isValidReportType("usage"));
  assert.ok(!isValidReportType("nope"));
});
test("buildReport usage + totals", () => {
  const rep = buildReport("usage", { roles: [{ role: "Parent", users: 980, logins: 6140, volume: 28400 }, { role: "Teacher", users: 180, logins: 3020, volume: 41900 }] });
  assert.strictEqual(rep.sections.length, 1);
  assert.strictEqual(rep.sections[0].totals!.users, 1160);
  assert.strictEqual(rep.sections[0].totals!.volume, 70300);
});
test("sectionToCsv escapes + totals", () => {
  const rep = buildReport("subscription", { subs: [{ who: "Northwind, Academy", plan: "Premium", amountMinor: 9600, status: "active", renews: "2027" }] });
  const csv = sectionToCsv(rep.sections[0]);
  assert.ok(csv.includes('"Northwind, Academy"')); // comma escaped
  assert.ok(csv.includes("Total"));
});
test("totalize only sums numeric/money columns", () => {
  const cols = [{ key: "a", label: "A", kind: "text" as const }, { key: "b", label: "B", kind: "number" as const }];
  assert.deepStrictEqual(totalize([{ a: "x", b: 2 }, { a: "y", b: 3 }], cols), { b: 5 });
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
