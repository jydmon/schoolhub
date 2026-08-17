import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { requireTeacherScope } from "@/lib/teacher";
import { handleError, ok } from "@/lib/http";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// GET — a combined calendar for the teacher: school events, the trips they
// lead/supervise, and dated instances of their own timetable lessons over the
// next few weeks. Each item is { id, type, title, startsAt, allDay, location }.
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const scope = await requireTeacherScope(ctx.userId, new URL(req.url).searchParams.get("school") || undefined);
    const now = new Date();
    const windowEnd = new Date(now.getTime() + 45 * 86400000);

    const [events, trips, lessons] = await Promise.all([
      prisma.calendarEvent.findMany({
        where: { schoolId: scope.schoolId, status: { not: "cancelled" }, startsAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1), lte: windowEnd } },
        orderBy: { startsAt: "asc" }, take: 200,
      }),
      scope.tripIds.length ? prisma.trip.findMany({ where: { id: { in: scope.tripIds }, status: { not: "cancelled" } }, orderBy: { date: "asc" } }) : [],
      prisma.timetableEntry.findMany({ where: { schoolId: scope.schoolId, teacherUserId: ctx.userId } }),
    ]);

    const items: { id: string; type: string; title: string; startsAt: string; allDay: boolean; location: string | null }[] = [];

    for (const e of events) items.push({ id: `e-${e.id}`, type: "event", title: e.title, startsAt: e.startsAt.toISOString(), allDay: e.allDay, location: e.location ?? null });
    for (const t of trips) items.push({ id: `t-${t.id}`, type: "trip", title: t.title, startsAt: `${t.date}T00:00:00`, allDay: true, location: t.destination ?? null });

    // Expand recurring lessons into dated instances for the next 21 days.
    for (let i = 0; i < 21; i++) {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const dow = ((day.getDay() + 6) % 7) + 1; // Monday = 1 … Sunday = 7
      for (const l of lessons.filter((x) => x.dayOfWeek === dow)) {
        items.push({ id: `l-${l.id}-${ymd(day)}`, type: "lesson", title: l.subject, startsAt: `${ymd(day)}T${l.startTime || "09:00"}:00`, allDay: false, location: l.room || l.className || l.yearGroup || null });
      }
    }

    items.sort((a, b) => (a.startsAt < b.startsAt ? -1 : a.startsAt > b.startsAt ? 1 : 0));
    return ok({ items });
  } catch (err) { return handleError(err); }
}
