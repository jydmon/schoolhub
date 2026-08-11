import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, AUDIT } from "@/lib/constants";
import { DATA_DOMAINS, DOMAIN_LABELS } from "@/lib/connectors";
import { sourcesSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

// Source-of-truth registry: which system owns each data domain.
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_INTEGRATIONS, params.id);

    const rows = await prisma.sourceOfTruth.findMany({
      where: { schoolId: params.id },
      include: { integration: { select: { id: true, name: true } } },
    });
    const byDomain = new Map(rows.map((r) => [r.domain, r]));

    // Merge with the full domain list so every domain is represented; unowned
    // domains default to SchoolHub-native.
    const sources = DATA_DOMAINS.map((domain) => {
      const r = byDomain.get(domain);
      return {
        domain,
        label: DOMAIN_LABELS[domain] ?? domain,
        sourceLabel: r?.sourceLabel ?? "SchoolHub",
        integration: r?.integration ?? null,
        writeBack: r?.writeBack ?? false,
        native: !r?.integrationId,
      };
    });
    return ok({ sources });
  } catch (err) {
    return handleError(err);
  }
}

// Update source-of-truth entries (label / write-back).
export async function PUT(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_INTEGRATIONS, params.id);

    const { sources } = sourcesSchema.parse(await req.json());
    for (const s of sources) {
      await prisma.sourceOfTruth.upsert({
        where: { schoolId_domain: { schoolId: params.id, domain: s.domain } },
        update: { sourceLabel: s.sourceLabel, integrationId: s.integrationId ?? null, writeBack: !!s.writeBack },
        create: { schoolId: params.id, domain: s.domain, sourceLabel: s.sourceLabel, integrationId: s.integrationId ?? null, writeBack: !!s.writeBack },
      });
    }
    await recordAudit({
      action: AUDIT.SOURCE_CHANGED,
      schoolId: params.id,
      actorUserId: ctx.userId,
      actorEmail: ctx.email,
      metadata: { domains: sources.map((s) => s.domain) },
    });
    return ok({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
