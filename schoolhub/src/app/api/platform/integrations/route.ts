import { requireAuth, requirePlatformAdmin } from "@/lib/session";
import { HUB_CATALOG, CATEGORY_LABELS, STATUS_LABELS } from "@/lib/integration/catalog";
import { handleError, ok } from "@/lib/http";

// Platform-wide integration catalogue for the super-admin: every connector the
// platform can offer schools, with category and availability status.
export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx.isPlatformAdmin) await requirePlatformAdmin();
    return ok({
      connectors: HUB_CATALOG.map((c) => ({
        key: c.key, name: c.name, provider: c.provider, category: c.category,
        description: c.description, connectionType: c.connectionType, authMethod: c.authMethod,
        status: c.status, setupComplexity: c.setupComplexity, icon: c.icon,
      })),
      categoryLabels: CATEGORY_LABELS,
      statusLabels: STATUS_LABELS,
    });
  } catch (err) {
    return handleError(err);
  }
}
