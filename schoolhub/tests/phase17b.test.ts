/*
 * Phase 17b pure-logic tests. Run: tsx tests/phase17b.test.ts
 * Covers SIPlat staff RBAC (areas + access), usage analytics rollups, and
 * subscription renewal reporting + manual-approval override.
 */
import assert from "node:assert";
import { normalizeAreas, canAccessArea, visibleAreas, validateStaff, PLATFORM_ROLES, PLATFORM_AREAS } from "../src/lib/platform-staff-logic";
import { summarizeUser, summarizeByUser, summarizeRole } from "../src/lib/usage-logic";
import { daysUntilRenewal, reminderDue, reminderLabel, canAutoRenew, needsManualApproval, reportSummary } from "../src/lib/subscription-approval-logic";

let passed = 0, failed = 0;
function test(n: string, fn: () => void) { try { fn(); passed++; console.log("  ✓ " + n); } catch (e: any) { failed++; console.log("  ✗ " + n + "\n      " + (e?.message || e)); } }
function group(n: string) { console.log("\n" + n); }

const NOW = new Date("2026-08-10T12:00:00Z");
const daysFrom = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

group("platform staff RBAC");
test("normalizeAreas keeps wildcard, drops unknown, dedupes", () => {
  assert.deepStrictEqual(normalizeAreas(["*", "crm"]), ["*"]);
  assert.deepStrictEqual(normalizeAreas(["crm", "crm", "bogus"]), ["crm"]);
  assert.deepStrictEqual(normalizeAreas([]), []);
});
test("canAccessArea honours wildcard + explicit grants", () => {
  assert.ok(canAccessArea(["*"], "team"));
  assert.ok(canAccessArea(["crm", "templates"], "crm"));
  assert.ok(!canAccessArea(["crm"], "team"));
});
test("visibleAreas filters the nav for a role", () => {
  const sales = PLATFORM_ROLES.find(r => r.key === "sales")!;
  const nav = visibleAreas(sales.areas);
  assert.ok(nav.includes("crm"));
  assert.ok(!nav.includes("team"));       // sales can't manage staff
  assert.ok(!nav.includes("subscriptions"));
  const owner = PLATFORM_ROLES.find(r => r.key === "owner")!;
  assert.strictEqual(visibleAreas(owner.areas).length, PLATFORM_AREAS.length); // owner sees all
});
test("validateStaff checks email + known role", () => {
  const keys = PLATFORM_ROLES.map(r => r.key);
  assert.ok(validateStaff({ email: "a@siplat.co", roleKey: "support" }, keys).ok);
  assert.strictEqual(validateStaff({ email: "bad", roleKey: "support" }, keys).reason, "valid email required");
  assert.strictEqual(validateStaff({ email: "a@siplat.co", roleKey: "ghost" }, keys).reason, "unknown role");
});

group("usage analytics");
const evs = [
  { userId: "u1", role: "Parent", action: "login", at: "2026-08-01T08:00:00Z" },
  { userId: "u1", role: "Parent", action: "view", area: "transport", at: "2026-08-01T08:05:00Z" },
  { userId: "u1", role: "Parent", action: "view", area: "reports", at: "2026-08-02T09:00:00Z" },
  { userId: "u1", role: "Parent", action: "login", at: "2026-08-02T08:59:00Z" },
  { userId: "u1", role: "Parent", action: "message_sent", area: "comms", count: 3, at: "2026-08-02T10:00:00Z" },
  { userId: "u2", role: "Teacher", action: "login", at: "2026-08-03T07:30:00Z" },
  { userId: "u2", role: "Teacher", action: "export", area: "reports", at: "2026-08-03T07:45:00Z" },
];
test("summarizeUser: logins, days, volume, functions", () => {
  const s = summarizeUser(evs.filter(e => e.userId === "u1"));
  assert.strictEqual(s.logins, 2);
  assert.strictEqual(s.activeDays, 2);
  assert.strictEqual(s.volume, 7); // 2 logins + view + view + 3 messages = 7
  assert.strictEqual(s.firstLogin!.toISOString(), "2026-08-01T08:00:00.000Z");
  assert.strictEqual(s.lastLogin!.toISOString(), "2026-08-02T08:59:00.000Z");
  assert.strictEqual(s.topFunctions[0].name, "comms"); // 3 beats transport/reports (1 each)
});
test("summarizeByUser ranks by volume", () => {
  const rows = summarizeByUser(evs);
  assert.strictEqual(rows[0].userId, "u1");
  assert.strictEqual(rows.length, 2);
});
test("summarizeRole aggregates a cohort", () => {
  const parents = summarizeRole(evs, "Parent");
  assert.strictEqual(parents.users, 1);
  assert.strictEqual(parents.logins, 2);
  const teachers = summarizeRole(evs, "Teacher");
  assert.strictEqual(teachers.users, 1);
  assert.strictEqual(teachers.avgLoginsPerUser, 1);
});

group("subscription approval + reminders");
test("daysUntilRenewal", () => {
  assert.strictEqual(daysUntilRenewal({ status: "active", renewalDate: daysFrom(7) }, NOW), 7);
  assert.strictEqual(daysUntilRenewal({ status: "active", renewalDate: daysFrom(-2) }, NOW), -2);
  assert.strictEqual(daysUntilRenewal({ status: "active" }, NOW), null);
});
test("reminderDue fires at thresholds, not otherwise, respects 24h cooldown", () => {
  assert.ok(reminderDue({ status: "active", renewalDate: daysFrom(7) }, NOW));
  assert.ok(!reminderDue({ status: "active", renewalDate: daysFrom(9) }, NOW));
  assert.ok(reminderDue({ status: "active", renewalDate: daysFrom(-1) }, NOW)); // overdue
  assert.ok(!reminderDue({ status: "active", renewalDate: daysFrom(7), reminderSentAt: NOW }, NOW)); // cooldown
  assert.ok(!reminderDue({ status: "canceled", renewalDate: daysFrom(1) }, NOW));
});
test("reminderLabel", () => {
  assert.strictEqual(reminderLabel({ status: "active", renewalDate: daysFrom(-3) }, NOW), "Overdue by 3d");
  assert.strictEqual(reminderLabel({ status: "active", renewalDate: daysFrom(0) }, NOW), "Renews today");
  assert.strictEqual(reminderLabel({ status: "active", renewalDate: daysFrom(5) }, NOW), "Renews in 5d");
});
test("canAutoRenew: auto renews when due; manual holds for approval", () => {
  assert.deepStrictEqual(canAutoRenew({ status: "active", renewalDate: daysFrom(-1), approvalMode: "auto" }, NOW), { renew: true, reason: "auto-approved" });
  assert.deepStrictEqual(canAutoRenew({ status: "active", renewalDate: daysFrom(-1), approvalMode: "manual", approvalStatus: "pending" }, NOW), { renew: false, reason: "awaiting manual approval" });
  assert.deepStrictEqual(canAutoRenew({ status: "active", renewalDate: daysFrom(-1), approvalMode: "manual", approvalStatus: "approved" }, NOW), { renew: true, reason: "manually approved" });
  assert.strictEqual(canAutoRenew({ status: "active", renewalDate: daysFrom(5) }, NOW).renew, false); // not due
});
test("needsManualApproval within 7d window", () => {
  assert.ok(needsManualApproval({ status: "active", renewalDate: daysFrom(5), approvalMode: "manual", approvalStatus: "pending" }, NOW));
  assert.ok(!needsManualApproval({ status: "active", renewalDate: daysFrom(20), approvalMode: "manual", approvalStatus: "pending" }, NOW));
  assert.ok(!needsManualApproval({ status: "active", renewalDate: daysFrom(5), approvalMode: "auto" }, NOW));
});
test("reportSummary counts due/overdue/pending", () => {
  const subs = [
    { status: "active", renewalDate: daysFrom(5), approvalMode: "manual", approvalStatus: "pending" },
    { status: "active", renewalDate: daysFrom(-2) },
    { status: "active", renewalDate: daysFrom(60) },
    { status: "canceled", renewalDate: daysFrom(1) },
  ];
  const r = reportSummary(subs, NOW);
  assert.strictEqual(r.overdue, 1);
  assert.strictEqual(r.dueSoon, 1);         // the manual one at +5d
  assert.strictEqual(r.pendingApproval, 1);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
