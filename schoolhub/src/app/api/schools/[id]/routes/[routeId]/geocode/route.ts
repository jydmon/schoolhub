import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, AUDIT } from "@/lib/constants";
import { geocode, sleep } from "@/lib/geocode";
import { recordAudit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string; routeId: string } };

// Fill in lat/lng for a route's stops that don't have coordinates yet, using the
// stop's address (or its name) plus the school's town/postcode for accuracy.
// Batched to respect Nominatim's ~1 req/sec policy; capped per call so it stays
// within the serverless time budget — re-run to finish a long route.
const PER_CALL = 6;

export async function POST(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRANSPORT, params.id);

    const route = await prisma.route.findFirst({
      where: { id: params.routeId, schoolId: params.id },
      include: { stops: { orderBy: { sequence: "asc" } } },
    });
    if (!route) return ok({ error: "Not found" }, 404);
    const school = await prisma.school.findUnique({ where: { id: params.id }, select: { city: true, postcode: true } });
    const areaHint = [school?.city, school?.postcode].filter(Boolean).join(" ");

    const pending = route.stops.filter((s) => s.lat == null || s.lng == null);
    const batch = pending.slice(0, PER_CALL);
    let updated = 0;
    for (let i = 0; i < batch.length; i++) {
      const s = batch[i];
      const query = [s.address || s.name, areaHint].filter(Boolean).join(", ");
      const r = await geocode(query);
      if (r) { await prisma.routeStop.update({ where: { id: s.id }, data: { lat: r.lat, lng: r.lng } }); updated++; }
      if (i < batch.length - 1) await sleep(1100); // polite rate limit
    }

    const mappedNow = route.stops.length - pending.length + updated;
    await recordAudit({ action: AUDIT.TRANSPORT_CHANGED, schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "Route", targetId: route.id, metadata: { op: "geocode", updated } });
    return ok({ updated, mapped: mappedNow, total: route.stops.length, remaining: Math.max(0, pending.length - updated) });
  } catch (err) { return handleError(err); }
}
