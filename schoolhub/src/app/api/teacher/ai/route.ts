import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { requireTeacherScope } from "@/lib/teacher";
import { SourceRecord } from "@/lib/ai/retrieval";
import { rank, composeAnswer } from "@/lib/ai/answer";
import { maybeLlmAnswer } from "@/lib/ai/llm";
import { matchGuidance } from "@/lib/ai/guidance";
import { EVENT_CATEGORY_LABELS } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Teacher AI assistant. The retrieval context is built ONLY from the teacher's
// assigned pupils, classes, subjects and trips, plus non-personal whole-school
// info (events, policies, menus). It never sees pupils outside their scope.
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const b = await req.json().catch(() => ({}));
    const question = String(b.question || "").trim();
    const lang = b.lang || "en";
    if (!question) return ok({ error: "Ask a question." }, 400);
    const scope = await requireTeacherScope(ctx.userId, b.school || undefined);
    const sid = scope.schoolId;
    const now = new Date();

    const records: SourceRecord[] = [];
    const ids = scope.studentIds;

    if (ids.length) {
      const [students, behaviour, attendance, reports, tt] = await Promise.all([
        prisma.student.findMany({ where: { id: { in: ids } }, include: { class: { select: { name: true } } } }),
        prisma.rewardRecord.findMany({ where: { studentId: { in: ids } }, include: { student: { select: { firstName: true, lastName: true } } }, orderBy: { at: "desc" }, take: 200 }),
        prisma.attendanceRecord.findMany({ where: { studentId: { in: ids }, date: { gte: ymd(new Date(now.getTime() - 60 * 86400000)) } }, select: { studentId: true, status: true } }),
        prisma.studentReport.findMany({ where: { schoolId: sid, studentId: { in: ids } }, include: { student: { select: { firstName: true, lastName: true } } }, orderBy: { updatedAt: "desc" }, take: 100 }),
        prisma.timetableEntry.findMany({ where: { schoolId: sid, teacherUserId: ctx.userId } }),
      ]);
      const nameById = new Map(students.map((s) => [s.id, `${s.firstName} ${s.lastName}`.trim()]));
      for (const s of students) records.push({ id: s.id, type: "student", title: `${s.firstName} ${s.lastName}`, text: `Pupil: ${s.firstName} ${s.lastName}. Ref ${s.reference}.${s.yearGroup ? ` Year ${s.yearGroup}.` : ""}${s.class?.name ? ` Class ${s.class.name}.` : ""}${s.house ? ` House ${s.house}.` : ""}${s.allergies ? ` Allergies: ${s.allergies}.` : ""}${s.medicalAlert ? " Has a medical alert." : ""}${s.sendIndicator ? " SEND." : ""}`, date: null, sourceLabel: "My pupils", url: null, schoolId: sid });
      for (const r of behaviour) records.push({ id: r.id, type: "behaviour", title: `${r.student.firstName} ${r.student.lastName} — ${r.type}`, text: `Behaviour: ${r.student.firstName} ${r.student.lastName}, ${r.type} (${r.points} pts)${r.positive ? " positive" : " negative"}.${r.note ? ` ${r.note}.` : ""}`, date: r.at, sourceLabel: "Behaviour", url: null, schoolId: sid });
      // Attendance summary per pupil.
      const byStudent = new Map<string, { p: number; l: number; t: number }>();
      for (const a of attendance) { const g = byStudent.get(a.studentId) || { p: 0, l: 0, t: 0 }; g.t++; if (a.status === "present") g.p++; if (a.status === "late") g.l++; byStudent.set(a.studentId, g); }
      for (const [studentId, g] of byStudent) { const rate = g.t ? Math.round(((g.p + g.l) / g.t) * 100) : null; records.push({ id: `att-${studentId}`, type: "attendance", title: `${nameById.get(studentId)} — attendance`, text: `Attendance for ${nameById.get(studentId)} (60 days): ${rate == null ? "no data" : rate + "%"}, ${g.t} sessions.`, date: now, sourceLabel: "Attendance", url: null, schoolId: sid }); }
      for (const r of reports) records.push({ id: `report-${r.id}`, type: "report", title: `${r.title} — ${r.student.firstName} ${r.student.lastName}`, text: `Report: ${r.title} for ${r.student.firstName} ${r.student.lastName}. ${r.term || ""} Status ${r.status}. ${r.summary || ""}`, date: r.updatedAt, sourceLabel: "Reports", url: null, schoolId: sid });
      const DAYW = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
      for (const l of tt) records.push({ id: `tt-${l.id}`, type: "timetable", title: `${l.subject} — ${DAYW[l.dayOfWeek] || ""}`, text: `Lesson: ${l.subject} on ${DAYW[l.dayOfWeek] || ""} ${l.startTime}–${l.endTime}.${l.className || l.yearGroup ? ` For ${l.className || l.yearGroup}.` : ""}${l.room ? ` Room ${l.room}.` : ""}`, date: null, sourceLabel: "Timetable", url: null, schoolId: sid });
    }

    if (scope.tripIds.length) {
      const trips = await prisma.trip.findMany({ where: { id: { in: scope.tripIds } } });
      for (const t of trips) records.push({ id: t.id, type: "trip", title: t.title, text: `Trip: ${t.title}. ${t.purpose || ""} Destination ${t.destination || "?"}. Date ${t.date}.${t.departureTime ? ` Departs ${t.departureTime}.` : ""}`, date: t.date ? new Date(`${t.date}T00:00:00`) : null, sourceLabel: "Trips", url: null, schoolId: sid });
    }

    // Whole-school, non-personal context.
    const [events, docs, menus] = await Promise.all([
      prisma.calendarEvent.findMany({ where: { schoolId: sid, status: { not: "cancelled" }, startsAt: { gte: new Date(now.getTime() - 14 * 86400000), lte: new Date(now.getTime() + 90 * 86400000) } }, take: 100 }),
      prisma.document.findMany({ where: { schoolId: sid }, take: 200 }),
      prisma.menuItem.findMany({ where: { schoolId: sid, active: true }, take: 200 }),
    ]);
    for (const e of events) records.push({ id: e.id, type: "event", title: e.title, text: `${e.title}. ${EVENT_CATEGORY_LABELS[e.category] || e.category}. ${e.description || ""} ${e.location ? `Location: ${e.location}.` : ""}`, date: e.startsAt, sourceLabel: "School calendar", url: null, schoolId: sid });
    for (const d of docs) records.push({ id: d.id, type: "document", title: d.title, text: `${d.title}. ${(d as any).summary || ""}`, date: (d as any).effectiveDate ?? (d as any).updatedAt ?? null, sourceLabel: "Document", url: (d as any).linkUrl || null, schoolId: sid });
    for (const m of menus) records.push({ id: m.id, type: "meal", title: `${m.name} (${m.meal})`, text: `Menu: ${m.name}. ${m.day}. ${m.meal}/${m.course}.${m.allergens ? ` Allergens: ${m.allergens}.` : ""}`, date: null, sourceLabel: "Meals", url: null, schoolId: sid });

    // How-to guidance first, then retrieval.
    const guide = matchGuidance(question);
    let answer: string, citations: any[] = [], found: boolean;
    if (guide) { answer = guide.answer; found = true; }
    else {
      const ranked = rank(records, question, 10);
      const composed = composeAnswer(question, ranked, { lang, isStaff: true });
      const llm = await maybeLlmAnswer(question, ranked, lang);
      answer = llm ? `${llm}` : composed.answer; citations = composed.citations; found = composed.found;
    }

    await prisma.aiQuery.create({ data: { schoolId: sid, userId: ctx.userId, role: "teacher", question, lang, answer, citations: JSON.stringify(citations), found } }).catch(() => {});
    return ok({ answer, citations, found });
  } catch (err) { return handleError(err); }
}
