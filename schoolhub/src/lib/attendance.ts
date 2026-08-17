import { prisma } from "./db";
import { recordAudit } from "./audit";

// Daily attendance. API-fed records are read-only; imported/manual are editable.

export const ATTENDANCE_STATUSES = ["present", "late", "authorised", "unauthorised", "excused", "absent"] as const;
export const ATTENDANCE_SESSIONS = ["am", "pm", "day"] as const;
const PRESENTISH = ["present", "late"];

function todayStr() { return new Date().toISOString().slice(0, 10); }

export async function listAttendance(schoolId: string, opts: { date?: string; from?: string; to?: string; status?: string; session?: string; studentIds?: string[] } = {}) {
  // date is stored as a "YYYY-MM-DD" string, so lexical gte/lte gives correct
  // day/week/month/term/year ranges. Single-date is the default (backwards compatible).
  const where: Record<string, unknown> = {
    schoolId,
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.session ? { session: opts.session } : {}),
    ...(opts.studentIds ? { studentId: { in: opts.studentIds } } : {}),
  };
  if (opts.from || opts.to) {
    const dr: Record<string, string> = {};
    if (opts.from) dr.gte = opts.from;
    if (opts.to) dr.lte = opts.to;
    where.date = dr;
  } else {
    where.date = opts.date || todayStr();
  }
  const rows = await prisma.attendanceRecord.findMany({
    where,
    include: { student: { select: { firstName: true, lastName: true, reference: true, yearGroup: true, class: { select: { name: true } } } } },
    orderBy: [{ date: "desc" }, { session: "asc" }],
    take: 5000,
  });
  return rows.map((r) => ({
    id: r.id, studentId: r.studentId,
    studentName: `${r.student?.firstName ?? ""} ${r.student?.lastName ?? ""}`.trim(),
    studentRef: r.student?.reference ?? null,
    yearGroup: r.student?.yearGroup ?? null,
    className: r.student?.class?.name ?? null,
    date: r.date, session: r.session, status: r.status, note: r.note,
    source: r.source, editable: r.source !== "api",
  }));
}

export async function attendanceSummary(schoolId: string, opts: { date?: string; from?: string; to?: string; session?: string; studentIds?: string[] } = {}) {
  const where: Record<string, unknown> = {
    schoolId,
    ...(opts.session ? { session: opts.session } : {}),
    ...(opts.studentIds ? { studentId: { in: opts.studentIds } } : {}),
  };
  let label: string;
  if (opts.from || opts.to) {
    const dr: Record<string, string> = {};
    if (opts.from) dr.gte = opts.from;
    if (opts.to) dr.lte = opts.to;
    where.date = dr;
    label = `${opts.from ?? "…"} → ${opts.to ?? "…"}`;
  } else {
    const d = opts.date || todayStr();
    where.date = d;
    label = d;
  }
  const grouped = await prisma.attendanceRecord.groupBy({ by: ["status"], where, _count: { _all: true } });
  const counts: Record<string, number> = {};
  grouped.forEach((g) => { counts[g.status] = g._count._all; });
  const total = grouped.reduce((n, g) => n + g._count._all, 0);
  const present = grouped.filter((g) => PRESENTISH.includes(g.status)).reduce((n, g) => n + g._count._all, 0);
  return { date: label, total, present, absent: total - present, rate: total ? Math.round((present / total) * 1000) / 10 : 0, counts };
}

// Present/late/absent breakdown + record list for a single pupil, used by the
// teacher pupil view. "present" and "late" both count towards the rate.
export async function studentAttendanceBreakdown(studentId: string, opts: { from?: string; to?: string } = {}) {
  const where: Record<string, unknown> = { studentId };
  if (opts.from || opts.to) {
    const dr: Record<string, string> = {};
    if (opts.from) dr.gte = opts.from;
    if (opts.to) dr.lte = opts.to;
    where.date = dr;
  }
  const rows = await prisma.attendanceRecord.findMany({ where, orderBy: [{ date: "desc" }, { session: "asc" }], take: 2000 });
  const present = rows.filter((r) => r.status === "present").length;
  const late = rows.filter((r) => r.status === "late").length;
  const total = rows.length;
  const absent = total - present - late;
  const rate = total ? Math.round(((present + late) / total) * 1000) / 10 : null;
  return {
    summary: { total, present, late, absent, rate },
    records: rows.map((r) => ({ date: r.date, session: r.session, status: r.status, note: r.note })),
  };
}

export async function upsertAttendance(schoolId: string, input: {
  studentId: string; date: string; session?: string; status: string; note?: string; source?: string; actorUserId?: string | null;
}) {
  const session = (ATTENDANCE_SESSIONS as readonly string[]).includes(input.session || "") ? input.session! : "am";
  const status = (ATTENDANCE_STATUSES as readonly string[]).includes(input.status) ? input.status : "present";
  const existing = await prisma.attendanceRecord.findUnique({ where: { studentId_date_session: { studentId: input.studentId, date: input.date, session } } });
  if (existing && existing.source === "api" && (input.source ?? "manual") !== "api") throw new Error("This attendance record is fed from an integration and is read-only.");
  const rec = await prisma.attendanceRecord.upsert({
    where: { studentId_date_session: { studentId: input.studentId, date: input.date, session } },
    update: { status, note: input.note ?? null, ...(input.source ? { source: input.source } : {}) },
    create: { schoolId, studentId: input.studentId, date: input.date, session, status, note: input.note ?? null, source: input.source || "manual" },
  });
  await recordAudit({ action: "ATTENDANCE_MARKED", schoolId, actorUserId: input.actorUserId, targetType: "AttendanceRecord", targetId: rec.id, metadata: { date: input.date, session, status } });
  return { id: rec.id };
}

export async function updateAttendance(schoolId: string, id: string, patch: { status?: string; note?: string }, actorUserId?: string | null) {
  const rec = await prisma.attendanceRecord.findUnique({ where: { id } });
  if (!rec || rec.schoolId !== schoolId) throw new Error("Attendance record not found");
  if (rec.source === "api") throw new Error("This attendance record is fed from an integration and is read-only.");
  const data: any = {};
  if (patch.status && (ATTENDANCE_STATUSES as readonly string[]).includes(patch.status)) data.status = patch.status;
  if (patch.note !== undefined) data.note = patch.note?.trim() || null;
  await prisma.attendanceRecord.update({ where: { id }, data });
  await recordAudit({ action: "ATTENDANCE_MARKED", schoolId, actorUserId, targetType: "AttendanceRecord", targetId: id, metadata: { updated: Object.keys(data) } });
}

export async function deleteAttendance(schoolId: string, id: string) {
  const rec = await prisma.attendanceRecord.findUnique({ where: { id } });
  if (!rec || rec.schoolId !== schoolId) throw new Error("Attendance record not found");
  if (rec.source === "api") throw new Error("This attendance record is fed from an integration and is read-only.");
  await prisma.attendanceRecord.delete({ where: { id } });
}
