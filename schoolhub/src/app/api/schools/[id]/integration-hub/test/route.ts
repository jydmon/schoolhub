import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertHubAccess, testConnection } from "@/lib/integration/hub";
import { hubTestSchema } from "@/lib/validation";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

// Test a connector's configuration + credentials. Provider shells report
// "configuration valid — live handshake pending" rather than a fabricated OK.
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertHubAccess(ctx, params.id);
    const i = hubTestSchema.parse(await req.json());
    const res = await testConnection({ schoolId: params.id, integrationId: i.integrationId, actor: { userId: ctx.userId, email: ctx.email } });
    return ok(res);
  } catch (err) { return handleError(err); }
}
