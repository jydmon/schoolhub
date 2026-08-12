import { prisma } from "../db";
import { studentMatchesEvent } from "../calendar";
import { docVisibleToParent, docSearchableByStaff, docText } from "../documents";
import { EVENT_CATEGORY_LABELS, DOCUMENT_CATEGORY_LABELS, ROLES } from "../constants";

const STAFF_ROLES: string[] = [ROLES.SCHOOL_ADMIN, ROLES.SCHOOL_LEADER, ROLES.TEACHER, ROLES.TRANSPORT_MANAGER, ROLES.SUPPORT_STAFF];

export type SourceRecord = {
  id: string;
  type: "document" | "event" | "homework" | "announcement" | "student" | "staff" | "behaviour" | "trip" | "meal" | "page" | "route";
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

  return {
    records,
    isStaff: schoolIds.some((s) => isStaffIn(s)),
    hasChildren: guardianLinks.length > 0,
    schoolIds,
  };
}
