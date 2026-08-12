import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { requireTeacherScope } from "@/lib/teacher";
import { handleError, ok } from "@/lib/http";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Consolidated calendar for a teacher: school events, their trips, and their
// timetable lessons expanded to occurrences, within [from, to].
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const q = new URL(req.url).searchParams;
    const scope = await requireTeacherScope(ctx.userId, q.get("school") || undefined);
    const now = new Date();
    const from = q.get("from") ? new Date(`${q.get("from")}T00:00:00`) : new Date(now.getFullYear(), now.getMonth(), 1);
    const to = q.get("to") ? new Date(`${q.get("to")}T23:59:59`) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const sid = scope.schoolId;

    const [events, trips, tt] = await Promise.all([
      prisma.calendarEvent.findMany({ where: { schoolId: sid, status: { not: "cancelled" }, startsAt: { gte: from, lte: to } }, orderBy: { startsAt: "asc" } }),
      scope.tripIds.length ? prisma.trip.findMany({ where: { id: { in: scope.tripIds }, date: { gte: ymd(from), lte: ymd(to) } } }) : [],
      prisma.timetableEntry.findMany({ where: { schoolId: sid, teacherUserId: ctx.userId } }),
    ]);

    const items: any[] = [];
    for (const e of events) items.push({ id: `event:${e.id}`, type: "event", title: e.title, category: e.category, startsAt: e.startsAt.toISOString(), endsAt: e.endsAt ? e.endsAt.toISOString() : null, allDay: e.allDay, location: e.location || "" });
    for (const t of trips) items.push({ id: `trip:${t.id}`, type: "trip", title: t.title, category: "trip", startsAt: `${t.date}T09:00:00`, endsAt: null, allDay: true, location: t.destination || "" });
    if (tt.length) {
      for (let d = new Date(from); d <= to; d = new Date(d.getTime() + 86400000)) {
        const dow = ((d.getDay() + 6) % 7) + 1; const ds = ymd(d);
        for (const l of tt.filter((x) => x.dayOfWeek === dow)) {
          items.push({ id: `tt:${l.id}:${ds}`, type: "lesson", title: `${l.subject}${l.className ? ` · ${l.className}` : l.yearGroup ? ` · ${l.yearGroup}` : ""}`, category: "lesson", startsAt: `${ds}T${String(l.startTime).padStart(5, "0")}:00`, endsAt: `${ds}T${String(l.endTime).padStart(5, "0")}:00`, allDay: false, location: l.room || "" });
        }
      }
    }
    items.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return ok({ items });
  } catch (err) { return handleError(err); }
}
