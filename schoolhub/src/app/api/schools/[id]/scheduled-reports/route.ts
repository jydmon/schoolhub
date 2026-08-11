import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { scheduledReportSchema } from "@/lib/validation";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.VIEW_REPORTS, params.id);
    const reports = await prisma.scheduledReport.findMany({ where: { schoolId: params.id }, orderBy: { createdAt: "desc" } });
    return ok({ reports });
  } catch (err) { return handleError(err); }
}

// Schedule a recurring report. The delivery job (email/export) is a background
// worker (see DEPLOYMENT.md) — this persists the schedule.
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.VIEW_REPORTS, params.id);
    const i = scheduledReportSchema.parse(await req.json());
    const report = await prisma.scheduledReport.create({
      data: { schoolId: params.id, type: i.type, cadence: i.cadence || "weekly", format: i.format || "csv", recipients: i.recipients || "", scope: i.scope || "school", createdById: ctx.userId },
    });
    return ok({ report }, 201);
  } catch (err) { return handleError(err); }
}
