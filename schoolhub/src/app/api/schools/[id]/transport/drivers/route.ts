import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, ROLES } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

// Drivers in a school (users with the Driver role) with their personnel profile
// and current route assignments. MANAGE_TRANSPORT scoped.
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRANSPORT, params.id);

    const memberships = await prisma.membership.findMany({
      where: { schoolId: params.id, role: ROLES.DRIVER },
      include: { user: { select: { id: true, fullName: true, email: true, phone: true, status: true } } },
    });
    const userIds = memberships.map((m) => m.user.id);
    const [profiles, assignments, routes] = await Promise.all([
      prisma.driverProfile.findMany({ where: { schoolId: params.id, userId: { in: userIds } } }),
      prisma.routeDriver.findMany({ where: { schoolId: params.id, driverUserId: { in: userIds } } }),
      prisma.route.findMany({ where: { schoolId: params.id }, select: { id: true, name: true } }),
    ]);
    const pMap = new Map(profiles.map((p) => [p.userId, p]));
    const rMap = new Map(routes.map((r) => [r.id, r.name]));

    const drivers = memberships.map((m) => {
      const p = pMap.get(m.user.id);
      const mine = assignments.filter((a) => a.driverUserId === m.user.id).map((a) => ({ id: a.id, routeId: a.routeId, routeName: rMap.get(a.routeId) || "?", role: a.role, session: a.session }));
      return {
        id: m.user.id, fullName: m.user.fullName, email: m.user.email, phone: p?.phone || m.user.phone, status: m.user.status,
        profile: p ? { licenceNumber: p.licenceNumber, licenceClasses: p.licenceClasses, licenceExpiry: p.licenceExpiry, dbsExpiry: p.dbsExpiry, medicalDue: p.medicalDue, status: p.status, notes: p.notes } : null,
        assignments: mine,
      };
    });
    return ok({ drivers, routes });
  } catch (err) { return handleError(err); }
}

// Create/update a driver's personnel profile (licence, DBS, medical, notes).
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRANSPORT, params.id);
    const b = await req.json().catch(() => ({}));
    if (!b.userId) return ok({ error: "userId required" }, 400);
    const data = {
      phone: b.phone ?? null, licenceNumber: b.licenceNumber ?? null, licenceClasses: b.licenceClasses ?? null,
      licenceExpiry: b.licenceExpiry ?? null, dbsExpiry: b.dbsExpiry ?? null, medicalDue: b.medicalDue ?? null,
      status: b.status || "active", notes: b.notes ?? null,
    };
    const profile = await prisma.driverProfile.upsert({
      where: { userId: String(b.userId) },
      update: data,
      create: { schoolId: params.id, userId: String(b.userId), ...data },
    });
    return ok({ profile });
  } catch (err) { return handleError(err); }
}
