import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertHubAccess } from "@/lib/integration/hub";
import { suggestMappings } from "@/lib/integration/mapping-ai";
import { hubMappingSuggestSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { AUDIT } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

// AI-assisted field-mapping recommendations. Returns suggestions + confidence;
// never imports data. Administrator approval is required before a mapping is
// saved (enforced by the mapping-save route, not here).
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertHubAccess(ctx, params.id);
    const i = hubMappingSuggestSchema.parse(await req.json());
    const recommendations = suggestMappings(i.fields, { objectFilter: i.objectFilter });
    await recordAudit({ action: AUDIT.HUB_MAPPING_SUGGESTED, schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, metadata: { fields: i.fields.length, object: i.objectFilter ?? "all" } });
    return ok({ recommendations, needsApproval: true });
  } catch (err) { return handleError(err); }
}
