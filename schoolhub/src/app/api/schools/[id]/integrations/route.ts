import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, AUDIT } from "@/lib/constants";
import { getConnector } from "@/lib/connectors";
import { createIntegrationSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { handleError, clientIp, ok } from "@/lib/http";

type Params = { params: { id: string } };

// List a school's integrations, enriched with catalog metadata.
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_INTEGRATIONS, params.id);

    const integrations = await prisma.integration.findMany({
      where: { schoolId: params.id },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { mappings: true, runs: true } } },
    });

    return ok({
      integrations: integrations.map((i) => {
        const c = getConnector(i.connectorKey);
        return {
          id: i.id,
          connectorKey: i.connectorKey,
          name: i.name,
          category: i.category,
          method: i.method,
          status: i.status,
          enabled: i.enabled,
          writeBackEnabled: i.writeBackEnabled,
          lastSyncAt: i.lastSyncAt,
          lastSuccessAt: i.lastSuccessAt,
          lastError: i.lastError,
          mappingCount: i._count.mappings,
          runCount: i._count.runs,
          domains: c?.domains ?? [],
          supportedMethods: c?.methods ?? [],
        };
      }),
    });
  } catch (err) {
    return handleError(err);
  }
}

// Connect a new integration from a catalog connector.
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_INTEGRATIONS, params.id);

    const input = createIntegrationSchema.parse(await req.json());
    const connector = getConnector(input.connectorKey);
    if (!connector) return ok({ error: "Unknown connector" }, 400);

    const existing = await prisma.integration.findUnique({
      where: { schoolId_connectorKey: { schoolId: params.id, connectorKey: input.connectorKey } },
    });
    if (existing) return ok({ error: `${connector.name} is already connected` }, 409);

    const method = input.method && connector.methods.includes(input.method) ? input.method : connector.methods[0];
    const webhookToken = method === "webhook" ? randomBytes(18).toString("hex") : null;

    const integration = await prisma.integration.create({
      data: {
        schoolId: params.id,
        connectorKey: connector.key,
        name: input.name || connector.name,
        category: connector.category,
        method,
        status: "pending",
        webhookToken,
        config: JSON.stringify(input.config ?? {}),
        mappings: {
          create: connector.defaultMappings.map((m) => ({
            schoolId: params.id,
            domain: m.domain,
            externalField: m.externalField,
            internalField: m.internalField,
            direction: m.direction ?? "in",
          })),
        },
      },
    });

    // Register this connector as the source of truth for the domains it owns.
    for (const domain of connector.domains) {
      await prisma.sourceOfTruth.upsert({
        where: { schoolId_domain: { schoolId: params.id, domain } },
        update: { sourceLabel: connector.sourceLabel, integrationId: integration.id },
        create: { schoolId: params.id, domain, sourceLabel: connector.sourceLabel, integrationId: integration.id },
      });
    }

    await recordAudit({
      action: AUDIT.INTEGRATION_CONNECTED,
      schoolId: params.id,
      actorUserId: ctx.userId,
      actorEmail: ctx.email,
      targetType: "Integration",
      targetId: integration.id,
      ip: clientIp(req),
      metadata: { connector: connector.key, method },
    });

    return ok({ integration }, 201);
  } catch (err) {
    return handleError(err);
  }
}
