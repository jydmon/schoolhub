import { prisma } from "./db";
import { getChildren } from "./parent";
import { studentMatchesEvent } from "./calendar";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export type ParentCalItem = {
  id: string; type: "event" | "trip" | "homework" | "timetable";
  title: string; category: string;
  startsAt: string; endsAt: string | null; allDay: boolean;
  location: string; description: string;
  childIds: string[]; childNames: string[];
  schoolId: string; schoolName: string;
};

// Everything on a parent's consolidated calendar between two dates, across all
// linked children and schools: school events, trips the child is on, homework
// deadlines, and weekly timetable lessons (expanded to occurrences). Each item
// is tagged with which child(ren) and which school it relates to.
export async function parentCalendarItems(userId: string, from: Date, to: Date): Promise<ParentCalItem[]> {
  const children = await getChildren(userId);
  if (children.length === 0) return [];
  const schoolIds = Array.from(new Set(children.map((c) => c.school.id)));
  const schoolName = new Map(children.map((c) => [c.school.id, c.school.name]));
  const items = new Map<string, ParentCalItem>();
  const tag = (it: ParentCalItem, childId: string, childName: string) => { if (!it.childIds.includes(childId)) { it.childIds.push(childId); it.childNames.push(childName); } };

  for (const sid of schoolIds) {
    const kids = children.filter((c) => c.school.id === sid);
    const sname = schoolName.get(sid) || "";

    // Events
    const events = await prisma.calendarEvent.findMany({
      where: { schoolId: sid, status: { not: "cancelled" }, startsAt: { gte: from, lte: to } },
      include: { students: { select: { studentId: true } } },
    });
    for (const e of events) {
      const explicit = new Set(e.students.map((s: any) => s.studentId));
      for (const c of kids) {
        if (!studentMatchesEvent(c.student, e, explicit)) continue;
        const key = `event:${e.id}`;
        let it = items.get(key);
        if (!it) { it = { id: key, type: "event", title: e.title, category: e.category, startsAt: e.startsAt.toISOString(), endsAt: e.endsAt ? e.endsAt.toISOString() : null, allDay: e.allDay, location: e.location || "", description: e.description || "", childIds: [], childNames: [], schoolId: sid, schoolName: sname }; items.set(key, it); }
        tag(it, c.student.id, c.student.firstName);
      }
    }

    // Homework
    const hw = await prisma.homework.findMany({ where: { schoolId: sid, dueAt: { gte: from, lte: to } } });
    for (const h of hw) {
      for (const c of kids) {
        const applies = (!h.classId && !h.yearGroup) || h.classId === c.student.classId || (!!h.yearGroup && h.yearGroup === c.student.yearGroup);
        if (!applies) continue;
        const key = `hw:${h.id}`;
        let it = items.get(key);
        if (!it) { it = { id: key, type: "homework", title: `${h.title}${h.subject ? ` (${h.subject})` : ""}`, category: "homework", startsAt: h.dueAt.toISOString(), endsAt: null, allDay: false, location: "", description: "Homework due", childIds: [], childNames: [], schoolId: sid, schoolName: sname }; items.set(key, it); }
        tag(it, c.student.id, c.student.firstName);
      }
    }

    // Trips the child is on
    const trips = await prisma.trip.findMany({
      where: { schoolId: sid, date: { gte: ymd(from), lte: ymd(to) } },
      include: { students: { select: { studentId: true } } },
    });
    for (const t of trips) {
      const on = new Set(t.students.map((s: any) => s.studentId));
      for (const c of kids) {
        if (!on.has(c.student.id)) continue;
        const t0 = /^\d{1,2}:\d{2}$/.test(t.departureTime || "") ? String(t.departureTime).padStart(5, "0") : null;
        const key = `trip:${t.id}`;
        let it = items.get(key);
        if (!it) { it = { id: key, type: "trip", title: t.title, category: "trip", startsAt: `${t.date}T${t0 || "09:00"}:00`, endsAt: null, allDay: !t0, location: t.destination || t.venue || "", description: t.purpose || "", childIds: [], childNames: [], schoolId: sid, schoolName: sname }; items.set(key, it); }
        tag(it, c.student.id, c.student.firstName);
      }
    }

    // Timetable lessons (weekly) → occurrences within [from, to]
    const tt = await prisma.timetableEntry.findMany({ where: { schoolId: sid } });
    if (tt.length) {
      const teacherIds = Array.from(new Set(tt.map((x) => x.teacherUserId).filter(Boolean))) as string[];
      const teachers = teacherIds.length ? await prisma.user.findMany({ where: { id: { in: teacherIds } }, select: { id: true, fullName: true } }) : [];
      const tname = new Map(teachers.map((x) => [x.id, x.fullName]));
      for (let d = new Date(from); d <= to; d = new Date(d.getTime() + 86400000)) {
        const dow = ((d.getDay() + 6) % 7) + 1;
        const ds = ymd(d);
        for (const l of tt.filter((x) => x.dayOfWeek === dow)) {
          for (const c of kids) {
            const applies = (l.className && l.className === (c.student as any).class?.name) || (l.yearGroup && l.yearGroup === c.student.yearGroup) || (!l.className && !l.yearGroup);
            if (!applies) continue;
            const key = `tt:${l.id}:${ds}:${c.student.id}`;
            const it: ParentCalItem = { id: key, type: "timetable", title: `${l.subject}${l.room ? ` (${l.room})` : ""}`, category: "timetable", startsAt: `${ds}T${String(l.startTime).padStart(5, "0")}:00`, endsAt: `${ds}T${String(l.endTime).padStart(5, "0")}:00`, allDay: false, location: l.room || "", description: [l.className || l.yearGroup, l.teacherUserId ? tname.get(l.teacherUserId) : ""].filter(Boolean).join(" · "), childIds: [c.student.id], childNames: [c.student.firstName], schoolId: sid, schoolName: sname };
            items.set(key, it);
          }
        }
      }
    }
  }

  return [...items.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
