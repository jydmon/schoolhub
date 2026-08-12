import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { getChildren } from "@/lib/parent";
import { parentReports } from "@/lib/reports-release";
import { handleError, ok } from "@/lib/http";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Everything a parent may see about ONE of their children, in one call. The
// child must belong to the requesting parent (checked via getChildren).
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const children = await getChildren(ctx.userId);
    if (children.length === 0) return ok({ error: "No children linked" }, 404);
    const wanted = new URL(req.url).searchParams.get("student");
    const c = (wanted && children.find((x) => x.student.id === wanted)) || children[0];
    const sid = c.school.id;
    const studentId = c.student.id;
    const now = new Date();
    const since = ymd(new Date(now.getTime() - 60 * 86400000));

    const [attendance, behaviour, homework, trips, guardians, comms, allReports] = await Promise.all([
      prisma.attendanceRecord.findMany({ where: { studentId, date: { gte: since } }, orderBy: { date: "desc" }, take: 120 }),
      prisma.rewardRecord.findMany({ where: { studentId }, orderBy: { at: "desc" }, take: 40 }),
      prisma.homework.findMany({ where: { schoolId: sid, dueAt: { gte: new Date(now.getTime() - 3 * 86400000) } }, orderBy: { dueAt: "asc" }, take: 40 }),
      prisma.tripStudent.findMany({ where: { studentId }, include: { trip: { select: { id: true, title: true, date: true, destination: true, consentRequired: true, paymentStatus: true } } } }),
      prisma.guardianLink.findMany({ where: { studentId }, include: { parent: { select: { fullName: true, email: true, phone: true } } } }),
      prisma.notification.findMany({ where: { userId: ctx.userId, OR: [{ studentId }, { studentId: null }] }, orderBy: { createdAt: "desc" }, take: 25 }),
      parentReports(ctx.userId, now).catch(() => []),
    ]);

    // Homework applicable to this child (class/year or whole school).
    const className = (c.student as any).class?.name || null;
    const hw = homework.filter((h) => (!h.classId && !h.yearGroup) || h.classId === c.student.classId || (!!h.yearGroup && h.yearGroup === c.student.yearGroup));

    // Attendance summary over the window.
    const cnt = (st: string) => attendance.filter((a) => a.status === st).length;
    const present = cnt("present"), late = cnt("late"), total = attendance.length;
    const attendanceRate = total ? Math.round(((present + late) / total) * 100) : null;

    const reports = (allReports as any[]).filter((r) => r.student?.id === studentId);

    return ok({
      child: {
        id: studentId, name: `${c.student.firstName} ${c.student.lastName}`.trim(), reference: c.student.reference,
        yearGroup: c.student.yearGroup, className, house: c.student.house, status: c.student.status,
        dateOfBirth: c.student.dateOfBirth, photoUrl: c.student.photoUrl,
        medicalAlert: c.student.medicalAlert, allergies: c.student.allergies, sendIndicator: c.student.sendIndicator,
        schoolId: sid, schoolName: c.school.name,
      },
      attendance: { summary: { rate: attendanceRate, present, late, total, absent: cnt("unauthorised") + cnt("absent"), authorised: cnt("authorised") }, records: attendance.slice(0, 40).map((a) => ({ date: a.date, session: a.session, status: a.status, note: a.note })) },
      behaviour: behaviour.map((b) => ({ id: b.id, type: b.type, points: b.points, positive: b.positive, note: b.note, teacherName: b.teacherName, at: b.at })),
      homework: hw.map((h) => ({ id: h.id, title: h.title, subject: h.subject, dueAt: h.dueAt })),
      trips: trips.map((t) => ({ id: t.trip.id, title: t.trip.title, date: t.trip.date, destination: t.trip.destination, consent: t.consent, consentRequired: t.trip.consentRequired, paymentStatus: t.trip.paymentStatus })),
      emergencyContacts: guardians.map((g) => ({ name: g.parent?.fullName, phone: g.parent?.phone, email: g.parent?.email, relationship: (g as any).relationship })),
      communications: comms.map((n) => ({ id: n.id, title: n.title, body: n.body, at: n.createdAt, read: n.read })),
      reports: reports.map((r: any) => ({ id: r.id, title: r.title, term: r.term, releasedAt: r.releasedAt || r.at, url: r.url || null })),
    });
  } catch (err) { return handleError(err); }
}
