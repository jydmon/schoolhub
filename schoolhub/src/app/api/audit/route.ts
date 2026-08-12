import { requirePlatformAdmin } from "@/lib/session";
import { searchHistory, historyFacets } from "@/lib/history";
import { handleError, ok } from "@/lib/http";

// Platform-wide audit trail / activity history (super admin only), searchable
// across every tenant plus platform-level events.
export async function GET(req: Request) {
  try {
    await requirePlatformAdmin();
    const sp = new URL(req.url).searchParams;
    const result = await searchHistory({
      platform: true,
      q: sp.get("q") || undefined,
      action: sp.get("action") || undefined,
      actor: sp.get("actor") || undefined,
      targetType: sp.get("targetType") || undefined,
      from: sp.get("from") || undefined,
      to: sp.get("to") || undefined,
      take: sp.get("take") ? Number(sp.get("take")) : undefined,
    });
    const facets = sp.get("facets") === "0" ? undefined : await historyFacets({ platform: true });
    return ok({ entries: result.entries, truncated: result.truncated, facets });
  } catch (err) {
    return handleError(err);
  }
}
