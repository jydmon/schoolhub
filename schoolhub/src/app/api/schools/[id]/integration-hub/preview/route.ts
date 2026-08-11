import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { buildPreview } from "@/lib/integration-preview";
import { handleError, ok, AppError } from "@/lib/http";

type Params = { params: { id: string } };

// Show what a SIMILAR system already integrated (same category) surfaces, so an
// admin can see the objects/fields — and a sample row — before wiring a new
// connector. ?category=behaviour&exclude=<connectorKey>
export async function GET(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_INTEGRATION_HUB, params.id);
    const url = new URL(req.url);
    const category = url.searchParams.get("category");
    if (!category) throw new AppError("category required", 400);
    const exclude = url.searchParams.get("exclude") || undefined;

    const all = await prisma.integration.findMany({
      where: { schoolId: params.id },
      select: { id: true, name: true, connectorKey: true, category: true, status: true, provider: true, supportedObjects: true, supportedOperations: true, lastSuccessAt: true },
    });

    // A representative sample row drawn from the most recent linked external
    // record for a similar system (masked to a preview shape).
    let sample: Record<string, unknown> | null = null;
    const similarKeys = all.filter((i) => i.category === category).map((i) => i.id);
    const link = await prisma.externalRecordLink.findFirst({
      where: { schoolId: params.id, ...(similarKeys.length ? { integrationId: { in: similarKeys } } : {}) },
      orderBy: { updatedAt: "desc" },
    }).catch(() => null);
    if (link) sample = { object: link.objectType, externalId: link.externalId, source: link.sourceSystem, ownership: link.ownership, lastSeen: link.updatedAt };

    return ok(buildPreview({ category, all, excludeConnectorKey: exclude, sample }));
  } catch (err) { return handleError(err); }
}
