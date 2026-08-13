import { prisma } from "./db";
import { getChildren } from "./parent";
import { studentMatchesEvent } from "./calendar";

// Enterprise search — role-scoped, tenant-isolated search across the record
// types each role can see. Every entity query is wrapped so that a model which
// hasn't been migrated yet (e.g. Club, Notice, Faq, TrustDocument before the
// schema is applied) degrades gracefully instead of failing the whole search.

export type SearchHit = { title: string; subtitle: string; id?: string };
export type SearchGroup = { type: string; label: string; tab: string; items: SearchHit[] };

const ci = (q: string) => ({ contains: q, mode: "insensitive" as const });
const DAY = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

async function safe<T>(fn: () => Promise<T[]>): Promise<T[]> {
  try { return await fn(); } catch { return []; }
}

/** School-portal search for administrators/leaders. `types` optionally limits sections. */
export async function searchSchool(schoolId: string, q: string, types?: string[]): Promise<SearchGroup[]> {
  const want = (t: string) => !types || types.length === 0 || types.includes(t);
  const T = 10;

  const [students, guardians, staff, users, events, trips, timetable, menus, docs, clubs, notices, policies, faqs, reports, trust, messages] = await Promise.all([
    want("students") ? safe(() => prisma.student.findMany({ where: { schoolId, OR: [{ firstName: ci(q) }, { lastName: ci(q) }, { reference: ci(q) }] }, take: T, select: { id: true, firstName: true, lastName: true, reference: true, yearGroup: true, status: true } })) : [],
    want("guardians") ? safe(() => prisma.user.findMany({ where: { memberships: { some: { schoolId, role: "Parent" } }, OR: [{ fullName: ci(q) }, { email: ci(q) }] }, take: T, select: { id: true, fullName: true, email: true } })) : [],
    want("staff") ? safe(() => prisma.staffProfile.findMany({ where: { schoolId, OR: [{ reference: ci(q) }, { jobTitle: ci(q) }, { user: { fullName: ci(q) } }] }, take: T, include: { user: { select: { fullName: true } } } })) : [],
    want("users") ? safe(() => prisma.user.findMany({ where: { memberships: { some: { schoolId } }, OR: [{ fullName: ci(q) }, { email: ci(q) }] }, take: T, select: { id: true, fullName: true, email: true, memberships: { where: { schoolId }, select: { role: true } } } })) : [],
    want("events") ? safe(() => prisma.calendarEvent.findMany({ where: { schoolId, OR: [{ title: ci(q) }, { location: ci(q) }, { description: ci(q) }] }, take: T, orderBy: { startsAt: "desc" }, select: { id: true, title: true, startsAt: true, category: true } })) : [],
    want("trips") ? safe(() => prisma.trip.findMany({ where: { schoolId, OR: [{ title: ci(q) }, { destination: ci(q) }, { venue: ci(q) }] }, take: T, select: { id: true, title: true, date: true, destination: true } })) : [],
    want("timetable") ? safe(() => prisma.timetableEntry.findMany({ where: { schoolId, OR: [{ subject: ci(q) }, { className: ci(q) }, { room: ci(q) }, { yearGroup: ci(q) }] }, take: T, select: { id: true, subject: true, dayOfWeek: true, startTime: true, className: true, yearGroup: true } })) : [],
    want("meals") ? safe(() => prisma.menuItem.findMany({ where: { schoolId, OR: [{ name: ci(q) }, { allergens: ci(q) }] }, take: T, select: { id: true, name: true, day: true, meal: true } })) : [],
    want("documents") ? safe(() => prisma.document.findMany({ where: { schoolId, OR: [{ title: ci(q) }, { bodyText: ci(q) }] }, take: T, select: { id: true, title: true, category: true } })) : [],
    want("clubs") ? safe(() => prisma.club.findMany({ where: { schoolId, OR: [{ name: ci(q) }, { category: ci(q) }, { staffLead: ci(q) }, { location: ci(q) }] }, take: T, select: { id: true, name: true, category: true, dayOfWeek: true, status: true } })) : [],
    want("announcements") ? safe(() => prisma.notice.findMany({ where: { OR: [{ schoolId }, { scope: "global" }], AND: [{ OR: [{ title: ci(q) }, { body: ci(q) }] }] }, take: T, select: { id: true, title: true, priority: true, status: true } })) : [],
    want("policies") ? safe(() => prisma.policy.findMany({ where: { OR: [{ schoolId }, { schoolId: null }], AND: [{ OR: [{ title: ci(q) }, { summary: ci(q) }] }] }, take: T, select: { id: true, title: true, category: true, status: true } })) : [],
    want("faqs") ? safe(() => prisma.faq.findMany({ where: { OR: [{ question: ci(q) }, { answer: ci(q) }] }, take: T, select: { id: true, question: true, category: true } })) : [],
    want("reports") ? safe(() => prisma.studentReport.findMany({ where: { schoolId, OR: [{ title: ci(q) }, { summary: ci(q) }] }, take: T, include: { student: { select: { firstName: true, lastName: true } } } })) : [],
    want("trust") ? safe(() => prisma.trustDocument.findMany({ where: { OR: [{ title: ci(q) }, { summary: ci(q) }, { category: ci(q) }] }, take: T, select: { id: true, title: true, category: true, status: true } })) : [],
    want("messages") ? safe(() => prisma.message.findMany({ where: { schoolId, OR: [{ title: ci(q) }, { body: ci(q) }] }, take: T, orderBy: { createdAt: "desc" }, select: { id: true, title: true, priority: true, createdAt: true } })) : [],
  ]);

  const groups: SearchGroup[] = [
    { type: "students", label: "Pupils", tab: "students", items: students.map((s: any) => ({ id: s.id, title: `${s.firstName} ${s.lastName}`, subtitle: `${s.reference}${s.yearGroup ? ` · ${s.yearGroup}` : ""} · ${s.status}` })) },
    { type: "guardians", label: "Parents & guardians", tab: "guardians", items: guardians.map((g: any) => ({ id: g.id, title: g.fullName || g.email, subtitle: g.email })) },
    { type: "staff", label: "Staff", tab: "staff", items: staff.map((s: any) => ({ id: s.id, title: s.user?.fullName || s.reference, subtitle: `${s.jobTitle || "Staff"} · ${s.reference}` })) },
    { type: "users", label: "Users & roles", tab: "users", items: users.map((u: any) => ({ id: u.id, title: u.fullName || u.email, subtitle: `${u.email}${u.memberships?.length ? ` · ${u.memberships.map((m: any) => m.role).join(", ")}` : ""}` })) },
    { type: "events", label: "Calendar", tab: "calendar", items: events.map((e: any) => ({ id: e.id, title: e.title, subtitle: `${e.category} · ${new Date(e.startsAt).toLocaleDateString("en-GB")}` })) },
    { type: "trips", label: "Trips", tab: "trips", items: trips.map((t: any) => ({ id: t.id, title: t.title, subtitle: `${t.destination || ""}${t.date ? ` · ${t.date}` : ""}` })) },
    { type: "timetable", label: "Timetable", tab: "timetable", items: timetable.map((t: any) => ({ id: t.id, title: `${t.subject}`, subtitle: `${DAY[t.dayOfWeek] || ""} ${t.startTime || ""}${t.className ? ` · ${t.className}` : t.yearGroup ? ` · ${t.yearGroup}` : ""}` })) },
    { type: "meals", label: "Meals & menus", tab: "meals", items: menus.map((m: any) => ({ id: m.id, title: m.name, subtitle: `${m.day} · ${m.meal}` })) },
    { type: "clubs", label: "Clubs & activities", tab: "clubs", items: clubs.map((c: any) => ({ id: c.id, title: c.name, subtitle: `${c.category}${c.dayOfWeek ? ` · ${c.dayOfWeek}` : ""} · ${c.status}` })) },
    { type: "documents", label: "Knowledge / documents", tab: "knowledge", items: docs.map((d: any) => ({ id: d.id, title: d.title, subtitle: d.category })) },
    { type: "policies", label: "Policies", tab: "knowledge", items: policies.map((p: any) => ({ id: p.id, title: p.title, subtitle: `${p.category} · ${p.status}` })) },
    { type: "announcements", label: "Announcements", tab: "comms", items: notices.map((n: any) => ({ id: n.id, title: n.title, subtitle: `${n.priority} · ${n.status}` })) },
    { type: "faqs", label: "FAQs", tab: "knowledge", items: faqs.map((f: any) => ({ id: f.id, title: f.question, subtitle: f.category || "FAQ" })) },
    { type: "reports", label: "Pupil reports", tab: "reports", items: reports.map((r: any) => ({ id: r.id, title: `${r.student.firstName} ${r.student.lastName} — ${r.title}`, subtitle: r.status })) },
    { type: "messages", label: "Messages / comms", tab: "comms", items: messages.map((m: any) => ({ id: m.id, title: m.title, subtitle: `${m.priority}${m.createdAt ? ` · ${new Date(m.createdAt).toLocaleDateString("en-GB")}` : ""}` })) },
    { type: "trust", label: "Trust documents", tab: "trust", items: trust.map((t: any) => ({ id: t.id, title: t.title, subtitle: `${t.category} · ${t.status}` })) },
  ];
  return groups.filter((g) => g.items.length > 0);
}

/** Parent search — scoped strictly to the parent's own children and what applies to them. */
export async function searchParent(userId: string, q: string): Promise<SearchGroup[]> {
  const children = await getChildren(userId);
  if (!children.length) return [];
  const lower = q.toLowerCase();
  const childIds = new Set(children.map((c) => c.student.id));
  const schoolIds = Array.from(new Set(children.map((c) => c.school.id)));
  const T = 12;

  // Children matching the query directly.
  const childHits = children
    .filter((c) => `${c.student.firstName} ${c.student.lastName}`.toLowerCase().includes(lower) || (c.student.yearGroup || "").toLowerCase().includes(lower))
    .map((c) => ({ id: c.student.id, title: `${c.student.firstName} ${c.student.lastName}`, subtitle: `${c.student.yearGroup || ""} · ${c.school.name}` }));

  const [events, homework, clubs, reports, docs, trust] = await Promise.all([
    safe(() => prisma.calendarEvent.findMany({ where: { schoolId: { in: schoolIds }, status: { not: "cancelled" }, OR: [{ title: ci(q) }, { location: ci(q) }, { description: ci(q) }] }, take: 30, orderBy: { startsAt: "desc" }, include: { students: { select: { studentId: true } } } })),
    safe(() => prisma.homework.findMany({ where: { schoolId: { in: schoolIds }, OR: [{ title: ci(q) }, { subject: ci(q) }] }, take: 30, orderBy: { dueAt: "desc" } })),
    safe(() => prisma.clubMembership.findMany({ where: { studentId: { in: [...childIds] }, status: { in: ["enrolled", "waitlist"] }, club: { OR: [{ name: ci(q) }, { category: ci(q) }] } }, take: T, include: { club: { select: { name: true, category: true, dayOfWeek: true } } } })),
    safe(() => prisma.studentReport.findMany({ where: { studentId: { in: [...childIds] }, status: "released", OR: [{ title: ci(q) }, { summary: ci(q) }] }, take: T, include: { student: { select: { firstName: true } } } })),
    safe(() => prisma.document.findMany({ where: { schoolId: { in: schoolIds }, status: "published", audienceRoles: { contains: "parent" }, OR: [{ title: ci(q) }, { bodyText: ci(q) }] }, take: T, select: { id: true, title: true, category: true } })),
    safe(() => prisma.trustDocument.findMany({ where: { status: "published", toParents: true, OR: [{ title: ci(q) }, { summary: ci(q) }] }, take: T, select: { id: true, title: true, category: true } })),
  ]);

  // Events/homework must actually apply to one of the parent's children.
  const nameOf = new Map(children.map((c) => [c.student.id, c.student.firstName]));
  const eventHits: SearchHit[] = [];
  for (const e of events as any[]) {
    const explicit = new Set(e.students.map((s: any) => s.studentId));
    const kids = children.filter((c) => studentMatchesEvent(c.student, e, explicit)).map((c) => c.student.id);
    if (kids.length) eventHits.push({ id: e.id, title: e.title, subtitle: `${e.category} · ${new Date(e.startsAt).toLocaleDateString("en-GB")} · ${kids.map((k) => nameOf.get(k)).join(", ")}` });
  }
  const hwHits: SearchHit[] = [];
  for (const h of homework as any[]) {
    const kids = children.filter((c) => (!h.classId && !h.yearGroup) || h.classId === c.student.classId || (!!h.yearGroup && h.yearGroup === c.student.yearGroup)).map((c) => c.student.firstName);
    if (kids.length) hwHits.push({ id: h.id, title: h.title, subtitle: `${h.subject || "Homework"} · due ${new Date(h.dueAt).toLocaleDateString("en-GB")} · ${kids.join(", ")}` });
  }

  const groups: SearchGroup[] = [
    { type: "children", label: "My children", tab: "children", items: childHits },
    { type: "events", label: "Calendar & events", tab: "calendar", items: eventHits.slice(0, T) },
    { type: "homework", label: "Homework", tab: "calendar", items: hwHits.slice(0, T) },
    { type: "clubs", label: "Clubs & activities", tab: "clubs", items: (clubs as any[]).map((m) => ({ id: m.id, title: m.club.name, subtitle: `${m.club.category}${m.club.dayOfWeek ? ` · ${m.club.dayOfWeek}` : ""}` })) },
    { type: "reports", label: "Reports", tab: "reports", items: (reports as any[]).map((r) => ({ id: r.id, title: `${r.student.firstName} — ${r.title}`, subtitle: r.term || "report" })) },
    { type: "documents", label: "Documents", tab: "trust", items: (docs as any[]).map((d) => ({ id: d.id, title: d.title, subtitle: d.category })) },
    { type: "trust", label: "Trust & policies", tab: "trust", items: (trust as any[]).map((d) => ({ id: d.id, title: d.title, subtitle: d.category })) },
  ];
  return groups.filter((g) => g.items.length > 0);
}

/** Flatten grouped hits into rows for CSV/Excel export. */
export function flattenGroups(groups: SearchGroup[]): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];
  for (const g of groups) for (const it of g.items) rows.push([g.label, it.title, it.subtitle || ""]);
  return { headers: ["Section", "Result", "Detail"], rows };
}

export function groupsToCsv(groups: SearchGroup[], q: string): string {
  const quo = (v: any) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const { headers, rows } = flattenGroups(groups);
  return [`Search results for,${quo(q)}`, "", headers.join(","), ...rows.map((r) => r.map(quo).join(","))].join("\r\n");
}
