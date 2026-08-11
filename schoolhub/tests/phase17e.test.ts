/*
 * Phase 17e pure-logic tests. Run: tsx tests/phase17e.test.ts
 * Covers the notification inbox / red-badge logic: unread count, in-app
 * filtering, grouping, per-kind summary, and mark-read helpers.
 */
import assert from "node:assert";
import { unreadCount, hasUnread, inboxList, summarizeByKind, groupByDay, idsToMark, applyMarkRead, kindMeta } from "../src/lib/inbox-logic";

let passed = 0, failed = 0;
function test(n: string, fn: () => void) { try { fn(); passed++; console.log("  ✓ " + n); } catch (e: any) { failed++; console.log("  ✗ " + n + "\n      " + (e?.message || e)); } }
function group(n: string) { console.log("\n" + n); }

const NOW = new Date("2026-08-10T12:00:00Z");
const at = (d: string) => d;
const items = [
  { id: "n1", kind: "announcement", title: "Sports Day", read: false, channel: "inapp", createdAt: "2026-08-10T08:00:00Z" },
  { id: "n2", kind: "event_update", title: "Journey started", read: false, channel: "inapp", createdAt: "2026-08-10T09:00:00Z" },
  { id: "n3", kind: "reward", title: "+2 Teamwork", read: true, channel: "inapp", createdAt: "2026-08-09T10:00:00Z" },
  { id: "n4", kind: "announcement", title: "Menu change", read: false, channel: "email", createdAt: "2026-08-10T07:00:00Z" }, // external copy — not in inbox
  { id: "n5", kind: "transport", title: "Bus delay", read: false, channel: "inapp", createdAt: "2026-08-05T10:00:00Z" },
];

group("badge count");
test("unreadCount counts only unread in-app", () => {
  assert.strictEqual(unreadCount(items), 3); // n1, n2, n5 (n3 read, n4 external)
  assert.ok(hasUnread(items));
  assert.ok(!hasUnread(items.map(i => ({ ...i, read: true }))));
});

group("list + summary");
test("inboxList is in-app only, newest first, de-duped", () => {
  const list = inboxList([...items, { id: "n1", kind: "announcement", title: "dup", read: false, channel: "inapp", createdAt: "2026-08-10T08:00:00Z" }]);
  assert.deepStrictEqual(list.map(n => n.id), ["n2", "n1", "n3", "n5"]); // n4 excluded (email)
});
test("summarizeByKind counts unread per kind", () => {
  const s = summarizeByKind(items);
  assert.strictEqual(s.announcement, 1); // n1 (n4 is external)
  assert.strictEqual(s.event_update, 1);
  assert.strictEqual(s.transport, 1);
  assert.strictEqual(s.reward, undefined); // read
});
test("kindMeta has label + icon with fallback", () => {
  assert.strictEqual(kindMeta("announcement").label, "Announcement");
  assert.strictEqual(kindMeta("unknownkind").label, "Update");
});

group("grouping");
test("groupByDay buckets Today/Yesterday/Earlier", () => {
  const g = groupByDay(items, NOW);
  const byLabel = Object.fromEntries(g.map(x => [x.label, x.items.map(i => i.id)]));
  assert.deepStrictEqual(byLabel["Today"], ["n2", "n1"]);
  assert.deepStrictEqual(byLabel["Yesterday"], ["n3"]);
  assert.deepStrictEqual(byLabel["Earlier"], ["n5"]);
});

group("mark read");
test("idsToMark returns explicit ids or all unread in-app", () => {
  assert.deepStrictEqual(idsToMark(items).sort(), ["n1", "n2", "n5"]);
  assert.deepStrictEqual(idsToMark(items, ["n1"]), ["n1"]);
});
test("applyMarkRead flips read locally", () => {
  const after = applyMarkRead(items, ["n1", "n2"]);
  assert.strictEqual(unreadCount(after), 1); // only n5 left
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
