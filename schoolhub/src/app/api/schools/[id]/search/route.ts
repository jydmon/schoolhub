import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };
const ci = (q: string) => ({ contains: q, mode: "insensitive" as const });

// Portal-wide search across the main record types a School Administrator works
// with. Tenant-scoped; each group is capped so the response stays light. Each
// hit carries the `tab` it lives under so the UI can jump straight there.
export async function GET(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.VIEW_DASHBOARDS, params.id);
    const q = (new URL(req.url).searchParams.get("q") || "").trim();
    if (q.length < 2) return ok({ groups: [], q });

    const sid = params.id;
    const [students, guardians, staff, events, trips, menus, docs, reports] = await Promise.all([
      prisma.student.findMany({ where: { schoolId: sid, OR: [{ firstName: ci(q) }, { lastName: ci(q) }, { reference: ci(q) }] }, take: 8, select: { id: true, firstName: true, lastName: true, reference: true, yearGroup: true, status: true } }),
      prisma.user.findMany({ where: { memberships: { some: { schoolId: sid, role: "Parent" } }, OR: [{ fullName: ci(q) }, { email: ci(q) }] }, take: 8, select: { id: true, fullName: true, email: true } }),
      prisma.staffProfile.findMany({ where: { schoolId: sid, OR: [{ reference: ci(q) }, { jobTitle: ci(q) }, { user: { fullName: ci(q) } }] }, take: 8, include: { user: { select: { fullName: true } } } }),
      prisma.calendarEvent.findMany({ where: { schoolId: sid, OR: [{ title: ci(q) }, { location: ci(q) }, { description: ci(q) }] }, take: 8, orderBy: { startsAt: "desc" }, select: { id: true, title: true, startsAt: true, category: true } }),
      prisma.trip.findMany({ where: { schoolId: sid, OR: [{ title: ci(q) }, { destination: ci(q) }, { venue: ci(q) }] }, take: 8, select: { id: true, title: true, date: true, destination: true } }),
      prisma.menuItem.findMany({ where: { schoolId: sid, OR: [{ name: ci(q) }, { allergens: ci(q) }] }, take: 8, select: { id: true, name: true, day: true, meal: true } }),
      prisma.document.findMany({ where: { schoolId: sid, title: ci(q) }, take: 8, select: { id: true, title: true, category: true } }),
      prisma.studentReport.findMany({ where: { schoolId: sid, OR: [{ title: ci(q) }, { summary: ci(q) }] }, take: 8, include: { student: { select: { firstName: true, lastName: true } } } }),
    ]);

    const groups = [
      { type: "students", label: "Pupils", tab: "students", items: students.map((s) => ({ title: `${s.firstName} ${s.lastName}`, subtitle: `${s.reference}${s.yearGroup ? ` · ${s.yearGroup}` : ""} · ${s.status}` })) },
      { type: "guardians", label: "Parents & guardians", tab: "guardians", items: guardians.map((g) => ({ title: g.fullName || g.email, subtitle: g.email })) },
      { type: "staff", label: "Staff", tab: "staff", items: staff.map((s) => ({ title: s.user?.fullName || s.reference, subtitle: `${s.jobTitle || "Staff"} · ${s.reference}` })) },
      { type: "events", label: "Calendar", tab: "calendar", items: events.map((e) => ({ title: e.title, subtitle: `${e.category} · ${new Date(e.startsAt).toLocaleDateString("en-GB")}` })) },
      { type: "trips", label: "Trips", tab: "trips", items: trips.map((t) => ({ title: t.title, subtitle: `${t.destination || ""}${t.date ? ` · ${t.date}` : ""}` })) },
      { type: "meals", label: "Meals & menus", tab: "meals", items: menus.map((m) => ({ title: m.name, subtitle: `${m.day} · ${m.meal}` })) },
      { type: "documents", label: "Knowledge / documents", tab: "knowledge", items: docs.map((d) => ({ title: d.title, subtitle: d.category })) },
      { type: "reports", label: "Pupil reports", tab: "reports", items: reports.map((r) => ({ title: `${r.student.firstName} ${r.student.lastName} — ${r.title}`, subtitle: r.status })) },
    ].filter((g) => g.items.length > 0);

    const total = groups.reduce((n, g) => n + g.items.length, 0);
    return ok({ groups, total, q });
  } catch (err) { return handleError(err); }
}
