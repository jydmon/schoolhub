import { prisma } from "../db";
import { recordAudit } from "../audit";
import { AppError } from "../http";
import { AUDIT, PERMISSIONS } from "../constants";
import { can, PermissionError, AuthContext } from "../rbac";
import { parseCsv } from "../csv";
import { encryptSecret, maskSecret, keySource } from "./crypto";
import { applyChain, TransformSpec } from "./transforms";
import { validateBatch, FieldRule } from "./validation";
import { resolveOwner } from "./source-of-truth";
import { getTemplate } from "./catalog";

// Integration Hub service layer (DB-facing). Every function is tenant-scoped:
// callers pass schoolId and all queries filter on it, so no operation can cross
// tenants. RBAC is asserted at the route layer via `assertHubAccess`.

export function assertHubAccess(ctx: AuthContext, schoolId: string) {
  // Platform super admins may oversee; school + integration admins are granted
  // MANAGE_INTEGRATION_HUB within their school.
  if (ctx.isPlatformAdmin) return;
  if (!can(ctx, PERMISSIONS.MANAGE_INTEGRATION_HUB, schoolId)) {
    throw new PermissionError("Missing permission: manage_integration_hub");
  }
}

// ---- Credentials (encrypted vault) ----------------------------------------
/**
 * Encrypt and store a connector's secret bundle. `secret` may be a single token
 * or a JSON string of multiple secret fields. Returns only a masked hint — the
 * plaintext is never persisted or returned.
 */
export async function setCredential(opts: {
  schoolId: string; integrationId: string; authMethod: string; secret: string;
  expiresAt?: string | null; actor: { userId?: string; email?: string };
}) {
  const integration = await prisma.integration.findFirst({ where: { id: opts.integrationId, schoolId: opts.schoolId } });
  if (!integration) throw new AppError("Integration not found", 404);

  const ciphertext = encryptSecret(opts.secret);
  const maskedHint = maskSecret(opts.secret);
  const existing = await prisma.integrationCredential.findUnique({ where: { integrationId: opts.integrationId } });

  await prisma.integrationCredential.upsert({
    where: { integrationId: opts.integrationId },
    update: { authMethod: opts.authMethod, ciphertext, maskedHint, expiresAt: opts.expiresAt ? new Date(opts.expiresAt) : null, rotatedAt: existing ? new Date() : null },
    create: { integrationId: opts.integrationId, schoolId: opts.schoolId, authMethod: opts.authMethod, ciphertext, maskedHint, expiresAt: opts.expiresAt ? new Date(opts.expiresAt) : null, createdById: opts.actor.userId ?? null },
  });
  await prisma.integration.update({ where: { id: opts.integrationId }, data: { authMethod: opts.authMethod } });

  await recordAudit({
    action: existing ? AUDIT.HUB_CREDENTIAL_ROTATED : AUDIT.HUB_CREDENTIAL_SET,
    schoolId: opts.schoolId, actorUserId: opts.actor.userId, actorEmail: opts.actor.email,
    targetType: "Integration", targetId: opts.integrationId,
    metadata: { authMethod: opts.authMethod, rotated: !!existing }, // NB: secret NOT logged
  });
  return { maskedHint, rotated: !!existing };
}

// ---- Connection test -------------------------------------------------------
/**
 * Test a connector's configuration. For provider shells whose authorised API we
 * have not integrated, this validates that required config + credentials are
 * present and reports the connector as "configured, live test pending" rather
 * than asserting a real handshake we cannot perform. It never fabricates success
 * against a real provider endpoint.
 */
export async function testConnection(opts: { schoolId: string; integrationId: string; actor: { userId?: string; email?: string } }) {
  const integration = await prisma.integration.findFirst({
    where: { id: opts.integrationId, schoolId: opts.schoolId },
    include: { credential: true },
  });
  if (!integration) throw new AppError("Integration not found", 404);
  const template = getTemplate(integration.connectorKey);

  let ok = true;
  const notes: string[] = [];
  if (template?.requiresProviderCredentials && !integration.credential) {
    ok = false; notes.push("credentials required — none stored");
  }
  const cfg = safeJson(integration.config);
  for (const f of template?.configFields ?? []) {
    if (f.required && !f.secret && !cfg[f.key]) { ok = false; notes.push(`missing config: ${f.label}`); }
  }
  const live = template && template.status !== "available"; // provider shells aren't live-tested here
  if (ok && live) notes.push("configuration valid — live provider handshake pending real credentials");
  if (ok && !live) notes.push("configuration valid");

  await recordAudit({ action: AUDIT.HUB_CONNECTION_TESTED, schoolId: opts.schoolId, actorUserId: opts.actor.userId, actorEmail: opts.actor.email, targetType: "Integration", targetId: opts.integrationId, metadata: { ok, live: !live } });
  return { ok, live: !live, notes };
}

// ---- Dashboard -------------------------------------------------------------
export async function buildDashboard(schoolId: string) {
  const [integrations, runs, openErrors, openConflicts, openDupes, links, credCount] = await Promise.all([
    prisma.integration.findMany({ where: { schoolId }, select: { id: true, name: true, connectorKey: true, status: true, enabled: true, errorStatus: true, lastSuccessAt: true, lastFailedAt: true } }),
    prisma.syncRun.findMany({ where: { schoolId }, orderBy: { startedAt: "desc" }, take: 200, select: { status: true, recordsIn: true, recordsFailed: true, startedAt: true, finishedAt: true } }),
    prisma.integrationError.count({ where: { schoolId, status: { in: ["open", "assigned"] } } }),
    prisma.syncConflict.count({ where: { schoolId, status: "open" } }),
    prisma.duplicateCandidate.count({ where: { schoolId, status: "open" } }),
    prisma.externalRecordLink.count({ where: { schoolId } }),
    prisma.integrationCredential.count({ where: { schoolId } }),
  ]);

  const active = integrations.filter((i) => i.enabled && i.status === "connected").length;
  const failed = integrations.filter((i) => i.status === "error" || i.errorStatus === "error").length;
  const authRequired = integrations.filter((i) => i.errorStatus === "auth_required").length;
  const recordsProcessed = runs.reduce((s, r) => s + r.recordsIn, 0);
  const recordsFailed = runs.reduce((s, r) => s + r.recordsFailed, 0);
  const lastSuccess = integrations
    .map((i) => i.lastSuccessAt)
    .filter((d): d is Date => !!d)
    .sort((a, b) => a.getTime() - b.getTime())
    .pop() ?? null;

  return {
    totals: { connected: integrations.length, active, failed, authRequired, credentials: credCount, recordLinks: links },
    queues: { openErrors, openConflicts, openDuplicates: openDupes },
    processing: { recordsProcessed, recordsFailed, runs: runs.length },
    lastSuccessAt: lastSuccess,
    encryptionKey: keySource(), // "env" (secure) or "derived" (dev fallback)
    connectors: integrations.map((i) => ({ id: i.id, name: i.name, key: i.connectorKey, status: i.status, enabled: i.enabled, errorStatus: i.errorStatus, lastSuccessAt: i.lastSuccessAt, lastFailedAt: i.lastFailedAt })),
  };
}

// ---- End-to-end import (generic file / CSV / JSON connector) ---------------
export type ImportMapping = { externalField: string; internalField: string; transforms?: TransformSpec[] };

const STUDENT_RULES: FieldRule[] = [
  { field: "student.reference", required: true },
  { field: "student.firstName", required: true },
  { field: "student.lastName", required: true },
  { field: "student.dateOfBirth", type: "date" },
];

/**
 * Working end-to-end connector: parse → map+transform → validate → persist with
 * per-record provenance (ExternalRecordLink) and an error queue for failures.
 * Serialised per integration (no concurrent run of the same connector).
 */
export async function runHubImport(opts: {
  schoolId: string; integrationId?: string; connectorKey: string; sourceSystem: string;
  format: "csv" | "json"; raw: string; targetObject: "student"; mapping: ImportMapping[];
  actor: { userId?: string; email?: string };
}) {
  // Concurrency lock: refuse if this integration already has a running sync.
  if (opts.integrationId) {
    const running = await prisma.syncRun.findFirst({ where: { integrationId: opts.integrationId, status: "running" } });
    if (running) throw new AppError("A synchronisation is already running for this connector", 409);
  }

  // 1) Parse raw input to rows.
  let rows: Record<string, string>[] = [];
  if (opts.format === "csv") {
    rows = parseCsv(opts.raw).rows;
  } else {
    let parsed: any;
    try { parsed = JSON.parse(opts.raw); } catch { throw new AppError("Invalid JSON", 400); }
    const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.records) ? parsed.records : [];
    rows = arr.map((o: any) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v == null ? "" : String(v)])));
  }

  // 2) Map external → canonical internal fields, applying transform chains.
  const mapped = rows.map((row) => {
    const out: Record<string, string> = {};
    for (const m of opts.mapping) {
      const val = applyChain(row[m.externalField] ?? "", m.transforms);
      out[m.internalField] = val;
    }
    return out;
  });

  // 3) Validate.
  const rules = STUDENT_RULES;
  const validation = validateBatch(mapped, rules, "student.reference");

  // 4) Persist within a SyncRun.
  const run = opts.integrationId
    ? await prisma.syncRun.create({ data: { integrationId: opts.integrationId, schoolId: opts.schoolId, trigger: "manual", status: "running" } })
    : null;

  const owner = resolveOwner("identity");
  const log: string[] = [];
  let created = 0, updated = 0, failed = 0;

  for (const outcome of validation.outcomes) {
    const rec = mapped[outcome.index];
    const reference = (rec["student.reference"] || "").trim();
    if (outcome.status === "failed") {
      failed++;
      await prisma.integrationError.create({
        data: {
          schoolId: opts.schoolId, integrationId: opts.integrationId ?? null, category: "validation",
          message: outcome.issues.map((i) => i.message).join("; ") || "validation failed",
          affectedObject: "Student", externalRecordId: reference || null, status: "open",
          suggestedAction: "Correct the source data or the field mapping, then retry.",
        },
      });
      continue;
    }
    // Upsert the Student (identity owned by MIS/source; SchoolHub stores a copy).
    const data = {
      firstName: rec["student.firstName"].trim(),
      lastName: rec["student.lastName"].trim(),
      dateOfBirth: rec["student.dateOfBirth"] ? new Date(rec["student.dateOfBirth"]) : null,
      yearGroup: rec["student.yearGroup"]?.trim() || null,
    };
    const existing = await prisma.student.findUnique({ where: { schoolId_reference: { schoolId: opts.schoolId, reference } } });
    let studentId: string;
    if (existing) { await prisma.student.update({ where: { id: existing.id }, data }); studentId = existing.id; updated++; }
    else { const s = await prisma.student.create({ data: { schoolId: opts.schoolId, reference, ...data } }); studentId = s.id; created++; }

    // Provenance link (idempotent per external id).
    await prisma.externalRecordLink.upsert({
      where: { schoolId_sourceSystem_objectType_externalId: { schoolId: opts.schoolId, sourceSystem: opts.sourceSystem, objectType: "student", externalId: reference } },
      update: { schoolhubId: studentId, syncStatus: "synced", ownership: ownerToCode(owner), externalModifiedAt: new Date(), syncedAt: new Date() },
      create: { schoolId: opts.schoolId, integrationId: opts.integrationId ?? null, sourceSystem: opts.sourceSystem, objectType: "student", externalId: reference, schoolhubId: studentId, syncStatus: "synced", ownership: ownerToCode(owner) },
    });
  }

  log.push(`parsed ${rows.length} rows`, `mapped ${opts.mapping.length} fields`, `validation: ${validation.passed} passed / ${validation.warnings} warning / ${validation.failed} failed`, `persisted ${created} created, ${updated} updated, ${failed} errored`);
  const status = failed === 0 ? "success" : created + updated > 0 ? "partial" : "failed";

  if (run) {
    await prisma.syncRun.update({ where: { id: run.id }, data: { status, finishedAt: new Date(), recordsIn: rows.length, recordsUpdated: created + updated, recordsFailed: failed, message: `${created + updated} imported, ${failed} errored`, log: JSON.stringify(log) } });
    await prisma.integration.update({ where: { id: opts.integrationId! }, data: { lastSyncAt: new Date(), ...(status !== "failed" ? { lastSuccessAt: new Date(), status: "connected", errorStatus: failed ? "warning" : "none" } : { lastFailedAt: new Date(), status: "error", errorStatus: "error" }) } });
  }

  await recordAudit({ action: AUDIT.HUB_SYNC_COMPLETED, schoolId: opts.schoolId, actorUserId: opts.actor.userId, actorEmail: opts.actor.email, targetType: "Integration", targetId: opts.integrationId ?? null, metadata: { source: opts.sourceSystem, created, updated, failed, status } });

  return { runId: run?.id ?? null, status, total: rows.length, created, updated, failed, validation: { passed: validation.passed, warnings: validation.warnings, failed: validation.failed }, log };
}

// ---- Errors ---------------------------------------------------------------
export async function listErrors(schoolId: string, status?: string) {
  return prisma.integrationError.findMany({
    where: { schoolId, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" }, take: 200,
  });
}
export async function resolveError(opts: { schoolId: string; errorId: string; action: "retry" | "ignore" | "resolve" | "assign"; notes?: string; assignedToId?: string; actor: { userId?: string; email?: string } }) {
  const err = await prisma.integrationError.findFirst({ where: { id: opts.errorId, schoolId: opts.schoolId } });
  if (!err) throw new AppError("Error not found", 404);
  const data: any = {};
  if (opts.action === "ignore") data.status = "ignored";
  else if (opts.action === "resolve") { data.status = "resolved"; data.resolvedAt = new Date(); }
  else if (opts.action === "assign") { data.status = "assigned"; data.assignedToId = opts.assignedToId ?? null; }
  else if (opts.action === "retry") data.retryCount = { increment: 1 };
  if (opts.notes) data.resolutionNotes = opts.notes;
  await prisma.integrationError.update({ where: { id: err.id }, data });
  await recordAudit({ action: AUDIT.HUB_ERROR_RESOLVED, schoolId: opts.schoolId, actorUserId: opts.actor.userId, actorEmail: opts.actor.email, targetType: "IntegrationError", targetId: err.id, metadata: { action: opts.action } });
  return { ok: true, action: opts.action };
}

// ---- helpers ---------------------------------------------------------------
function safeJson(s: string): Record<string, any> { try { return JSON.parse(s); } catch { return {}; } }
function ownerToCode(owner: string): string { return owner === "SchoolHub" ? "schoolhub" : "external"; }
