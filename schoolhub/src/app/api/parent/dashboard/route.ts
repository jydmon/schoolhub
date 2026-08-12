import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { getChildren } from "@/lib/parent";
import { parentCalendarItems } from "@/lib/parent-calendar";
import { parentReports } from "@/lib/reports-release";
import { policiesForUser } from "@/lib/my-policies";
import { handleError, ok } from "@/lib/http";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// A single aggregated payload powering the parent dashboard widgets. Everything
// is scoped to the requesting parent's linked children only.
export async function GET() {
  try {
    const ctx = await requireAuth();
    const children = await getChildren(ctx.userId);
    const now = new Date();
    const day = 86400000;
    const since60 = ymd(new Date(now.getTime() - 60 * day));

    const childrenOut = children.map((c) => ({
      id: c.student.id,
      name: `${c.student.firstName} ${c.student.lastName}`.trim(),
      firstName: c.student.firstName,
      yearGroup: c.student.yearGroup,
      className: (c.student as any).class?.name || null,
      photoUrl: c.student.photoUrl,
      schoolId: c.school.id,
      schoolName: c.school.name,
    }));

    // Per-child attendance + behaviour summaries.
    const perChild = await Promise.all(children.map(async (c) => {
      const [attendance, behaviour] = await Promise.all([
        prisma.attendanceRecord.findMany({ where: { studentId: c.student.id, date: { gte: since60 } }, select: { status: true } }),
        prisma.rewardRecord.findMany({ where: { studentId: c.student.id, at: { gte: new Date(now.getTime() - 60 * day) } }, select: { points: true, positive: true } }),
      ]);
      const cnt = (st: string) => attendance.filter((a) => a.status === st).length;
      const present = cnt("present"), late = cnt("late"), total = attendance.length;
      const absent = cnt("unauthorised") + cnt("absent");
      const rate = total ? Math.round(((present + late) / total) * 100) : null;
      const posPts = behaviour.filter((b) => b.positive).reduce((s, b) => s + (b.points || 0), 0);
      const negPts = behaviour.filter((b) => !b.positive).reduce((s, b) => s + (b.points || 0), 0);
      return {
        id: c.student.id,
        attendance: { rate, present, late, absent, authorised: cnt("authorised"), total },
        behaviour: { positivePoints: posPts, negativePoints: negPts, positiveCount: behaviour.filter((b) => b.positive).length, negativeCount: behaviour.filter((b) => !b.positive).length },
      };
    }));

    // Consolidated calendar for the next 14 days (events, trips, homework, timetable).
    const from = new Date(now); from.setHours(0, 0, 0, 0);
    const to14 = new Date(from.getTime() + 14 * day - 1);
    const items = await parentCalendarItems(ctx.userId, from, to14).catch(() => []);
    const upcomingEvents = items.filter((i) => i.type === "event" || i.type === "trip").slice(0, 12);
    const to7 = new Date(from.getTime() + 7 * day - 1).toISOString();
    const homeworkDue = items.filter((i) => i.type === "homework" && i.startsAt <= to7).slice(0, 12);

    // Today's timetable highlights (first few lessons across children).
    const todayStr = ymd(now);
    const timetableToday = items.filter((i) => i.type === "timetable" && i.startsAt.slice(0, 10) === todayStr)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 12);

    // Recent reports, outstanding policies, announcements.
    const [reportsAll, policies, notifications] = await Promise.all([
      parentReports(ctx.userId, now).catch(() => [] as any[]),
      policiesForUser(ctx.userId).catch(() => [] as any[]),
      prisma.notification.findMany({ where: { userId: ctx.userId }, orderBy: { createdAt: "desc" }, take: 30 }),
    ]);
    const nameOf = new Map(childrenOut.map((c) => [c.id, c.firstName]));
    const recentReports = (reportsAll as any[]).slice(0, 6).map((r) => ({
      id: r.id, title: r.title, term: r.term, releasedAt: r.releasedAt || r.at,
      childName: r.student?.id ? nameOf.get(r.student.id) || r.student?.firstName : null,
    }));
    const outstandingPolicies = (policies as any[]).filter((p) => p.mandatory && !p.acknowledged)
      .map((p) => ({ id: p.id, title: p.title, category: p.category, version: p.version }));
    const announcements = notifications.filter((n) => ["announcement", "newsletter", "message", "general"].includes((n.kind || "").toLowerCase()) || !n.studentId)
      .slice(0, 6).map((n) => ({ id: n.id, title: n.title, body: n.body, at: n.createdAt, read: n.read, kind: n.kind }));
    const unreadCount = notifications.filter((n) => !n.read).length;

    // Lightweight rule-based "AI insights" — no LLM call on dashboard load.
    const insights: { tone: string; text: string }[] = [];
    for (const c of childrenOut) {
      const s = perChild.find((p) => p.id === c.id);
      if (!s) continue;
      if (s.attendance.rate != null && s.attendance.rate < 90) insights.push({ tone: "warn", text: `${c.firstName}'s attendance is ${s.attendance.rate}% over the last 60 days — below 90%.` });
      if (s.attendance.absent > 0 && s.attendance.rate != null && s.attendance.rate >= 90) insights.push({ tone: "info", text: `${c.firstName} has ${s.attendance.absent} absence${s.attendance.absent === 1 ? "" : "s"} recorded recently.` });
      if (s.behaviour.positivePoints > 0) insights.push({ tone: "good", text: `${c.firstName} earned ${s.behaviour.positivePoints} positive point${s.behaviour.positivePoints === 1 ? "" : "s"} recently — nice work!` });
      if (s.behaviour.negativeCount >= 3) insights.push({ tone: "warn", text: `${c.firstName} has ${s.behaviour.negativeCount} behaviour notes to review.` });
    }
    if (outstandingPolicies.length) insights.push({ tone: "warn", text: `${outstandingPolicies.length} school ${outstandingPolicies.length === 1 ? "policy needs" : "policies need"} your acknowledgement.` });
    if (homeworkDue.length) insights.push({ tone: "info", text: `${homeworkDue.length} homework deadline${homeworkDue.length === 1 ? "" : "s"} in the next 7 days.` });
    if (upcomingEvents.length) insights.push({ tone: "info", text: `${upcomingEvents.length} event${upcomingEvents.length === 1 ? "" : "s"} or trip${upcomingEvents.length === 1 ? "" : "s"} coming up in the next 2 weeks.` });

    return ok({
      children: childrenOut,
      perChild,
      upcomingEvents,
      homeworkDue,
      timetableToday,
      recentReports,
      outstandingPolicies,
      announcements,
      unreadCount,
      insights: insights.slice(0, 8),
    });
  } catch (err) { return handleError(err); }
}
