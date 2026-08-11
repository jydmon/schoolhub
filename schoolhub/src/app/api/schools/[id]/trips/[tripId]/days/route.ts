import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { tripDaySchema } from "@/lib/validation";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string; tripId: string } };

// Add a day to a residential trip's multi-day itinerary.
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRIPS, params.id);
    const trip = await prisma.trip.findFirst({ where: { id: params.tripId, schoolId: params.id } });
    if (!trip) return ok({ error: "Not found" }, 404);
    const i = tripDaySchema.parse(await req.json());
    const count = await prisma.tripDay.count({ where: { tripId: trip.id } });
    const day = await prisma.tripDay.create({ data: { tripId: trip.id, date: i.date, title: i.title || null, itinerary: i.itinerary || null, sequence: count } });
    return ok({ day }, 201);
  } catch (err) { return handleError(err); }
}
