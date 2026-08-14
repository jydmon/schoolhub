import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { getChildren } from "@/lib/parent";
import { parentReports } from "@/lib/reports-release";
import { recordDownload, brandedPdf } from "@/lib/download";
import { handleError, ok } from "@/lib/http";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ALL_SECTIONS = ["attendance", "behaviour", "homework", "academic", "trips", "communications"];

// Customised parent report: pick children, a date range, and which sections to
// include. Returns JSON for on-screen preview, or a PDF when format=pdf.
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const children = await getChildren(ctx.userId);
    const url = new URL(req.url);
    const q = url.searchParams;

    const now = new Date();
    const from = q.get("from") || ymd(new Date(now.getTime() - 30 * 86400000));
    const to = q.get("to") || ymd(now);
    const fromDt = new Date(`${from}T00:00:00`);
    const toDt = new Date(`${to}T23:59:59`);
    const childFilter = q.get("child") || "all";
    const schoolFilter = q.get("school") || "all";
    const sections = (q.get("sections") || ALL_SECTIONS.join(",")).split(",").map((s) => s.trim()).filter((s) => ALL_SECTIONS.includes(s));
    const wantPdf = q.get("format") === "pdf";

    const selected = children.filter((c) =>
      (childFilter === "all" || c.student.id === childFilter) &&
      (schoolFilter === "all" || c.school.id === schoolFilter));

    // Academic reports (all children) once, filtered per child below.
    const allReports = sections.includes("academic") ? await parentReports(ctx.userId, now).catch(() => [] as any[]) : [];

    const perChild = await Promise.all(selected.map(async (c) => {
      const sid = c.school.id, studentId = c.student.id;
      const out: any = { id: studentId, name: `${c.student.firstName} ${c.student.lastName}`.trim(), yearGroup: c.student.yearGroup, className: (c.student as any).class?.name || null, schoolName: c.school.name };

      if (sections.includes("attendance")) {
        const recs = await prisma.attendanceRecord.findMany({ where: { studentId, date: { gte: from, lte: to } }, orderBy: { date: "desc" } });
        const cnt = (st: string) => recs.filter((a) => a.status === st).length;
        const present = cnt("present"), late = cnt("late"), total = recs.length;
        out.attendance = { rate: total ? Math.round(((present + late) / total) * 100) : null, present, late, absent: cnt("unauthorised") + cnt("absent"), authorised: cnt("authorised"), total, records: recs.slice(0, 60).map((a) => ({ date: a.date, session: a.session, status: a.status, note: a.note })) };
      }
      if (sections.includes("behaviour")) {
        const recs = await prisma.rewardRecord.findMany({ where: { studentId, at: { gte: fromDt, lte: toDt } }, orderBy: { at: "desc" } });
        out.behaviour = { positivePoints: recs.filter((r) => r.positive).reduce((s, r) => s + (r.points || 0), 0), negativePoints: recs.filter((r) => !r.positive).reduce((s, r) => s + (r.points || 0), 0), records: recs.slice(0, 80).map((r) => ({ at: r.at, type: r.type, points: r.points, positive: r.positive, note: r.note, teacherName: r.teacherName })) };
      }
      if (sections.includes("homework")) {
        const hw = await prisma.homework.findMany({ where: { schoolId: sid, dueAt: { gte: fromDt, lte: toDt } }, orderBy: { dueAt: "desc" } });
        const mine = hw.filter((h) => (!h.classId && !h.yearGroup) || h.classId === c.student.classId || (!!h.yearGroup && h.yearGroup === c.student.yearGroup));
        out.homework = mine.map((h) => ({ id: h.id, title: h.title, subject: h.subject, dueAt: h.dueAt }));
      }
      if (sections.includes("academic")) {
        out.academic = (allReports as any[]).filter((r) => r.student?.id === studentId && new Date(r.releasedAt || r.at) >= fromDt && new Date(r.releasedAt || r.at) <= toDt)
          .map((r) => ({ id: r.id, title: r.title, term: r.term, releasedAt: r.releasedAt || r.at }));
      }
      if (sections.includes("trips")) {
        const ts = await prisma.tripStudent.findMany({ where: { studentId }, include: { trip: { select: { title: true, date: true, destination: true, paymentStatus: true } } } });
        out.trips = ts.filter((t) => t.trip.date >= from && t.trip.date <= to).map((t) => ({ title: t.trip.title, date: t.trip.date, destination: t.trip.destination, consent: t.consent, paymentStatus: t.trip.paymentStatus }));
      }
      if (sections.includes("communications")) {
        const cm = await prisma.notification.findMany({ where: { userId: ctx.userId, OR: [{ studentId }, { studentId: null }], createdAt: { gte: fromDt, lte: toDt } }, orderBy: { createdAt: "desc" }, take: 60 });
        out.communications = cm.map((n) => ({ title: n.title, body: n.body, at: n.createdAt, kind: n.kind }));
      }
      return out;
    }));

    const meta = { from, to, sections, generatedAt: now, parentEmail: ctx.email };

    if (wantPdf) {
      const paras: string[] = [];
      paras.push(`Reporting period: ${from} to ${to}`);
      paras.push("");
      const dt = (v: any) => (v ? new Date(v).toLocaleDateString() : "—");
      for (const c of perChild) {
        paras.push("========================================");
        paras.push(`${c.name}  ·  ${[c.yearGroup, c.className].filter(Boolean).join(" / ") || ""}  ·  ${c.schoolName}`);
        paras.push("========================================");
        if (c.attendance) {
          paras.push(`ATTENDANCE: ${c.attendance.rate == null ? "no data" : c.attendance.rate + "%"} (present ${c.attendance.present}, late ${c.attendance.late}, absent ${c.attendance.absent}, authorised ${c.attendance.authorised}, sessions ${c.attendance.total})`);
          for (const r of c.attendance.records.slice(0, 20)) paras.push(`  ${r.date} ${r.session || ""} — ${r.status}${r.note ? " (" + r.note + ")" : ""}`);
        }
        if (c.behaviour) {
          paras.push(`BEHAVIOUR: +${c.behaviour.positivePoints} positive / -${c.behaviour.negativePoints} negative points`);
          for (const r of c.behaviour.records.slice(0, 20)) paras.push(`  ${dt(r.at)} ${r.positive ? "＋" : "－"} ${r.type || ""} ${r.points || ""} ${r.note || ""}`.trim());
        }
        if (c.homework) { paras.push(`HOMEWORK (${c.homework.length}):`); for (const h of c.homework) paras.push(`  due ${dt(h.dueAt)} — ${h.title}${h.subject ? " (" + h.subject + ")" : ""}`); }
        if (c.academic) { paras.push(`ACADEMIC REPORTS (${c.academic.length}):`); for (const r of c.academic) paras.push(`  ${dt(r.releasedAt)} — ${r.title}${r.term ? " · " + r.term : ""}`); }
        if (c.trips) { paras.push(`TRIPS (${c.trips.length}):`); for (const t of c.trips) paras.push(`  ${t.date} — ${t.title}${t.destination ? " @ " + t.destination : ""} · consent ${t.consent}`); }
        if (c.communications) { paras.push(`COMMUNICATIONS (${c.communications.length}):`); for (const m of c.communications.slice(0, 25)) paras.push(`  ${dt(m.at)} — ${m.title}`); }
        paras.push("");
      }
      if (perChild.length === 0) paras.push("No children match the selected filters.");
      const dmeta = await recordDownload(ctx, { section: "Reports", reportName: `Family report (${from} to ${to})`, format: "pdf" });
      const pdf = brandedPdf(dmeta, "Family report", paras);
      return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="family-report-${from}_to_${to}.pdf"` } });
    }

    return ok({ meta, children: children.map((c) => ({ id: c.student.id, name: `${c.student.firstName} ${c.student.lastName}`.trim(), firstName: c.student.firstName, schoolId: c.school.id, schoolName: c.school.name })), report: perChild });
  } catch (err) { return handleError(err); }
}
