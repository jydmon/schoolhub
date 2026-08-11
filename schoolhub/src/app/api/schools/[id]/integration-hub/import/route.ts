import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertHubAccess, runHubImport } from "@/lib/integration/hub";
import { hubImportSchema } from "@/lib/validation";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

// End-to-end import via the generic file connector (CSV/JSON): parse → map +
// transform → validate → persist with per-record provenance; failed rows go to
// the error queue. Serialised per connector (no concurrent runs).
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertHubAccess(ctx, params.id);
    const i = hubImportSchema.parse(await req.json());
    const res = await runHubImport({
      schoolId: params.id,
      integrationId: i.integrationId,
      connectorKey: i.connectorKey,
      sourceSystem: i.sourceSystem,
      format: i.format,
      raw: i.raw,
      targetObject: i.targetObject,
      mapping: i.mapping,
      actor: { userId: ctx.userId, email: ctx.email },
    });
    return ok(res, 200);
  } catch (err) { return handleError(err); }
}
