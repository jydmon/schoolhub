import { prisma } from "./db";
import { recordAudit } from "./audit";
import { AUDIT } from "./constants";
import { notifyStudentGuardians } from "./transport";
import { updateSet, isValidUpdate, makeCustomUpdate, tripProgress, type UpdateType } from "./event-updates-logic";

// Real-time event/trip updates from the staff lead. Resolves the per-trip button
// set (standards minus removed plus custom), posts an update, notifies the
// parents of pupils on the trip, and records it for the reports. Pure rules live
// in event-updates-logic.ts.

function tripUpdateSet(updateConfigJson: string): UpdateType[] {
  let cfg: any = {};
  try { cfg = JSON.parse(updateConfigJson || "{}"); } catch { /* ignore */ }
  const custom = Array.isArray(cfg.custom) ? cfg.custom.map((c: any) => c.label ? makeCustomUpdate(c.label, c.icon) : null).filter(Boolean) : [];
  return updateSet({ removed: cfg.removed ?? [], custom });
}

export async function getTripUpdateButtons(tripId: string): Promise<UpdateType[]> {
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { updateConfigJson: true } });
  return tripUpdateSet(trip?.updateConfigJson ?? "{}");
}

/** Configure which buttons a trip shows (tenant admin / lead). */
export async function setTripUpdateConfig(tripId: string, cfg: { removed?: string[]; custom?: { label: string; icon?: string }[] }, actor?: { userId?: string | null }): Promise<void> {
  await prisma.trip.update({ where: { id: tripId }, data: { updateConfigJson: JSON.stringify(cfg) } });
  await recordAudit({ action: AUDIT.EVENT_UPDATE_POSTED, actorUserId: actor?.userId, targetType: "Trip", targetId: tripId, metadata: { configured: true } });
}

/** Post a real-time update; notifies parents of pupils on the trip. */
export async function postEventUpdate(input: { schoolId: string; tripId: string; type: string; note?: string; byUserId?: string | null }): Promise<{ id: string; notified: number }> {
  const trip = await prisma.trip.findFirst({ where: { id: input.tripId, schoolId: input.schoolId }, select: { id: true, title: true, updateConfigJson: true } });
  if (!trip) throw new Error("trip not found");
  const set = tripUpdateSet(trip.updateConfigJson ?? "{}");
  if (!isValidUpdate(input.type, set)) throw new Error("unknown update type for this trip");
  const def = set.find((u) => u.key === input.type)!;

  const students = await prisma.tripStudent.findMany({ where: { tripId: input.tripId }, select: { studentId: true } });
  const studentIds = students.map((s) => s.studentId);
  let notified = 0;
  if (def.notifies && studentIds.length) {
    await notifyStudentGuardians(studentIds, { kind: "event_update", title: `${trip.title}: ${def.label}`, body: input.note ?? undefined, schoolId: input.schoolId, tripId: input.tripId });
    // one notification per guardian-student link
    const links = await prisma.guardianLink.findMany({ where: { studentId: { in: studentIds } }, select: { parentUserId: true } });
    notified = new Set(links.map((l) => l.parentUserId)).size;
  }

  const ev = await prisma.eventUpdate.create({
    data: { schoolId: input.schoolId, tripId: input.tripId, type: input.type, label: def.label, note: input.note ?? null, byUserId: input.byUserId ?? null, notified },
  });
  await recordAudit({ action: AUDIT.EVENT_UPDATE_POSTED, schoolId: input.schoolId, actorUserId: input.byUserId, targetType: "Trip", targetId: input.tripId, metadata: { type: input.type, notified } });
  return { id: ev.id, notified };
}

export async function tripTimeline(tripId: string) {
  const events = await prisma.eventUpdate.findMany({ where: { tripId }, orderBy: { at: "asc" } });
  const set = await getTripUpdateButtons(tripId);
  return { events, progress: tripProgress(events.map((e) => ({ type: e.type, at: e.at })), set) };
}

/** Report rollup of event updates for a school (tenant admin + super admin). */
export async function eventUpdateReport(schoolId?: string | null) {
  const where = schoolId ? { schoolId } : {};
  const trips = await prisma.trip.findMany({ where, select: { id: true, title: true, status: true } });
  const rows = [];
  for (const t of trips) {
    const evs = await prisma.eventUpdate.findMany({ where: { tripId: t.id }, select: { type: true, at: true } });
    const prog = tripProgress(evs.map((e) => ({ type: e.type, at: e.at })));
    rows.push({ trip: t.title, updates: evs.length, complete: prog.complete ? "yes" : "no", status: prog.currentStatus });
  }
  return rows;
}
