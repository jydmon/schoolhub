import { prisma } from "../db";
import { studentMatchesEvent } from "../calendar";
import { docVisibleToParent, docSearchableByStaff, docText } from "../documents";
import { EVENT_CATEGORY_LABELS, DOCUMENT_CATEGORY_LABELS, ROLES } from "../constants";

const STAFF_ROLES: string[] = [ROLES.SCHOOL_ADMIN, ROLES.SCHOOL_LEADER, ROLES.TEACHER, ROLES.TRANSPORT_MANAGER, ROLES.SUPPORT_STAFF];

export type SourceRecord = {
  id: string;
  type: "document" | "event" | "homework";
  title: string;
  text: string;
  date: Date | null;
  sourceLabel: string;
  url: string | null;
  schoolId: string;
};

export type Context = {
  records: SourceRecord[];
  isStaff: boolean;
  hasChildren: boolean;
  schoolIds: string[];
};

/**
 * Gather everything a user is authorised to see, from every source, respecting
 * per-school role. This is the permission boundary for the assistant: a record
 * only enters the context if the caller may access it.
 */
export async function gatherContext(userId: string, opts: { schoolId?: string } = {}): Promise<Context> {
  const memberships = await prisma.membership.findMany({ where: { userId } });
  const rolesBySchool = new Map<string, string[]>();
  for (const m of memberships) rolesBySchool.set(m.schoolId, [...(rolesBySchool.get(m.schoolId) ?? []), m.role]);

  const guardianLinks = await prisma.guardianLink.findMany({
    where: { parentUserId: userId },
    include: { student: true },
  });
  const childrenBySchool = new Map<string, any[]>();
  for (const g of guardianLinks) childrenBySchool.set(g.schoolId, [...(childrenBySchool.get(g.schoolId) ?? []), g.student]);

  let schoolIds = Array.from(new Set([...rolesBySchool.keys(), ...childrenBySchool.keys()]));
  if (opts.schoolId) schoolIds = schoolIds.filter((s) => s === opts.schoolId);

  const isStaffIn = (sid: string) => (rolesBySchool.get(sid) ?? []).some((r) => STAFF_ROLES.includes(r));
  const records: SourceRecord[] = [];
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const to = new Date(now.getTime() + 90 * 24 * 3600 * 1000);

  for (const sid of schoolIds) {
    const staff = isStaffIn(sid);
    const children = childrenBySchool.get(sid) ?? [];

    // Documents
    const docs = await prisma.document.findMany({ where: { schoolId: sid }, take: 500 });
    for (const d of docs) {
      const visible = staff ? docSearchableByStaff(d, now) : docVisibleToParent(d, now);
      if (!visible) continue;
      records.push({
        id: d.id, type: "document", title: d.title, text: docText(d), date: d.effectiveDate ?? d.updatedAt,
        sourceLabel: `${DOCUMENT_CATEGORY_LABELS[d.category] || d.category} · v${d.version}`,
        url: d.linkUrl || null, schoolId: sid,
      });
    }

    // Events
    const events = await prisma.calendarEvent.findMany({
      where: { schoolId: sid, status: { not: "cancelled" }, startsAt: { gte: from, lte: to } },
      include: { students: { select: { studentId: true } } },
    });
    for (const e of events) {
      if (!staff) {
        const explicit = new Set(e.students.map((s: any) => s.studentId));
        const applies = children.some((c) => studentMatchesEvent(c, e, explicit));
        if (!applies) continue;
      }
      const logistics = [
        e.location && `Location: ${e.location}`, e.equipment && `Equipment: ${e.equipment}`,
        e.clothing && `Clothing: ${e.clothing}`, e.packedLunch && "Packed lunch required",
        e.transportRequired && "Transport required", e.collectionAt && `Collection ${new Date(e.collectionAt).toLocaleString()}`,
        e.consentRequired && "Consent required", e.paymentRef && `Payment ref ${e.paymentRef}`,
      ].filter(Boolean).join(". ");
      records.push({
        id: e.id, type: "event", title: e.title,
        text: `${e.title}. ${EVENT_CATEGORY_LABELS[e.category] || e.category}. ${e.description || ""} ${logistics}`,
        date: e.startsAt, sourceLabel: "School calendar", url: null, schoolId: sid,
      });
    }

    // Homework
    const hw = await prisma.homework.findMany({ where: { schoolId: sid, dueAt: { gte: from, lte: to } } });
    for (const h of hw) {
      if (!staff) {
        const applies = children.some((c) => (!h.classId && !h.yearGroup) || h.classId === c.classId || (!!h.yearGroup && h.yearGroup === c.yearGroup));
        if (!applies) continue;
      }
      records.push({
        id: h.id, type: "homework", title: h.title, text: `Homework: ${h.title}. ${h.subject || ""} ${h.description || ""}`,
        date: h.dueAt, sourceLabel: "Homework", url: null, schoolId: sid,
      });
    }
  }

  return {
    records,
    isStaff: schoolIds.some((s) => isStaffIn(s)),
    hasChildren: guardianLinks.length > 0,
    schoolIds,
  };
}
