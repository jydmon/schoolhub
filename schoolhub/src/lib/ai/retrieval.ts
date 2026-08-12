import { prisma } from "../db";
import { studentMatchesEvent } from "../calendar";
import { docVisibleToParent, docSearchableByStaff, docText } from "../documents";
import { parentReports } from "../reports-release";
import { EVENT_CATEGORY_LABELS, DOCUMENT_CATEGORY_LABELS, ROLES } from "../constants";

const STAFF_ROLES: string[] = [ROLES.SCHOOL_ADMIN, ROLES.SCHOOL_LEADER, ROLES.TEACHER, ROLES.TRANSPORT_MANAGER, ROLES.SUPPORT_STAFF];
const pad2 = (n: number) => String(n).padStart(2, "0");
const ymdStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export type SourceRecord = {
  id: string;
  type: "document" | "event" | "homework" | "announcement" | "student" | "staff" | "behaviour" | "trip" | "meal" | "page" | "route" | "attendance" | "report" | "timetable";
  title: string;
  text: string;
  date: Date | null;
  sourceLabel: string;
  url: string | null;
  schoolId: string;
};

const stripHtml = (s: string) => (s || "").replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();

export type Context = {
  records: SourceRecord[];
  isStaff: boolean;
  hasChildren: boolean;
  schoolIds: string[];
};

/**
 * Gather everything a user is authorised to see, from every source, respecting
 * per-school role. This is the permission boundary for the assistant: a record
 * only enters the context if the caller may access it.
 */
export async function gatherContext(userId: string, opts: { schoolId?: string } = {}): Promise<Context> {
  const memberships = await prisma.membership.findMany({ where: { userId } });
  const rolesBySchool = new Map<string, string[]>();
  for (const m of memberships) rolesBySchool.set(m.schoolId, [...(rolesBySchool.get(m.schoolId) ?? []), m.role]);

  const guardianLinks = await prisma.guardianLink.findMany({
    where: { parentUserId: userId },
    include: { student: true },
  });
  const childrenBySchool = new Map<string, any[]>();
  for (const g of guardianLinks) childrenBySchool.set(g.schoolId, [...(childrenBySchool.get(g.schoolId) ?? []), g.student]);

  let schoolIds = Array.from(new Set([...rolesBySchool.keys(), ...childrenBySchool.keys()]));
  if (opts.schoolId) schoolIds = schoolIds.filter((s) => s === opts.schoolId);

  const isStaffIn = (sid: string) => (rolesBySchool.get(sid) ?? []).some((r) => STAFF_ROLES.includes(r));
  const records: SourceRecord[] = [];
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const to = new Date(now.getTime() + 90 * 24 * 3600 * 1000);

  for (const sid of schoolIds) {
    const staff = isStaffIn(sid);
    const children = childrenBySchool.get(sid) ?? [];

    // Documents
    const docs = await prisma.document.findMany({ where: { schoolId: sid }, take: 500 });
    for (const d of docs) {
      const visible = staff ? docSearchableByStaff(d, now) : docVisibleToParent(d, now);
      if (!visible) continue;
      records.push({
        id: d.id, type: "document", title: d.title, text: docText(d), date: d.effectiveDate ?? d.updatedAt,
        sourceLabel: `${DOCUMENT_CATEGORY_LABELS[d.category] || d.category} · v${d.version}`,
        url: d.linkUrl || null, schoolId: sid,
      });
    }

    // Events
    const events = await prisma.calendarEvent.findMany({
      where: { schoolId: sid, status: { not: "cancelled" }, startsAt: { gte: from, lte: to } },
      include: { students: { select: { studentId: true } } },
    });
    for (const e of events) {
      if (!staff) {
        const explicit = new Set(e.students.map((s: any) => s.studentId));
        const applies = children.some((c) => studentMatchesEvent(c, e, explicit));
        if (!applies) continue;
      }
      const logistics = [
        e.location && `Location: ${e.location}`, e.equipment && `Equipment: ${e.equipment}`,
        e.clothing && `Clothing: ${e.clothing}`, e.packedLunch && "Packed lunch required",
        e.transportRequired && "Transport required", e.collectionAt && `Collection ${new Date(e.collectionAt).toLocaleString()}`,
        e.consentRequired && "Consent required", e.paymentRef && `Payment ref ${e.paymentRef}`,
      ].filter(Boolean).join(". ");
      records.push({
        id: e.id, type: "event", title: e.title,
        text: `${e.title}. ${EVENT_CATEGORY_LABELS[e.category] || e.category}. ${e.description || ""} ${logistics}`,
        date: e.startsAt, sourceLabel: "School calendar", url: null, schoolId: sid,
      });
    }

    // Homework
    const hw = await prisma.homework.findMany({ where: { schoolId: sid, dueAt: { gte: from, lte: to } } });
    for (const h of hw) {
      if (!staff) {
        const applies = children.some((c) => (!h.classId && !h.yearGroup) || h.classId === c.classId || (!!h.yearGroup && h.yearGroup === c.yearGroup));
        if (!applies) continue;
      }
      records.push({
        id: h.id, type: "homework", title: h.title, text: `Homework: ${h.title}. ${h.subject || ""} ${h.description || ""}`,
        date: h.dueAt, sourceLabel: "Homework", url: null, schoolId: sid,
      });
    }

    // Announcements — staff see all; parents see those addressed to them.
    const anns = await prisma.announcement.findMany({ where: { schoolId: sid, ...(staff ? {} : { status: "sent" }) }, orderBy: { createdAt: "desc" }, take: 150 });
    for (const a of anns) {
      if (!staff) {
        let aud: any = {}; try { aud = JSON.parse(a.audienceJson || "{}"); } catch { aud = {}; }
        const applies = a.audienceKind === "all"
          || (a.audienceKind === "year" && Array.isArray(aud.years) && children.some((c) => aud.years.includes(c.yearGroup)))
          || (a.audienceKind === "class" && Array.isArray(aud.classes) && children.some((c) => aud.classes.includes(c.classId)))
          || (a.audienceKind === "list" && Array.isArray(aud.userIds) && aud.userIds.includes(userId));
        if (!applies) continue;
      }
      records.push({ id: a.id, type: "announcement", title: a.title, text: `Announcement: ${a.title}. ${a.body}`, date: a.sentAt ?? a.createdAt, sourceLabel: "Announcement", url: null, schoolId: sid });
    }

    // Published website / CMS pages (public content) — everyone.
    const pages = await prisma.cmsPage.findMany({ where: { status: "published" }, take: 100 });
    for (const p of pages) {
      records.push({ id: p.id, type: "page", title: p.title, text: `${p.title}. ${p.seoDescription || ""} ${stripHtml(p.contentHtml).slice(0, 1200)}`, date: p.updatedAt, sourceLabel: "Website", url: `/site/${p.slug}`, schoolId: sid });
    }

    // Meals / menus — everyone (allergen + dietary info is safe to share).
    const menus = await prisma.menuItem.findMany({ where: { schoolId: sid, active: true }, take: 300 });
    for (const m of menus) {
      const diet = [m.vegetarian && "vegetarian", m.vegan && "vegan"].filter(Boolean).join(", ");
      records.push({ id: m.id, type: "meal", title: `${m.name} (${m.meal})`, text: `Menu: ${m.name}. ${m.day}${m.weekOf ? ` w/c ${m.weekOf}` : ""}. ${m.meal}/${m.course}. ${m.description || ""}${m.allergens ? ` Allergens: ${m.allergens}.` : ""}${diet ? ` ${diet}.` : ""}${m.yearGroup ? ` For ${m.yearGroup}.` : ""}`, date: null, sourceLabel: "Meals & menus", url: null, schoolId: sid });
    }

    // ---- Parent child-specific records (attendance, timetable, trips, reports) ----
    // Only the caller's own children, and only when they are not staff at this
    // school (staff already get the full roster below).
    if (!staff && children.length > 0) {
      const since60 = ymdStr(new Date(now.getTime() - 60 * 24 * 3600 * 1000));
      for (const c of children) {
        const nm = `${c.firstName} ${c.lastName}`.trim();

        // Attendance summary (last 60 days).
        const att = await prisma.attendanceRecord.findMany({ where: { studentId: c.id, date: { gte: since60 } }, select: { status: true } });
        if (att.length) {
          const cnt = (st: string) => att.filter((a) => a.status === st).length;
          const present = cnt("present"), late = cnt("late"), total = att.length;
          const absent = cnt("unauthorised") + cnt("absent");
          const rate = total ? Math.round(((present + late) / total) * 100) : null;
          records.push({ id: `att-${c.id}`, type: "attendance", title: `${nm} — attendance`, text: `Attendance for ${nm} over the last 60 days: ${rate == null ? "no data" : rate + "%"}. Present ${present}, late ${late}, absent ${absent}, authorised ${cnt("authorised")}, out of ${total} sessions.`, date: now, sourceLabel: "Attendance", url: null, schoolId: sid });
        }

        // Trips this child is on.
        const ts = await prisma.tripStudent.findMany({ where: { studentId: c.id }, include: { trip: { select: { title: true, date: true, destination: true, venue: true, consentRequired: true, paymentStatus: true } } } });
        for (const t of ts) {
          records.push({ id: `trip-${t.id}`, type: "trip", title: `${t.trip.title} (${nm})`, text: `Trip: ${t.trip.title} for ${nm}. Date ${t.trip.date}. Destination ${t.trip.destination || t.trip.venue || "?"}.${t.trip.consentRequired ? ` Consent: ${t.consent}.` : ""}${t.trip.paymentStatus ? ` Payment: ${t.trip.paymentStatus}.` : ""}`, date: t.trip.date ? new Date(`${t.trip.date}T00:00:00`) : null, sourceLabel: "Trips", url: null, schoolId: sid });
        }
      }

      // Timetable lessons applicable to the parent's children (by year group or whole-school).
      const yearGroups = new Set(children.map((c) => c.yearGroup).filter(Boolean));
      const tt = await prisma.timetableEntry.findMany({ where: { schoolId: sid } });
      if (tt.length) {
        const teacherIds = Array.from(new Set(tt.map((x) => x.teacherUserId).filter(Boolean))) as string[];
        const teachers = teacherIds.length ? await prisma.user.findMany({ where: { id: { in: teacherIds } }, select: { id: true, fullName: true } }) : [];
        const tname = new Map(teachers.map((x) => [x.id, x.fullName]));
        const DAYW = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
        for (const l of tt) {
          const applies = (!l.className && !l.yearGroup) || (l.yearGroup && yearGroups.has(l.yearGroup));
          if (!applies) continue;
          records.push({ id: `tt-${l.id}`, type: "timetable", title: `${l.subject} — ${DAYW[l.dayOfWeek] || ""}`, text: `Timetable lesson: ${l.subject} on ${DAYW[l.dayOfWeek] || ""} ${l.startTime}–${l.endTime}${l.period ? ` (${l.period})` : ""}.${l.className || l.yearGroup ? ` For ${l.className || l.yearGroup}.` : ""}${l.room ? ` Room ${l.room}.` : ""}${l.teacherUserId && tname.get(l.teacherUserId) ? ` Teacher ${tname.get(l.teacherUserId)}.` : ""}`, date: null, sourceLabel: "Timetable", url: null, schoolId: sid });
        }
      }
    }

    // ---- Staff-only records (pupil roster, staff, behaviour, trips, transport) ----
    if (!staff) continue;

    const students = await prisma.student.findMany({ where: { schoolId: sid }, take: 1000 });
    for (const s of students) {
      records.push({ id: s.id, type: "student", title: `${s.firstName} ${s.lastName}`, text: `Pupil: ${s.firstName} ${s.lastName}. Reference ${s.reference}.${s.yearGroup ? ` Year ${s.yearGroup}.` : ""}${s.house ? ` House ${s.house}.` : ""} Status ${s.status}.${s.allergies ? ` Allergies: ${s.allergies}.` : ""}${s.medicalAlert ? " Has a medical alert." : ""}`, date: null, sourceLabel: "Pupil roster", url: null, schoolId: sid });
    }

    const staffProfiles = await prisma.staffProfile.findMany({ where: { schoolId: sid }, include: { user: { select: { fullName: true, email: true } } }, take: 500 });
    for (const sp of staffProfiles) {
      records.push({ id: sp.id, type: "staff", title: sp.user?.fullName || sp.reference, text: `Staff: ${sp.user?.fullName || ""}. ${sp.jobTitle || ""}${sp.department ? `, ${sp.department}` : ""}. Reference ${sp.reference}. Status ${sp.status}.`, date: null, sourceLabel: "Staff", url: null, schoolId: sid });
    }

    const rewards = await prisma.rewardRecord.findMany({ where: { schoolId: sid }, include: { student: { select: { firstName: true, lastName: true } } }, orderBy: { at: "desc" }, take: 300 });
    for (const r of rewards) {
      records.push({ id: r.id, type: "behaviour", title: `${r.student.firstName} ${r.student.lastName} — ${r.type}`, text: `Behaviour record: ${r.student.firstName} ${r.student.lastName}, ${r.type} (${r.points} point(s))${r.positive ? " positive" : " negative"}.${r.note ? ` ${r.note}.` : ""}${r.teacherName ? ` By ${r.teacherName}.` : ""}`, date: r.at, sourceLabel: "Behaviour", url: null, schoolId: sid });
    }

    const trips = await prisma.trip.findMany({ where: { schoolId: sid }, orderBy: { date: "desc" }, take: 100 });
    for (const t of trips) {
      records.push({ id: t.id, type: "trip", title: t.title, text: `Trip: ${t.title}. ${t.purpose || ""} Destination ${t.destination || t.venue || "?"}. Date ${t.date}.${t.departureTime ? ` Departs ${t.departureTime}.` : ""}${t.consentRequired ? " Consent required." : ""}${t.paymentStatus ? ` Payment: ${t.paymentStatus}.` : ""}`, date: t.date ? new Date(`${t.date}T00:00:00`) : null, sourceLabel: "Trips", url: null, schoolId: sid });
    }

    const routes = await prisma.route.findMany({ where: { schoolId: sid }, include: { stops: { orderBy: { sequence: "asc" }, select: { name: true } }, vehicle: { select: { label: true, reference: true } } }, take: 100 });
    for (const rt of routes) {
      records.push({ id: rt.id, type: "route", title: `Route: ${rt.name}`, text: `Transport route ${rt.name} (${rt.type}). Vehicle ${rt.vehicle?.label || rt.vehicle?.reference || "unassigned"}. Stops: ${rt.stops.map((s) => s.name).join(", ") || "none"}. Cut-off ${rt.cutoffTime}.${rt.termlyFee != null ? ` Termly fee £${rt.termlyFee}.` : ""}`, date: null, sourceLabel: "Transport", url: null, schoolId: sid });
    }
  }

  // Released academic reports for the caller's children (across their schools).
  if (guardianLinks.length > 0) {
    const schoolOfStudent = new Map(guardianLinks.map((g) => [g.studentId, g.schoolId]));
    const reps = await parentReports(userId, now).catch(() => [] as any[]);
    for (const r of reps as any[]) {
      const sid = r.student?.id ? schoolOfStudent.get(r.student.id) : null;
      if (opts.schoolId && sid !== opts.schoolId) continue;
      const nm = r.student ? `${r.student.firstName || ""} ${r.student.lastName || ""}`.trim() : "";
      const bodyText = r.summary || (r.body && typeof r.body === "object" ? Object.entries(r.body).map(([k, v]: any) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(". ").slice(0, 1500) : "");
      records.push({ id: `report-${r.id}`, type: "report", title: `${r.title}${nm ? ` — ${nm}` : ""}`, text: `School report: ${r.title} for ${nm}.${r.term ? ` Term ${r.term}.` : ""} ${bodyText}`, date: r.releasedAt || r.at || null, sourceLabel: "School report", url: null, schoolId: sid || schoolIds[0] || "" });
    }
  }

  return {
    records,
    isStaff: schoolIds.some((s) => isStaffIn(s)),
    hasChildren: guardianLinks.length > 0,
    schoolIds,
  };
}
