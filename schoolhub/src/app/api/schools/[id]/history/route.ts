import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { searchHistory, historyFacets } from "@/lib/history";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

// Tenant-scoped activity history — every audited action within this school,
// searchable across module, actor, target and metadata.
export async function GET(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.VIEW_AUDIT, params.id);

    const sp = new URL(req.url).searchParams;
    const result = await searchHistory({
      schoolId: params.id,
      q: sp.get("q") || undefined,
      action: sp.get("action") || undefined,
      actor: sp.get("actor") || undefined,
      targetType: sp.get("targetType") || undefined,
      from: sp.get("from") || undefined,
      to: sp.get("to") || undefined,
      take: sp.get("take") ? Number(sp.get("take")) : undefined,
    });
    const facets = sp.get("facets") === "0" ? undefined : await historyFacets({ schoolId: params.id });
    return ok({ ...result, facets });
  } catch (err) {
    return handleError(err);
  }
}
