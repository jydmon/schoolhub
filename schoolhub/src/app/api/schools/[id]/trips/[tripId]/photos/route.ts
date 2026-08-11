import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { tripPhotoSchema } from "@/lib/validation";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string; tripId: string } };

// Add a trip photo. Only photos with sharedWithParents = true reach parents.
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRIPS, params.id);
    const trip = await prisma.trip.findFirst({ where: { id: params.tripId, schoolId: params.id } });
    if (!trip) return ok({ error: "Not found" }, 404);
    const i = tripPhotoSchema.parse(await req.json());
    const photo = await prisma.tripPhoto.create({ data: { tripId: trip.id, url: i.url, caption: i.caption || null, sharedWithParents: !!i.sharedWithParents } });
    return ok({ photo }, 201);
  } catch (err) { return handleError(err); }
}
