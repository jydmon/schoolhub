import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { AUDIT } from "@/lib/constants";
import { ok } from "@/lib/http";
import { decryptSecret, verifySignature } from "@/lib/integration/crypto";
import { ingestBehaviourEvents } from "@/lib/integration/behaviour";
import type { BehaviourEvent } from "@/lib/integration/behaviour-logic";
import { createHash } from "crypto";
import { NextResponse } from "next/server";

// Flexibly map a provider's behaviour payload to our BehaviourEvent shape.
function mapBehaviourEvent(e: any): BehaviourEvent {
  return {
    externalId: String(e.externalId ?? e.id ?? e.event_id ?? ""),
    externalRef: String(e.externalRef ?? e.pupil_ref ?? e.student_ref ?? e.upn ?? e.PupilRef ?? e.reference ?? ""),
    type: e.type ?? e.kind ?? e.reward_type ?? e.RewardType ?? e.category,
    points: e.points ?? e.Points ?? e.value,
    note: e.note ?? e.reason ?? e.comment,
    teacherName: e.teacherName ?? e.staff ?? e.awarded_by,
    at: e.at ?? e.timestamp ?? e.date,
  };
}

type Params = { params: { token: string } };

// Public inbound webhook endpoint. External systems (e.g. a GPS provider or
// behaviour system configured with method = webhook) POST events here using the
// per-integration token issued at connect time.
//
// Hardened for the Integration Hub (Phase 16):
//  - Optional HMAC-SHA256 signature validation when a signing secret is stored.
//  - Idempotency: a delivery carrying an event id that has already been seen is
//    recorded as a duplicate and NOT reprocessed.
//  - Every delivery is logged (WebhookDelivery) with signature validity + status.
export async function POST(req: Request, { params }: Params) {
  const integration = await prisma.integration.findUnique({ where: { webhookToken: params.token }, include: { credential: true } });
  if (!integration) return NextResponse.json({ error: "Unknown webhook" }, { status: 404 });
  if (!integration.enabled || integration.status === "disabled") {
    return NextResponse.json({ error: "Integration disabled" }, { status: 409 });
  }

  const raw = await req.text();
  let payload: any = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }
  const now = new Date();
  const payloadHash = createHash("sha256").update(raw || "").digest("hex");

  // --- Signature validation (only enforced if a signing secret is stored) ---
  const sigHeader = req.headers.get("x-signature") || req.headers.get("x-hub-signature-256");
  let signatureValid = false;
  let signingSecret: string | null = null;
  if (integration.credential?.ciphertext) {
    try {
      const decrypted = decryptSecret(integration.credential.ciphertext);
      try { signingSecret = JSON.parse(decrypted).signingSecret ?? null; } catch { signingSecret = decrypted; }
    } catch { signingSecret = null; }
  }
  if (signingSecret) {
    signatureValid = verifySignature(signingSecret, raw, sigHeader);
    if (!signatureValid) {
      await prisma.webhookDelivery.create({ data: { schoolId: integration.schoolId, integrationId: integration.id, eventType: typeof payload?.type === "string" ? payload.type : null, signatureValid: false, status: "failed", payloadHash, error: "invalid signature" } }).catch(() => {});
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  // --- Idempotency: skip reprocessing a duplicate event id ---
  const eventId = req.headers.get("x-event-id") || req.headers.get("x-idempotency-key") || (typeof payload?.id === "string" ? payload.id : typeof payload?.event_id === "string" ? payload.event_id : null);
  if (eventId) {
    const seen = await prisma.webhookDelivery.findUnique({ where: { integrationId_eventId: { integrationId: integration.id, eventId } } });
    if (seen) {
      await prisma.webhookDelivery.update({ where: { id: seen.id }, data: { attempts: { increment: 1 }, status: "duplicate" } }).catch(() => {});
      return ok({ ok: true, duplicate: true });
    }
  }

  const count = Array.isArray(payload) ? payload.length : payload ? 1 : 0;

  await prisma.webhookDelivery.create({
    data: { schoolId: integration.schoolId, integrationId: integration.id, eventId, eventType: typeof payload?.type === "string" ? payload.type : null, signatureValid, status: "processed", payloadHash },
  }).catch(() => {});

  // Behaviour connectors: turn the delivery into reward/consequence records that
  // surface in the parent portal (matched to the pupil, with provenance).
  let behaviourSummary: Awaited<ReturnType<typeof ingestBehaviourEvents>> | null = null;
  if (integration.category === "behaviour" || integration.connectorKey === "behaviour-system") {
    const rawEvents: any[] = Array.isArray(payload?.events) ? payload.events : Array.isArray(payload) ? payload : payload ? [payload] : [];
    const events = rawEvents.map(mapBehaviourEvent);
    if (events.length) {
      try {
        behaviourSummary = await ingestBehaviourEvents({ schoolId: integration.schoolId, integrationId: integration.id, source: integration.provider || integration.name || "Behaviour system", events });
      } catch { /* logged via error queue inside ingest */ }
    }
  }

  const runStatus = behaviourSummary && behaviourSummary.errored ? "partial" : "success";
  await prisma.syncRun.create({
    data: {
      integrationId: integration.id, schoolId: integration.schoolId, trigger: "webhook", status: runStatus,
      finishedAt: now, recordsIn: count, recordsUpdated: behaviourSummary ? behaviourSummary.created + behaviourSummary.updated : count, recordsFailed: behaviourSummary ? behaviourSummary.errored + behaviourSummary.skipped : 0,
      message: behaviourSummary ? `Behaviour: ${behaviourSummary.created} new, ${behaviourSummary.updated} updated, ${behaviourSummary.skipped} unmatched, ${behaviourSummary.errored} invalid` : `Received ${count} event(s) via webhook`,
      log: JSON.stringify([`${now.toISOString()}  Inbound webhook: ${count} event(s); signature ${signingSecret ? (signatureValid ? "valid" : "invalid") : "not configured"}`]),
    },
  });
  await prisma.integration.update({ where: { id: integration.id }, data: { lastSyncAt: now, lastSuccessAt: now, status: "connected", lastError: null } });
  await recordAudit({ action: AUDIT.HUB_WEBHOOK_DELIVERY, schoolId: integration.schoolId, targetType: "Integration", targetId: integration.id, metadata: { count, eventId, signatureValid: signingSecret ? signatureValid : null, behaviour: behaviourSummary || undefined } });

  return ok({ ok: true, received: count, signatureChecked: !!signingSecret, behaviour: behaviourSummary || undefined });
}
