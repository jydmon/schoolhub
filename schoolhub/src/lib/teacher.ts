import { prisma } from "./db";
import { ROLES } from "./constants";
import { AppError } from "./http";

// ---------------------------------------------------------------------------
// Teacher access scope.
//
// A teacher may only ever see the students, classes, subjects and trips they
// are responsible for. That responsibility is derived from three sources:
//   1. StaffClass      — classes the teacher is assigned to (form/class teacher)
//   2. TimetableEntry  — subjects/classes/years they teach (teacherUserId)
//   3. TripStaff       — trips they lead or supervise
// Every teacher endpoint resolves this scope first and filters by it. There is
// no path that returns a student outside the teacher's scope.
// ---------------------------------------------------------------------------

export type TeacherScope = {
  userId: string;
  schoolId: string;
  schoolName: string;
  staffProfileId: string | null;
  classIds: string[];
  classNames: string[];
  yearGroups: string[];
  subjects: string[];
  tripIds: string[];
  studentIds: string[];
};

export async function teacherSchools(userId: string) {
  const memberships = await prisma.membership.findMany({
    where: { userId, role: ROLES.TEACHER },
    include: { school: { select: { id: true, name: true } } },
  });
  const seen = new Map<string, string>();
  for (const m of memberships) if (m.school) seen.set(m.school.id, m.school.name);
  return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
}

export async function teacherScope(userId: string, schoolIdParam?: string): Promise<TeacherScope | null> {
  const schools = await teacherSchools(userId);
  if (schools.length === 0) return null;
  const chosen = (schoolIdParam && schools.find((s) => s.id === schoolIdParam)) || schools[0];
  const schoolId = chosen.id;

  const [staff, tt, tripStaff] = await Promise.all([
    prisma.staffProfile.findUnique({ where: { schoolId_userId: { schoolId, userId } }, include: { classes: { include: { class: { select: { id: true, name: true, yearGroup: true } } } } } }),
    prisma.timetableEntry.findMany({ where: { schoolId, teacherUserId: userId } }),
    prisma.tripStaff.findMany({ where: { userId, trip: { schoolId } }, select: { tripId: true } }),
  ]);

  const staffClasses = (staff?.classes ?? []).map((sc) => sc.class);
  const classIds = staffClasses.map((c) => c.id);
  const classNames = uniq([...staffClasses.map((c) => c.name), ...tt.map((t) => t.className).filter(Boolean) as string[]]);
  const yearGroups = uniq([...staffClasses.map((c) => c.yearGroup).filter(Boolean) as string[], ...tt.map((t) => t.yearGroup).filter(Boolean) as string[]]);
  const subjects = uniq(tt.map((t) => t.subject).filter(Boolean));
  const tripIds = uniq(tripStaff.map((t) => t.tripId));

  // Resolve the concrete set of assigned students.
  const or: any[] = [];
  if (classIds.length) or.push({ classId: { in: classIds } });
  if (classNames.length) or.push({ class: { name: { in: classNames } } });
  if (yearGroups.length) or.push({ yearGroup: { in: yearGroups } });
  const studentIds = new Set<string>();
  if (or.length) {
    const st = await prisma.student.findMany({ where: { schoolId, status: { not: "archived" }, OR: or }, select: { id: true } });
    for (const s of st) studentIds.add(s.id);
  }
  if (tripIds.length) {
    const ts = await prisma.tripStudent.findMany({ where: { tripId: { in: tripIds } }, select: { studentId: true } });
    for (const t of ts) studentIds.add(t.studentId);
  }

  return {
    userId, schoolId, schoolName: chosen.name, staffProfileId: staff?.id ?? null,
    classIds, classNames, yearGroups, subjects, tripIds, studentIds: Array.from(studentIds),
  };
}

// Resolve the scope or throw a 403 (used by every teacher endpoint).
export async function requireTeacherScope(userId: string, schoolIdParam?: string): Promise<TeacherScope> {
  const scope = await teacherScope(userId, schoolIdParam);
  if (!scope) throw new AppError("You don't have a teacher role in any school.", 403);
  return scope;
}

// Guard: the given student must be within the teacher's scope.
export function assertTeacherStudent(scope: TeacherScope, studentId: string) {
  if (!scope.studentIds.includes(studentId)) throw new AppError("This pupil is not in your assigned classes, subjects or trips.", 403);
}

function uniq<T>(a: T[]): T[] { return Array.from(new Set(a)); }
