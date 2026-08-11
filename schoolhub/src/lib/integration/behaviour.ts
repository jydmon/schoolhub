import { prisma } from "../db";
import { recordAudit } from "../audit";
import { AUDIT } from "../constants";
import { notify } from "../transport";
import { getPrefs } from "../notify";
import { resolveOwner } from "./source-of-truth";
import { normalizeEvent, validateEvent, guardianCanSeeBehaviour, BehaviourEvent } from "./behaviour-logic";

// Integration Hub → behaviour ingestion. Takes behaviour events from a connected
// behaviour system (webhook or import), matches each to a pupil, writes an
// idempotent RewardRecord with provenance (ExternalRecordLink), and notifies the
// pupil's guardians — respecting each guardian's behaviour info-restriction and
// notification preferences. Unmatched/invalid events go to the error queue.
//
// Rewards are owned by the behaviour system in the source-of-truth model, so
// inbound writes here are the authoritative update of SchoolHub's copy.

export type IngestSummary = { created: number; updated: number; skipped: number; errored: number; total: number };

export async function ingestBehaviourEvents(opts: {
  schoolId: string;
  integrationId?: string | null;
  source: string; // e.g. "ClassCharts"
  events: BehaviourEvent[];
  actor?: { userId?: string; email?: string };
}): Promise<IngestSummary> {
  const owner = resolveOwner("rewards"); // "Behaviour system" by default
  let created = 0, updated = 0, skipped = 0, errored = 0;

  for (const raw of opts.events) {
    const v = validateEvent(raw);
    if (!v.ok) {
      errored++;
      await prisma.integrationError.create({ data: { schoolId: opts.schoolId, integrationId: opts.integrationId ?? null, category: "validation", message: v.issues.join("; "), affectedObject: "Behaviour", externalRecordId: raw.externalId ?? null, status: "open", suggestedAction: "Fix the event payload or field mapping." } }).catch(() => {});
      continue;
    }
    const rec = normalizeEvent(raw);
    if (!rec) { errored++; continue; }

    // Match the pupil within this tenant only (by MIS id or human reference).
    const student = await prisma.student.findFirst({
      where: { schoolId: opts.schoolId, OR: [{ externalMisId: rec.externalRef }, { reference: rec.externalRef }] },
      select: { id: true, firstName: true },
    });
    if (!student) {
      skipped++;
      await prisma.integrationError.create({ data: { schoolId: opts.schoolId, integrationId: opts.integrationId ?? null, category: "missing_record", message: `No pupil matches reference "${rec.externalRef}"`, affectedObject: "Student", externalRecordId: rec.externalRef, status: "open", suggestedAction: "Map the pupil reference, or import the pupil first." } }).catch(() => {});
      continue;
    }

    // Idempotent by (schoolId, source, externalId): re-delivered events update in place.
    const existing = await prisma.rewardRecord.findFirst({ where: { schoolId: opts.schoolId, source: opts.source, externalId: rec.externalId } });
    const data = { schoolId: opts.schoolId, studentId: student.id, type: rec.type, points: rec.points, note: rec.note, teacherName: rec.teacherName, source: opts.source, positive: rec.positive, at: rec.at ?? new Date(), externalId: rec.externalId, integrationId: opts.integrationId ?? null };
    let rewardId: string; let isNew = false;
    if (existing) { await prisma.rewardRecord.update({ where: { id: existing.id }, data }); rewardId = existing.id; updated++; }
    else { const r = await prisma.rewardRecord.create({ data }); rewardId = r.id; created++; isNew = true; }

    // Per-record provenance.
    await prisma.externalRecordLink.upsert({
      where: { schoolId_sourceSystem_objectType_externalId: { schoolId: opts.schoolId, sourceSystem: opts.source, objectType: "behaviour", externalId: rec.externalId } },
      update: { schoolhubId: rewardId, integrationId: opts.integrationId ?? null, syncStatus: "synced", ownership: "external", syncedAt: new Date() },
      create: { schoolId: opts.schoolId, integrationId: opts.integrationId ?? null, sourceSystem: opts.source, objectType: "behaviour", externalId: rec.externalId, schoolhubId: rewardId, syncStatus: "synced", ownership: "external" },
    }).catch(() => {});

    // Notify guardians on new records only, honouring behaviour restriction + prefs.
    if (isNew) {
      const links = await prisma.guardianLink.findMany({ where: { studentId: student.id }, select: { parentUserId: true, infoRestrictions: true } });
      for (const l of links) {
        let restr: string[] = [];
        try { restr = JSON.parse(l.infoRestrictions || "[]"); } catch { /* ignore */ }
        if (!guardianCanSeeBehaviour(restr)) continue;
        const prefs = await getPrefs(l.parentUserId);
        const rp = prefs.rewardPrefs || {};
        const wants = rec.type === "detention" ? rp.detention : rec.type === "incident" ? rp.incident : rec.positive ? rp.immediatePositive : true;
        if (wants) {
          await notify([l.parentUserId], { kind: rec.positive ? "reward_positive" : "reward_behaviour", title: `${student.firstName}: ${rec.type}${rec.points ? ` (${rec.positive ? "+" : "-"}${rec.points})` : ""}`, body: rec.note || undefined, schoolId: opts.schoolId, studentId: student.id });
        }
      }
    }
  }

  if (opts.integrationId) {
    await prisma.integration.update({ where: { id: opts.integrationId }, data: { lastSyncAt: new Date(), ...(errored ? { lastFailedAt: new Date() } : {}), lastSuccessAt: new Date(), status: "connected", errorStatus: errored || skipped ? "warning" : "none" } }).catch(() => {});
  }
  await recordAudit({ action: AUDIT.HUB_SYNC_COMPLETED, schoolId: opts.schoolId, actorUserId: opts.actor?.userId, actorEmail: opts.actor?.email, targetType: "Integration", targetId: opts.integrationId ?? null, metadata: { domain: "behaviour", owner, source: opts.source, created, updated, skipped, errored } });

  return { created, updated, skipped, errored, total: opts.events.length };
}
