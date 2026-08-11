import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, AUDIT } from "@/lib/constants";
import { mappingsSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string; intId: string } };

// Replace the full field-mapping set for an integration.
export async function PUT(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_INTEGRATIONS, params.id);

    const integration = await prisma.integration.findFirst({
      where: { id: params.intId, schoolId: params.id },
    });
    if (!integration) return ok({ error: "Not found" }, 404);

    const { mappings } = mappingsSchema.parse(await req.json());

    await prisma.$transaction([
      prisma.fieldMapping.deleteMany({ where: { integrationId: integration.id } }),
      prisma.fieldMapping.createMany({
        data: mappings.map((m) => ({
          integrationId: integration.id,
          schoolId: params.id,
          domain: m.domain,
          externalField: m.externalField,
          internalField: m.internalField,
          direction: m.direction ?? "in",
        })),
      }),
    ]);

    await recordAudit({
      action: AUDIT.MAPPING_CHANGED,
      schoolId: params.id,
      actorUserId: ctx.userId,
      actorEmail: ctx.email,
      targetType: "Integration",
      targetId: integration.id,
      metadata: { count: mappings.length },
    });

    return ok({ ok: true, count: mappings.length });
  } catch (err) {
    return handleError(err);
  }
}
