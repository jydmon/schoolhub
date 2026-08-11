import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, AUDIT } from "@/lib/constants";
import { getConnector } from "@/lib/connectors";
import { updateIntegrationSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { handleError, clientIp, ok } from "@/lib/http";

type Params = { params: { id: string; intId: string } };

async function load(schoolId: string, intId: string) {
  return prisma.integration.findFirst({ where: { id: intId, schoolId } });
}

// Integration detail: config, mappings and recent sync runs.
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_INTEGRATIONS, params.id);

    const integration = await prisma.integration.findFirst({
      where: { id: params.intId, schoolId: params.id },
      include: {
        mappings: { orderBy: { domain: "asc" } },
        runs: { orderBy: { startedAt: "desc" }, take: 20 },
      },
    });
    if (!integration) return ok({ error: "Not found" }, 404);
    const connector = getConnector(integration.connectorKey);

    return ok({
      integration: {
        ...integration,
        config: safe(integration.config),
        runs: integration.runs.map((r) => ({ ...r, log: safeArr(r.log) })),
      },
      connector,
    });
  } catch (err) {
    return handleError(err);
  }
}

// Update config / method / enable / disable / write-back.
export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_INTEGRATIONS, params.id);

    const integration = await load(params.id, params.intId);
    if (!integration) return ok({ error: "Not found" }, 404);

    const input = updateIntegrationSchema.parse(await req.json());
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.method !== undefined) data.method = input.method;
    if (input.writeBackEnabled !== undefined) data.writeBackEnabled = input.writeBackEnabled;
    if (input.config !== undefined) data.config = JSON.stringify(input.config);
    if (input.enabled !== undefined) {
      data.enabled = input.enabled;
      data.status = input.enabled ? (integration.lastSuccessAt ? "connected" : "pending") : "disabled";
    }
    if (input.status !== undefined) data.status = input.status;

    const updated = await prisma.integration.update({ where: { id: integration.id }, data });

    await recordAudit({
      action: input.enabled === false ? AUDIT.INTEGRATION_DISABLED : AUDIT.INTEGRATION_ACTIVITY,
      schoolId: params.id,
      actorUserId: ctx.userId,
      actorEmail: ctx.email,
      targetType: "Integration",
      targetId: integration.id,
      ip: clientIp(req),
      metadata: { fields: Object.keys(data) },
    });

    return ok({ integration: { ...updated, config: safe(updated.config) } });
  } catch (err) {
    return handleError(err);
  }
}

// Remove an integration (its mappings and runs cascade).
export async function DELETE(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_INTEGRATIONS, params.id);

    const integration = await load(params.id, params.intId);
    if (!integration) return ok({ error: "Not found" }, 404);

    // Detach any source-of-truth rows this integration owned.
    await prisma.sourceOfTruth.updateMany({
      where: { schoolId: params.id, integrationId: integration.id },
      data: { integrationId: null, sourceLabel: "SchoolHub" },
    });
    await prisma.integration.delete({ where: { id: integration.id } });

    await recordAudit({
      action: AUDIT.INTEGRATION_REMOVED,
      schoolId: params.id,
      actorUserId: ctx.userId,
      actorEmail: ctx.email,
      targetType: "Integration",
      targetId: integration.id,
      metadata: { connector: integration.connectorKey },
    });

    return ok({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

function safe(s: string) {
  try { return JSON.parse(s || "{}"); } catch { return {}; }
}
function safeArr(s: string) {
  try { return JSON.parse(s || "[]"); } catch { return []; }
}
