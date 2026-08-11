/*
 * Invitation logic — pure unit tests. Run: tsx tests/invite.test.ts
 * Covers token/code hashing + constant-time verify, activation eligibility
 * (accepted/revoked/expired/bad-code/ok), expiry, code format, role validation,
 * and parent-child linking rule. DB flows (accept → user+membership+guardian
 * links, admin disable/suspend/revoke) are covered by the integration spec.
 */
import assert from "node:assert";
import { hashToken, hashCode, verifyHash, generateToken, generateCode, isExpired, canActivate, normalizeRole, roleLinksChildren, defaultExpiry } from "../src/lib/invite-logic";

let passed = 0, failed = 0;
function test(n: string, fn: () => void) { try { fn(); passed++; console.log("  ✓ " + n); } catch (e: any) { failed++; console.log("  ✗ " + n + "\n      " + (e?.message || e)); } }
function group(n: string) { console.log("\n" + n); }

const NOW = new Date("2026-08-07T12:00:00Z");
const future = new Date(NOW.getTime() + 60_000);
const past = new Date(NOW.getTime() - 60_000);

group("hashing");
test("hashCode/hashToken are deterministic + verifiable", () => {
  assert.strictEqual(hashCode("123456"), hashCode("123456"));
  assert.ok(verifyHash(hashCode("123456"), hashCode("123456")));
  assert.ok(!verifyHash(hashCode("123456"), hashCode("000000")));
  assert.notStrictEqual(hashToken("abc"), hashCode("abc")); // domain-separated
});
test("raw token/code are not recoverable from hashes", () => {
  const h = hashCode("654321");
  assert.ok(!h.includes("654321"));
  assert.strictEqual(h.length, 64); // sha256 hex
});

group("generators");
test("generateCode is 6 digits; generateToken is url-safe", () => {
  const c = generateCode();
  assert.match(c, /^\d{6}$/);
  const t = generateToken();
  assert.match(t, /^[A-Za-z0-9_-]+$/);
  assert.notStrictEqual(generateToken(), generateToken());
});

group("expiry + activation");
test("isExpired", () => {
  assert.ok(isExpired(past, NOW));
  assert.ok(!isExpired(future, NOW));
});
test("canActivate: happy path", () => {
  const inv = { status: "pending", expiresAt: future, codeHash: hashCode("123456") };
  assert.deepStrictEqual(canActivate(inv, "123456", NOW), { ok: true, reason: "ok" });
});
test("canActivate: rejects wrong code / expired / revoked / accepted", () => {
  const base = { status: "pending", expiresAt: future, codeHash: hashCode("123456") };
  assert.strictEqual(canActivate(base, "000000", NOW).reason, "invalid code");
  assert.strictEqual(canActivate({ ...base, expiresAt: past }, "123456", NOW).reason, "expired");
  assert.strictEqual(canActivate({ ...base, status: "revoked" }, "123456", NOW).reason, "revoked");
  assert.strictEqual(canActivate({ ...base, status: "accepted" }, "123456", NOW).reason, "already accepted");
});

group("roles");
test("normalizeRole validates against school roles", () => {
  assert.strictEqual(normalizeRole("Parent"), "Parent");
  assert.strictEqual(normalizeRole("Teacher"), "Teacher");
  assert.strictEqual(normalizeRole("PlatformSuperAdministrator"), null); // not a school role
  assert.strictEqual(normalizeRole("hacker"), null);
});
test("only parents link to children", () => {
  assert.ok(roleLinksChildren("Parent"));
  assert.ok(!roleLinksChildren("Teacher"));
  assert.ok(!roleLinksChildren("Driver"));
});
test("defaultExpiry is 7 days out", () => {
  assert.strictEqual(defaultExpiry(NOW).getTime(), NOW.getTime() + 7 * 24 * 60 * 60 * 1000);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
