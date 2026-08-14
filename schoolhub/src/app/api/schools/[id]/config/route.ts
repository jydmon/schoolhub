import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { updateConfigSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { AUDIT } from "@/lib/constants";
import { handleError, clientIp, ok } from "@/lib/http";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    const school = await prisma.school.findUnique({
      where: { id: params.id },
      include: { config: true },
    });
    if (!school) return ok({ error: "Not found" }, 404);
    return ok({ school });
  } catch (err) {
    return handleError(err);
  }
}

// Update school branding, contact details and operational config.
export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_SCHOOL_CONFIG, params.id);

    const input = updateConfigSchema.parse(await req.json());

    const schoolData: Record<string, unknown> = {};
    for (const k of [
      "name",
      "logoUrl",
      "colorPrimary",
      "colorAccent",
      "addressLine1",
      "addressLine2",
      "city",
      "county",
      "postcode",
      "country",
      "contactName",
      "contactEmail",
      "contactPhone",
      "headTeacher",
      "headTeacherEmail",
      "headTeacherPhone",
    ] as const) {
      if (input[k] !== undefined) schoolData[k] = input[k];
    }

    const configData: Record<string, unknown> = {};
    if (input.timezone !== undefined) configData.timezone = input.timezone;
    if (input.academicYear !== undefined) configData.academicYear = input.academicYear;
    if (input.dataRetentionDays !== undefined)
      configData.dataRetentionDays = input.dataRetentionDays;
    if (input.enabledModules !== undefined)
      configData.enabledModules = input.enabledModules.join(",");
    if (input.termDates !== undefined) configData.termDates = JSON.stringify(input.termDates);
    if (input.notificationSettings !== undefined)
      configData.notificationSettings = JSON.stringify(input.notificationSettings);

    const school = await prisma.school.update({
      where: { id: params.id },
      data: {
        ...schoolData,
        config: {
          upsert: {
            create: configData,
            update: configData,
          },
        },
      },
      include: { config: true },
    });

    await recordAudit({
      action: AUDIT.CONFIG_CHANGED,
      schoolId: params.id,
      actorUserId: ctx.userId,
      actorEmail: ctx.email,
      targetType: "School",
      targetId: params.id,
      ip: clientIp(req),
      metadata: { fields: [...Object.keys(schoolData), ...Object.keys(configData)] },
    });

    return ok({ school });
  } catch (err) {
    return handleError(err);
  }
}
