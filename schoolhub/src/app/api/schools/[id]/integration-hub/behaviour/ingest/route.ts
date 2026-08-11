import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertHubAccess } from "@/lib/integration/hub";
import { ingestBehaviourEvents } from "@/lib/integration/behaviour";
import { behaviourIngestSchema } from "@/lib/validation";
import { handleError, ok, AppError } from "@/lib/http";
import { prisma } from "@/lib/db";

type Params = { params: { id: string } };

// Ingest a batch of behaviour events (rewards/consequences) from a connected
// behaviour system. Tenant + Integration Hub RBAC enforced. Idempotent per
// (source, externalId); unmatched pupils and invalid events go to the error
// queue. Guardians are notified subject to their behaviour restriction + prefs.
// This is also the path a real provider webhook drives (see /api/webhooks/[token]).
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertHubAccess(ctx, params.id);
    const i = behaviourIngestSchema.parse(await req.json());

    if (i.integrationId) {
      const integ = await prisma.integration.findFirst({ where: { id: i.integrationId, schoolId: params.id } });
      if (!integ) throw new AppError("Integration not found for this tenant", 404);
    }
    const summary = await ingestBehaviourEvents({
      schoolId: params.id,
      integrationId: i.integrationId ?? null,
      source: i.source,
      events: i.events,
      actor: { userId: ctx.userId, email: ctx.email },
    });
    return ok({ summary });
  } catch (err) { return handleError(err); }
}
