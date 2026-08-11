import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, AUDIT } from "@/lib/constants";
import { generateJourneysSchema } from "@/lib/validation";
import { todayStr } from "@/lib/transport";
import { recordAudit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

// Generate the day's journeys from active routes (idempotent per route/date/session).
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRANSPORT, params.id);
    const { date, session } = generateJourneysSchema.parse(await req.json());
    const day = date || todayStr();
    const routes = await prisma.route.findMany({ where: { schoolId: params.id, active: true } });

    let created = 0;
    for (const r of routes) {
      const existing = await prisma.journey.findUnique({ where: { routeId_date_session: { routeId: r.id, date: day, session } } });
      if (existing) continue;
      await prisma.journey.create({ data: { schoolId: params.id, routeId: r.id, date: day, session, driverUserId: r.driverUserId, vehicleId: r.vehicleId, status: "scheduled" } });
      created++;
    }
    await recordAudit({ action: AUDIT.TRANSPORT_CHANGED, schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, metadata: { op: "generate", date: day, session, created } });
    return ok({ created, date: day, session });
  } catch (err) { return handleError(err); }
}
