import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { loadDriverJourney, rosterForJourney } from "@/lib/driver";
import { notifyStudentGuardians } from "@/lib/transport";
import { positionSchema } from "@/lib/validation";
import { handleError, ok } from "@/lib/http";

type Params = { params: { journeyId: string } };

// Push a GPS position (driver phone / device) and/or report a delay. Rejected once
// the journey is complete — location sharing stops when the journey ends.
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const journey = await loadDriverJourney(ctx, params.journeyId);
    if (!journey) return ok({ error: "Not found" }, 404);
    if (journey.status === "completed" || journey.status === "cancelled") return ok({ error: "Journey has ended; location sharing is off" }, 409);

    const { lat, lng, advance, delayMinutes } = positionSchema.parse(await req.json());
    if (lat != null && lng != null && journey.vehicleId) {
      await prisma.vehiclePosition.create({ data: { vehicleId: journey.vehicleId, journeyId: journey.id, lat, lng } });
    }
    const data: Record<string, unknown> = {};
    if (delayMinutes != null) data.delayMinutes = delayMinutes;
    if (advance) data.status = "approaching";
    if (Object.keys(data).length) await prisma.journey.update({ where: { id: journey.id }, data });

    if (advance || delayMinutes != null) {
      const roster = await rosterForJourney(journey);
      await notifyStudentGuardians(roster.map((p) => p.student.id), {
        kind: advance ? "approaching" : "eta_updated",
        title: advance ? "The bus is approaching" : `Updated ETA — running ${delayMinutes} min late`,
        schoolId: journey.schoolId, journeyId: journey.id,
      });
    }
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
