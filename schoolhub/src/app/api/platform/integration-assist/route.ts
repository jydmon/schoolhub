import { prisma } from "@/lib/db";
import { requireAuth, requirePlatformAdmin } from "@/lib/session";
import { CONNECTOR_CATALOG, getConnector } from "@/lib/connectors";
import { recordAudit } from "@/lib/audit";
import { AUDIT } from "@/lib/constants";
import { handleError, ok, AppError } from "@/lib/http";

// Super-admin integration assist: help a tenant get an integration set up by
// pre-creating the (non-secret) connector configuration for their school. The
// tenant still supplies credentials themselves — this only scaffolds the
// connector, so the school admin lands on a ready-to-authorise integration.

async function assertPlatform(ctx: any) { if (!ctx.isPlatformAdmin) await requirePlatformAdmin(); }

// GET: the connector catalogue, plus (with ?schoolId=) that school's current integrations.
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    await assertPlatform(ctx);
    const schoolId = new URL(req.url).searchParams.get("schoolId");
    const catalog = CONNECTOR_CATALOG.map((c) => ({ key: c.key, name: c.name, category: c.category }));
    if (!schoolId) return ok({ catalog, integrations: [] });
    const integrations = await prisma.integration.findMany({ where: { schoolId }, orderBy: { createdAt: "asc" } });
    return ok({
      catalog,
      integrations: integrations.map((i) => {
        let cfg: any = {}; try { cfg = JSON.parse(i.config || "{}"); } catch { /* ignore */ }
        return { id: i.id, connectorKey: i.connectorKey, name: i.name, category: i.category, method: i.method, status: i.status, baseUrl: cfg.baseUrl ?? null, notes: cfg.notes ?? null, lastError: i.lastError };
      }),
    });
  } catch (err) { return handleError(err); }
}

// POST: scaffold a connector for a school (upsert by schoolId+connectorKey).
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    await assertPlatform(ctx);
    const b = await req.json().catch(() => ({}));
    const schoolId = String(b.schoolId ?? "");
    const connectorKey = String(b.connectorKey ?? "");
    if (!schoolId) throw new AppError("schoolId is required", 400);
    const connector = getConnector(connectorKey);
    if (!connector) throw new AppError("Unknown connector", 400);
    const school = await prisma.school.findUnique({ where: { id: schoolId } });
    if (!school) throw new AppError("School not found", 404);

    const config: any = {};
    if (b.baseUrl) config.baseUrl = String(b.baseUrl);
    if (b.notes) config.notes = String(b.notes);
    const method = ["rest", "webhook", "scheduled", "sftp", "csv", "manual"].includes(b.method) ? b.method : "rest";

    const integration = await prisma.integration.upsert({
      where: { schoolId_connectorKey: { schoolId, connectorKey } },
      update: { name: b.name?.trim() || connector.name, method, config: JSON.stringify(config) },
      create: {
        schoolId, connectorKey, name: b.name?.trim() || connector.name, category: connector.category,
        method, status: "pending", config: JSON.stringify(config),
      },
    });
    await recordAudit({ action: AUDIT.INTEGRATION_CREATED ?? "INTEGRATION_CREATED", schoolId, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "Integration", targetId: integration.id, metadata: { connectorKey, assistedBySuperAdmin: true } });
    return ok({ id: integration.id, status: integration.status }, 201);
  } catch (err) { return handleError(err); }
}
