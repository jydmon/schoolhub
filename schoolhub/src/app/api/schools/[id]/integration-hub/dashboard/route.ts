import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertHubAccess, buildDashboard } from "@/lib/integration/hub";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

// Integration Hub dashboard — connector health, queues, processing counts.
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertHubAccess(ctx, params.id);
    return ok({ dashboard: await buildDashboard(params.id) });
  } catch (err) { return handleError(err); }
}
