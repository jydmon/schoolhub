import { prisma } from "./db";
import { recordAudit } from "./audit";

// Clubs & Activities — extracurricular clubs, their members, session register and
// attendance history. Additive to the schema; students are referenced by bare
// studentId (no back-relation) so the existing Student model is untouched.

export const CLUB_CATEGORIES = ["sport", "music", "arts", "drama", "academic", "stem", "wellbeing", "general"] as const;
export const CLUB_CADENCES = ["daily", "weekly", "monthly", "annual", "adhoc"] as const;
export const CLUB_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const ATTENDANCE_STATES = ["present", "absent", "late", "excused"] as const;

const dayOrder: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

function studentName(s: any) {
  return `${s?.firstName ?? ""} ${s?.lastName ?? ""}`.trim() || "Unknown";
}

/** List all clubs for a school with live membership counts. */
export async function listClubs(schoolId: string) {
  const clubs = await prisma.club.findMany({
    where: { schoolId },
    include: { members: { select: { id: true, status: true } }, sessions: { select: { id: true } } },
  });
  const rows = clubs.map((c) => {
    const enrolled = c.members.filter((m) => m.status === "enrolled").length;
    const waitlist = c.members.filter((m) => m.status === "waitlist").length;
    return {
      id: c.id, name: c.name, category: c.category, description: c.description, location: c.location,
      cadence: c.cadence, dayOfWeek: c.dayOfWeek, startTime: c.startTime, endTime: c.endTime,
      startDate: c.startDate, endDate: c.endDate, yearGroup: c.yearGroup, capacity: c.capacity,
      cost: c.cost, staffLead: c.staffLead, status: c.status, source: c.source,
      memberCount: enrolled, waitlistCount: waitlist, sessionCount: c.sessions.length,
    };
  });
  return rows.sort((a, b) =>
    (dayOrder[a.dayOfWeek ?? ""] ?? 9) - (dayOrder[b.dayOfWeek ?? ""] ?? 9) || a.name.localeCompare(b.name));
}

/** Full detail for one club: roster + recent sessions with attendance. */
export async function getClub(schoolId: string, id: string) {
  const club = await prisma.club.findUnique({
    where: { id },
    include: { members: true, sessions: { orderBy: { date: "desc" }, take: 30, include: { attendance: true } } },
  });
  if (!club || club.schoolId !== schoolId) throw new Error("Club not found");

  const studentIds = club.members.map((m) => m.studentId);
  const students = studentIds.length
    ? await prisma.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, firstName: true, lastName: true, yearGroup: true, classId: true, class: { select: { name: true } } } })
    : [];
  const sMap = new Map(students.map((s) => [s.id, s]));

  const members = club.members.map((m) => ({
    id: m.id, studentId: m.studentId, status: m.status, joinedAt: m.joinedAt, leftAt: m.leftAt,
    studentName: studentName(sMap.get(m.studentId)),
    yearGroup: sMap.get(m.studentId)?.yearGroup ?? null,
    className: (sMap.get(m.studentId) as any)?.class?.name ?? null,
  })).sort((a, b) => a.studentName.localeCompare(b.studentName));

  const sessions = club.sessions.map((s) => {
    const present = s.attendance.filter((a) => a.status === "present" || a.status === "late").length;
    return {
      id: s.id, date: s.date, startTime: s.startTime, endTime: s.endTime, note: s.note,
      present, recorded: s.attendance.length,
      attendance: s.attendance.map((a) => ({ id: a.id, studentId: a.studentId, status: a.status, note: a.note, studentName: studentName(sMap.get(a.studentId)) })),
    };
  });

  return { ...club, members, sessions };
}

export async function createClub(input: any & { schoolId: string; actorUserId?: string | null }) {
  const name = (input.name || "").trim();
  if (!name) throw new Error("name is required");
  const club = await prisma.club.create({
    data: {
      schoolId: input.schoolId,
      name,
      category: (input.category || "general").trim(),
      description: input.description?.trim() || null,
      location: input.location?.trim() || null,
      cadence: (input.cadence || "weekly").trim(),
      dayOfWeek: input.dayOfWeek?.trim() || null,
      startTime: input.startTime?.trim() || null,
      endTime: input.endTime?.trim() || null,
      startDate: input.startDate ? new Date(input.startDate) : null,
      endDate: input.endDate ? new Date(input.endDate) : null,
      yearGroup: input.yearGroup?.trim() || null,
      capacity: Number.isFinite(input.capacity) ? Math.max(0, Math.round(input.capacity)) : (input.capacity ? parseInt(String(input.capacity), 10) || null : null),
      cost: Number.isFinite(input.cost) ? Math.max(0, Math.round(input.cost)) : (input.cost ? Math.round(parseFloat(String(input.cost).replace(/[£,\s]/g, "")) * 100) || 0 : 0),
      staffLead: input.staffLead?.trim() || null,
      status: input.status === "archived" ? "archived" : "active",
      source: input.source || "manual",
      createdById: input.actorUserId || null,
    },
  });
  await recordAudit({ action: "CLUB_CREATED", schoolId: input.schoolId, actorUserId: input.actorUserId, targetType: "Club", targetId: club.id, metadata: { name } });
  return { id: club.id };
}

export async function updateClub(schoolId: string, id: string, patch: any) {
  const club = await prisma.club.findUnique({ where: { id } });
  if (!club || club.schoolId !== schoolId) throw new Error("Club not found");
  if ((club.source ?? "manual") === "api") throw new Error("This club is fed from an integration and is read-only.");
  const data: any = {};
  for (const k of ["name", "category", "description", "location", "cadence", "dayOfWeek", "startTime", "endTime", "yearGroup", "staffLead", "status"] as const) {
    if (typeof patch[k] === "string") data[k] = patch[k].trim() || (k === "name" ? club.name : null);
  }
  if (patch.startDate !== undefined) data.startDate = patch.startDate ? new Date(patch.startDate) : null;
  if (patch.endDate !== undefined) data.endDate = patch.endDate ? new Date(patch.endDate) : null;
  if (patch.capacity !== undefined) { const c = parseInt(String(patch.capacity), 10); data.capacity = Number.isFinite(c) ? Math.max(0, c) : null; }
  if (patch.cost !== undefined) { const p = typeof patch.cost === "number" ? patch.cost : Math.round(parseFloat(String(patch.cost).replace(/[£,\s]/g, "")) * 100); if (Number.isFinite(p) && p >= 0) data.cost = p; }
  await prisma.club.update({ where: { id }, data });
  await recordAudit({ action: "CLUB_UPDATED", schoolId, targetType: "Club", targetId: id });
}

export async function setClubStatus(schoolId: string, id: string, status: string) {
  const club = await prisma.club.findUnique({ where: { id } });
  if (!club || club.schoolId !== schoolId) throw new Error("Club not found");
  await prisma.club.update({ where: { id }, data: { status: status === "archived" ? "archived" : "active" } });
}

export async function deleteClub(schoolId: string, id: string) {
  const club = await prisma.club.findUnique({ where: { id } });
  if (!club || club.schoolId !== schoolId) throw new Error("Club not found");
  if ((club.source ?? "manual") === "api") throw new Error("This club is fed from an integration and is read-only.");
  await prisma.club.delete({ where: { id } });
  await recordAudit({ action: "CLUB_DELETED", schoolId, targetType: "Club", targetId: id });
}

/** Add a student to a club (idempotent — re-adds a "left" member as enrolled). */
export async function addMember(schoolId: string, clubId: string, studentId: string, status = "enrolled") {
  const club = await prisma.club.findUnique({ where: { id: clubId } });
  if (!club || club.schoolId !== schoolId) throw new Error("Club not found");
  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { schoolId: true } });
  if (!student || student.schoolId !== schoolId) throw new Error("Student not found in this school");
  const existing = await prisma.clubMembership.findUnique({ where: { clubId_studentId: { clubId, studentId } } }).catch(() => null);
  if (existing) {
    await prisma.clubMembership.update({ where: { id: existing.id }, data: { status, leftAt: status === "left" ? new Date() : null } });
    return { id: existing.id };
  }
  const m = await prisma.clubMembership.create({ data: { schoolId, clubId, studentId, status } });
  return { id: m.id };
}

export async function removeMember(schoolId: string, membershipId: string) {
  const m = await prisma.clubMembership.findUnique({ where: { id: membershipId } });
  if (!m || m.schoolId !== schoolId) throw new Error("Membership not found");
  await prisma.clubMembership.delete({ where: { id: membershipId } });
}

/** Create (or reuse) a session for a date, then record attendance for it. */
export async function recordSession(schoolId: string, clubId: string, input: { date: string; startTime?: string; endTime?: string; note?: string; marks?: { studentId: string; status: string; note?: string }[]; actorUserId?: string | null }) {
  const club = await prisma.club.findUnique({ where: { id: clubId } });
  if (!club || club.schoolId !== schoolId) throw new Error("Club not found");
  const date = new Date(input.date);
  if (isNaN(date.getTime())) throw new Error("A valid session date is required");
  date.setHours(0, 0, 0, 0);

  const session = await prisma.clubSession.create({
    data: { schoolId, clubId, date, startTime: input.startTime?.trim() || club.startTime, endTime: input.endTime?.trim() || club.endTime, note: input.note?.trim() || null },
  });
  const marks = Array.isArray(input.marks) ? input.marks : [];
  for (const mk of marks) {
    if (!mk.studentId) continue;
    const status = (ATTENDANCE_STATES as readonly string[]).includes(mk.status) ? mk.status : "present";
    await prisma.clubAttendance.create({ data: { schoolId, sessionId: session.id, studentId: mk.studentId, status, note: mk.note?.trim() || null } });
  }
  await recordAudit({ action: "CLUB_SESSION_RECORDED", schoolId, actorUserId: input.actorUserId, targetType: "ClubSession", targetId: session.id, metadata: { clubId, marks: marks.length } });
  return { id: session.id };
}

export async function deleteSession(schoolId: string, sessionId: string) {
  const s = await prisma.clubSession.findUnique({ where: { id: sessionId } });
  if (!s || s.schoolId !== schoolId) throw new Error("Session not found");
  await prisma.clubSession.delete({ where: { id: sessionId } });
}

/** Clubs a parent's child belongs to, with that child's own attendance history. */
export async function clubsForChildren(studentIds: string[]) {
  if (!studentIds.length) return [];
  const memberships = await prisma.clubMembership.findMany({
    where: { studentId: { in: studentIds }, status: { in: ["enrolled", "waitlist"] } },
    include: { club: true },
  });
  const clubIds = Array.from(new Set(memberships.map((m) => m.clubId)));
  const attendance = clubIds.length
    ? await prisma.clubAttendance.findMany({
        where: { studentId: { in: studentIds }, session: { clubId: { in: clubIds } } },
        include: { session: { select: { clubId: true, date: true } } },
        orderBy: { recordedAt: "desc" },
      })
    : [];

  return memberships.map((m) => {
    const hist = attendance
      .filter((a) => a.studentId === m.studentId && a.session.clubId === m.clubId)
      .map((a) => ({ date: a.session.date, status: a.status, note: a.note }));
    const attended = hist.filter((h) => h.status === "present" || h.status === "late").length;
    return {
      membershipId: m.id, studentId: m.studentId, status: m.status,
      club: {
        id: m.club.id, name: m.club.name, category: m.club.category, description: m.club.description,
        location: m.club.location, cadence: m.club.cadence, dayOfWeek: m.club.dayOfWeek,
        startTime: m.club.startTime, endTime: m.club.endTime, yearGroup: m.club.yearGroup,
        cost: m.club.cost, staffLead: m.club.staffLead, schoolId: m.club.schoolId, status: m.club.status,
      },
      sessionsAttended: attended, sessionsRecorded: hist.length,
      history: hist.slice(0, 12),
    };
  });
}
