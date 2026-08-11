/*
 * Integration Hub unit tests — runnable with `tsx tests/integration-hub.test.ts`.
 * Covers the pure framework logic: credential encryption + masking + redaction,
 * webhook signatures, field transforms, AI mapping recommendations, import
 * validation, duplicate detection, and source-of-truth enforcement.
 *
 * These are dependency-free (no DB) so they run in CI without a database. The
 * DB-bound flows (sync engine, provenance, tenant isolation at the query layer)
 * are covered by integration/e2e specs described in INTEGRATION-HUB.md.
 */
import assert from "node:assert";
import { encryptSecret, decryptSecret, isEncrypted, maskSecret, redact, signPayload, verifySignature } from "../src/lib/integration/crypto";
import { applyTransform, applyChain } from "../src/lib/integration/transforms";
import { suggestMappings, tokenize, detectShape } from "../src/lib/integration/mapping-ai";
import { validateBatch, validateRecord } from "../src/lib/integration/validation";
import { matchPeople, findDuplicate, mayAutoMerge } from "../src/lib/integration/dedupe";
import { canWriteBack, canInboundOverwrite, resolveOwner } from "../src/lib/integration/source-of-truth";

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log("  ✓ " + name); }
  catch (e: any) { failed++; console.log("  ✗ " + name + "\n      " + (e?.message || e)); }
}
function group(n: string) { console.log("\n" + n); }

// ---- crypto vault ----
group("Credential vault (AES-256-GCM)");
test("round-trips a secret", () => {
  const enc = encryptSecret("sk_live_ABC123secret");
  assert.ok(isEncrypted(enc), "output is tagged ciphertext");
  assert.notStrictEqual(enc, "sk_live_ABC123secret");
  assert.strictEqual(decryptSecret(enc), "sk_live_ABC123secret");
});
test("ciphertext is non-deterministic (random IV)", () => {
  assert.notStrictEqual(encryptSecret("same"), encryptSecret("same"));
});
test("tampering is detected (GCM auth tag)", () => {
  const enc = encryptSecret("hello");
  const parts = enc.split(":");
  const tampered = parts.slice(0, 3).join(":") + ":" + Buffer.from("evil").toString("base64");
  assert.throws(() => decryptSecret(tampered));
});
test("maskSecret hides all but last 4", () => {
  assert.strictEqual(maskSecret("sk_live_1234abcd").slice(-4), "abcd");
  assert.ok(!maskSecret("sk_live_1234abcd").includes("sk_live"));
});
test("redact scrubs sensitive keys deeply", () => {
  const r: any = redact({ baseUrl: "https://x", apiKey: "secret", nested: { clientSecret: "z", ok: "keep" } });
  assert.strictEqual(r.baseUrl, "https://x");
  assert.strictEqual(r.apiKey, "••••redacted");
  assert.strictEqual(r.nested.clientSecret, "••••redacted");
  assert.strictEqual(r.nested.ok, "keep");
});
test("webhook signature verifies and rejects tampering", () => {
  const body = JSON.stringify({ a: 1 });
  const sig = signPayload("whsec_test", body);
  assert.ok(verifySignature("whsec_test", body, "sha256=" + sig));
  assert.ok(!verifySignature("whsec_test", body + "x", "sha256=" + sig));
  assert.ok(!verifySignature("wrong", body, "sha256=" + sig));
});

// ---- transforms ----
group("Field transforms");
test("date normalises UK → ISO", () => {
  assert.strictEqual(applyTransform("12/04/2016", { type: "date" }), "2016-04-12");
  assert.strictEqual(applyTransform("2016-04-12", { type: "date" }), "2016-04-12");
});
test("boolean / number / phone / case", () => {
  assert.strictEqual(applyTransform("Yes", { type: "boolean" }), "true");
  assert.strictEqual(applyTransform("£1,234.50", { type: "number" }), "1234.5");
  assert.strictEqual(applyTransform("07700 900123", { type: "phone" }), "+447700900123");
  assert.strictEqual(applyTransform("oak class", { type: "title" }), "Oak Class");
});
test("lookup + split + chain", () => {
  assert.strictEqual(applyTransform("M", { type: "lookup", map: { M: "Mother", F: "Father" } }), "Mother");
  assert.strictEqual(applyTransform("Ella Blake", { type: "split", with: " ", index: 1 }), "Blake");
  assert.strictEqual(applyChain("  ella BLAKE ", [{ type: "trim" }, { type: "title" }]), "Ella Blake");
});
test("default fills empties only", () => {
  assert.strictEqual(applyTransform("", { type: "default", value: "en" }), "en");
  assert.strictEqual(applyTransform("fr", { type: "default", value: "en" }), "fr");
});

// ---- AI mapping ----
group("AI-assisted mapping");
test("tokenize splits camelCase and delimiters", () => {
  assert.deepStrictEqual(tokenize("Parent_Mobile"), ["parent", "mobile"]);
  assert.deepStrictEqual(tokenize("firstName"), ["first", "name"]);
});
test("value-shape detection", () => {
  assert.strictEqual(detectShape(["a@b.com", "c@d.org"]), "email");
  assert.strictEqual(detectShape(["12/04/2016", "2016-04-12"]), "date");
});
test("recommends the expected targets from the spec examples", () => {
  const recs = suggestMappings([
    { name: "Student Name", samples: ["Ella Blake", "Max Blake"] },
    { name: "Tutor Group", samples: ["4B", "4C"] },
    { name: "Pickup Point", samples: ["Elm St", "Oak Rd"] },
    { name: "Parent Mobile", samples: ["07700 900123", "07700 900124"] },
    { name: "Merit Total", samples: ["50", "80"] },
  ]);
  const by = Object.fromEntries(recs.map((r) => [r.externalField, r.suggestion?.internalField]));
  assert.strictEqual(by["Student Name"], "student.fullName");
  assert.strictEqual(by["Tutor Group"], "student.class");
  assert.strictEqual(by["Pickup Point"], "transport.pickup");
  assert.strictEqual(by["Parent Mobile"], "guardian.phone");
  assert.strictEqual(by["Merit Total"], "reward.points");
});
test("gibberish field is flagged uncertain", () => {
  const [r] = suggestMappings([{ name: "xq_zzz_9", samples: ["??"] }]);
  assert.ok(r.uncertain, "low-confidence suggestion flagged for review");
});

// ---- validation ----
group("Import validation");
test("classifies passed / warning / failed", () => {
  const rules = [
    { field: "reference", required: true },
    { field: "email", type: "email" as const },
    { field: "dob", type: "date" as const },
    { field: "classId", requiredRelation: true },
  ];
  const good = validateRecord({ reference: "S1", email: "a@b.com", dob: "2016-04-12", classId: "4B" }, rules, 0);
  const warn = validateRecord({ reference: "S2", email: "a@b.com", dob: "2016-04-12", classId: "" }, rules, 1);
  const bad = validateRecord({ reference: "", email: "nope", dob: "40/40/40", classId: "4B" }, rules, 2);
  assert.strictEqual(good.status, "passed");
  assert.strictEqual(warn.status, "warning");
  assert.strictEqual(bad.status, "failed");
  assert.ok(bad.issues.some((i) => i.code === "type"));
});
test("detects duplicate external ids in a batch", () => {
  const rules = [{ field: "ref", required: true }];
  const res = validateBatch([{ ref: "A" }, { ref: "A" }, { ref: "B" }], rules, "ref");
  assert.strictEqual(res.failed, 1);
  assert.ok(res.outcomes[1].issues.some((i) => i.code === "duplicate_external_id"));
});

// ---- dedupe ----
group("Duplicate detection");
test("external id → unambiguous; name-only → candidate", () => {
  assert.strictEqual(matchPeople({ externalId: "S1" }, { externalId: "s1" }).classification, "unambiguous");
  assert.strictEqual(matchPeople({ firstName: "Ella", lastName: "Blake" }, { firstName: "ella", lastName: "blake" }).classification, "candidate");
  assert.strictEqual(matchPeople({ firstName: "Ella", lastName: "Blake" }, { firstName: "Max", lastName: "Blake" }).classification, "distinct");
});
test("findDuplicate + auto-merge gate", () => {
  const existing = [{ email: "a@b.com", firstName: "A" }, { email: "c@d.com", firstName: "C" }];
  const hit = findDuplicate({ email: "C@D.com" }, existing);
  assert.strictEqual(hit?.index, 1);
  assert.ok(mayAutoMerge(hit!.match, true));
  assert.ok(!mayAutoMerge(hit!.match, false), "no auto-merge unless school enabled it");
});

// ---- source of truth ----
group("Source-of-truth enforcement");
test("inbound updates always allowed; outbound gated", () => {
  const base = { domain: "identity", owner: "School MIS" as const, connectorSupportsWriteBack: true, writeBackEnabled: true, userHasPermission: true, schoolApproved: true };
  assert.ok(canWriteBack({ ...base, direction: "in" }).allowed);
  assert.ok(canWriteBack({ ...base, direction: "out" }).allowed);
  assert.ok(!canWriteBack({ ...base, direction: "out", writeBackEnabled: false }).allowed);
  assert.ok(!canWriteBack({ ...base, direction: "out", connectorSupportsWriteBack: false }).allowed);
  assert.ok(!canWriteBack({ ...base, direction: "out", userHasPermission: false }).allowed);
  assert.ok(!canWriteBack({ ...base, direction: "out", schoolApproved: false }).allowed);
});
test("only owner overwrites SchoolHub copy; defaults resolve", () => {
  assert.ok(canInboundOverwrite("School MIS", "School MIS"));
  assert.ok(!canInboundOverwrite("School MIS", "Behaviour system"));
  assert.strictEqual(resolveOwner("attendance"), "School MIS");
  assert.strictEqual(resolveOwner("journey"), "SchoolHub");
  assert.strictEqual(resolveOwner("identity", "Google Workspace"), "Google Workspace");
});

// ---- end-to-end import pipeline (parse → map → transform → validate) ----
import { parseCsv } from "../src/lib/csv";
group("E2E import pipeline (generic CSV connector)");
test("maps + transforms + validates the demo file correctly", () => {
  const raw = "reference,first,last,dob\nS-1001,Ella,Blake,12/04/2016\nS-1002,Max,Blake,03/09/2018\n,Bad,Row,not-a-date";
  const rows = parseCsv(raw).rows;
  const mapping = [
    { externalField: "reference", internalField: "student.reference" },
    { externalField: "first", internalField: "student.firstName" },
    { externalField: "last", internalField: "student.lastName" },
    { externalField: "dob", internalField: "student.dateOfBirth", transforms: [{ type: "date" as const }] },
  ];
  const mapped = rows.map((row) => {
    const out: Record<string, string> = {};
    for (const m of mapping) out[m.internalField] = applyChain(row[m.externalField] ?? "", m.transforms);
    return out;
  });
  // date transform applied
  assert.strictEqual(mapped[0]["student.dateOfBirth"], "2016-04-12");
  const rules = [
    { field: "student.reference", required: true },
    { field: "student.firstName", required: true },
    { field: "student.lastName", required: true },
    { field: "student.dateOfBirth", type: "date" as const },
  ];
  const v = validateBatch(mapped, rules, "student.reference");
  assert.strictEqual(v.total, 3);
  assert.strictEqual(v.passed, 2);          // two good students
  assert.strictEqual(v.failed, 1);          // missing ref + bad date
  assert.ok(v.outcomes[2].issues.some((i) => i.code === "required"));
  assert.ok(v.outcomes[2].issues.some((i) => i.code === "type"));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
