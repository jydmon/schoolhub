import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, AUDIT } from "@/lib/constants";
import { tripSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRIPS, params.id);
    const trips = await prisma.trip.findMany({
      where: { schoolId: params.id },
      include: { _count: { select: { students: true, staff: true, updates: true } } },
      orderBy: { date: "desc" },
    });
    return ok({ trips });
  } catch (err) { return handleError(err); }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRIPS, params.id);
    const i = tripSchema.parse(await req.json());
    const trip = await prisma.trip.create({
      data: {
        schoolId: params.id, title: i.title, purpose: i.purpose || null, date: i.date, destination: i.destination || null,
        departurePoint: i.departurePoint || null, departureTime: i.departureTime || null, returnTime: i.returnTime || null,
        leadTeacherUserId: i.leadTeacherUserId || null, transportProvider: i.transportProvider || null, coachDetails: i.coachDetails || null,
        driverDetails: i.driverDetails || null, venue: i.venue || null, itinerary: i.itinerary || null, packingList: i.packingList || null,
        medicalRequirements: i.medicalRequirements || null, consentRequired: i.consentRequired ?? true, paymentStatus: i.paymentStatus || null,
        riskAssessmentRef: i.riskAssessmentRef || null, status: i.status || "planned", createdById: ctx.userId,
      },
    });
    await recordAudit({ action: AUDIT.TRIP_CHANGED, schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "Trip", targetId: trip.id, metadata: { op: "create", title: trip.title } });
    return ok({ trip }, 201);
  } catch (err) { return handleError(err); }
}
