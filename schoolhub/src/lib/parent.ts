import { prisma } from "./db";
import { studentMatchesEvent } from "./calendar";

export type RangeKey = "today" | "tomorrow" | "week" | "month";

export function rangeBounds(key: RangeKey, now: Date) {
  const d0 = new Date(now); d0.setHours(0, 0, 0, 0);
  const day = 24 * 3600 * 1000;
  if (key === "today") return { from: d0, to: new Date(d0.getTime() + day - 1), label: "Today" };
  if (key === "tomorrow") return { from: new Date(d0.getTime() + day), to: new Date(d0.getTime() + 2 * day - 1), label: "Tomorrow" };
  if (key === "week") return { from: d0, to: new Date(d0.getTime() + 7 * day - 1), label: "This week" };
  const end = new Date(d0.getFullYear(), d0.getMonth() + 1, 0, 23, 59, 59);
  return { from: d0, to: end, label: "This month" };
}

/** A parent's children with school context. */
export async function getChildren(userId: string) {
  const links = await prisma.guardianLink.findMany({
    where: { parentUserId: userId },
    include: {
      student: { include: { school: { include: { config: true } }, class: { select: { name: true } } } },
    },
  });
  return links.map((l) => ({
    linkId: l.id,
    student: l.student,
    school: l.student.school,
    relationship: (l as any).relationship ?? null,
    startTime: l.student.school.config?.schoolStartTime ?? "08:45",
  }));
}

type Item = any;

/** Build the parent dashboard payload for a date range across all children/schools. */
export async function getOverview(userId: string, key: RangeKey, now: Date) {
  const { from, to, label } = rangeBounds(key, now);
  const children = await getChildren(userId);

  const childrenOut = children.map((c) => ({
    id: c.student.id,
    name: `${c.student.firstName} ${c.student.lastName}`,
    schoolId: c.school.id,
    schoolName: c.school.name,
    startTime: c.startTime,
  }));

  // Fetch events + homework once per distinct school.
  const schoolIds = Array.from(new Set(children.map((c) => c.school.id)));
  const eventsBySchool = new Map<string, any[]>();
  const homeworkBySchool = new Map<string, any[]>();
  for (const sid of schoolIds) {
    eventsBySchool.set(sid, await prisma.calendarEvent.findMany({
      where: {
        schoolId: sid,
        status: { not: "cancelled" },
        startsAt: { lte: to },
        OR: [{ endsAt: { gte: from } }, { endsAt: null, startsAt: { gte: from } }],
      },
      include: { students: { select: { studentId: true } } },
      orderBy: { startsAt: "asc" },
    }));
    homeworkBySchool.set(sid, await prisma.homework.findMany({
      where: { schoolId: sid, dueAt: { gte: from, lte: to } },
      orderBy: { dueAt: "asc" },
    }));
  }

  const schoolName = new Map(children.map((c) => [c.school.id, c.school.name]));

  // Events → annotated items (deduped by event, listing matching children).
  const eventItems = new Map<string, Item>();
  const consentNeeded: Item[] = [];
  for (const c of children) {
    const evs = eventsBySchool.get(c.school.id) ?? [];
    for (const e of evs) {
      const explicit = new Set(e.students.map((s: any) => s.studentId));
      if (!studentMatchesEvent(c.student, e, explicit)) continue;
      let item = eventItems.get(e.id);
      if (!item) {
        item = {
          id: e.id, schoolId: c.school.id, title: e.title, category: e.category, startsAt: e.startsAt, endsAt: e.endsAt,
          allDay: e.allDay, location: e.location, transportRequired: e.transportRequired,
          collectionAt: e.collectionAt, collectionLocation: e.collectionLocation, equipment: e.equipment,
          clothing: e.clothing, packedLunch: e.packedLunch, club: e.club, consentRequired: e.consentRequired,
          paymentRef: e.paymentRef, schoolName: schoolName.get(c.school.id), childIds: [], childNames: [],
        };
        eventItems.set(e.id, item);
      }
      item.childIds.push(c.student.id);
      item.childNames.push(`${c.student.firstName}`);
    }
  }

  // Homework → annotated items.
  const hwItems = new Map<string, Item>();
  for (const c of children) {
    const hws = homeworkBySchool.get(c.school.id) ?? [];
    for (const h of hws) {
      const matches = (!h.classId && !h.yearGroup) || h.classId === c.student.classId || (!!h.yearGroup && h.yearGroup === c.student.yearGroup);
      if (!matches) continue;
      let item = hwItems.get(h.id);
      if (!item) {
        item = { id: h.id, title: h.title, subject: h.subject, dueAt: h.dueAt, schoolName: schoolName.get(c.school.id), childIds: [], childNames: [] };
        hwItems.set(h.id, item);
      }
      item.childIds.push(c.student.id);
      item.childNames.push(`${c.student.firstName}`);
    }
  }

  // Outstanding actions = consentRequired events with no consent row for (event, child, guardian).
  const consentEvents = [...eventItems.values()].filter((e) => e.consentRequired);
  if (consentEvents.length) {
    const existing = await prisma.eventConsent.findMany({
      where: { guardianUserId: userId, eventId: { in: consentEvents.map((e) => e.id) } },
    });
    const done = new Set(existing.map((c) => `${c.eventId}:${c.studentId}`));
    for (const e of consentEvents) {
      for (const childId of e.childIds) {
        if (done.has(`${e.id}:${childId}`)) continue;
        const child = childrenOut.find((c) => c.id === childId);
        consentNeeded.push({
          type: "consent", eventId: e.id, studentId: childId, childName: child?.name,
          title: e.title, startsAt: e.startsAt, paymentRef: e.paymentRef,
        });
      }
    }
  }

  return {
    rangeKey: key, rangeLabel: label, from, to,
    children: childrenOut,
    events: [...eventItems.values()].sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt)),
    homework: [...hwItems.values()].sort((a, b) => +new Date(a.dueAt) - +new Date(b.dueAt)),
    outstanding: consentNeeded,
  };
}

/** All upcoming events (next ~120 days) that apply to a user's children — for the ICS feed. */
export async function getFeedEvents(userId: string, now: Date) {
  const children = await getChildren(userId);
  const to = new Date(now.getTime() + 120 * 24 * 3600 * 1000);
  const from = new Date(now.getTime() - 24 * 3600 * 1000);
  const schoolIds = Array.from(new Set(children.map((c) => c.school.id)));
  const out = new Map<string, any>();
  for (const sid of schoolIds) {
    const evs = await prisma.calendarEvent.findMany({
      where: { schoolId: sid, status: { not: "cancelled" }, startsAt: { gte: from, lte: to } },
      include: { students: { select: { studentId: true } } },
    });
    for (const c of children.filter((x) => x.school.id === sid)) {
      for (const e of evs) {
        const explicit = new Set(e.students.map((s: any) => s.studentId));
        if (studentMatchesEvent(c.student, e, explicit)) out.set(e.id, e);
      }
    }
  }
  return [...out.values()];
}
