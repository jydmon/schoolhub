import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertHubAccess } from "@/lib/integration/hub";
import { searchCatalog, CATEGORY_LABELS, STATUS_LABELS } from "@/lib/integration/catalog";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

// Connector Marketplace — searchable/filterable catalog for this tenant.
export async function GET(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertHubAccess(ctx, params.id);
    const url = new URL(req.url);
    const connectors = searchCatalog({
      q: url.searchParams.get("q") || undefined,
      category: url.searchParams.get("category") || undefined,
      status: url.searchParams.get("status") || undefined,
    });
    return ok({ connectors, categoryLabels: CATEGORY_LABELS, statusLabels: STATUS_LABELS });
  } catch (err) { return handleError(err); }
}
