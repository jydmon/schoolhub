import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/session";
import { hashPassword } from "@/lib/auth";
import { onboardSchoolSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { AUDIT, ROLES } from "@/lib/constants";
import { sendEmail } from "@/lib/email";
import { accountManagerScope } from "@/lib/platform-staff";
import { managerCoversSchool } from "@/lib/platform-staff-logic";
import { handleError, clientIp, ok } from "@/lib/http";

// List tenants. Platform admins see all; an Account Manager sees only the
// schools in their geographic portfolio (by county/state and/or country).
export async function GET() {
  try {
    const ctx = await requirePlatformAdmin();
    const all = await prisma.school.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        group: true,
        subscription: { include: { plan: true } },
        _count: { select: { memberships: true, students: true, campuses: true } },
      },
    });
    const scope = await accountManagerScope(ctx.userId);
    const schools = scope ? all.filter((s) => managerCoversSchool(scope, s)) : all;
    return ok({ schools });
  } catch (err) {
    return handleError(err);
  }
}

// Onboard a new school tenant with its first School Administrator.
export async function POST(req: Request) {
  try {
    const ctx = await requirePlatformAdmin();
    const input = onboardSchoolSchema.parse(await req.json());

    const existingSlug = await prisma.school.findUnique({ where: { slug: input.slug } });
    if (existingSlug) return ok({ error: "That slug is already taken" }, 409);

    const existingUser = await prisma.user.findUnique({
      where: { email: input.adminEmail.toLowerCase() },
    });
    if (existingUser) return ok({ error: "A user with that email already exists" }, 409);

    const plan = await prisma.plan.findUnique({ where: { key: input.planKey } });
    if (!plan) return ok({ error: "Unknown plan" }, 400);

    const result = await prisma.$transaction(async (tx) => {
      const school = await tx.school.create({
        data: {
          name: input.schoolName,
          slug: input.slug,
          status: input.planKey === "trial" ? "trial" : "active",
          // New tenants start pending: the admin must accept Terms, complete the
          // profile and submit payment, then an AM/Super-Admin activates them.
          activationStatus: "pending",
          groupId: input.groupId ?? null,
          config: {
            create: {
              timezone: input.timezone,
              enabledModules: plan.features || "dashboard,calendar",
            },
          },
          subscription: {
            create: {
              planId: plan.id,
              status: input.planKey === "trial" ? "trialing" : "active",
              renewalDate: new Date(Date.now() + 365 * 24 * 3600 * 1000),
              aiUsageLimit: plan.aiQueryLimit,
            },
          },
        },
      });

      const admin = await tx.user.create({
        data: {
          email: input.adminEmail.toLowerCase(),
          fullName: input.adminName,
          passwordHash: await hashPassword(input.adminPassword),
          status: "active",
        },
      });

      await tx.membership.create({
        data: { userId: admin.id, schoolId: school.id, role: ROLES.SCHOOL_ADMIN },
      });

      return { school, admin };
    });

    await recordAudit({
      action: AUDIT.TENANT_CREATED,
      schoolId: result.school.id,
      actorUserId: ctx.userId,
      actorEmail: ctx.email,
      targetType: "School",
      targetId: result.school.id,
      ip: clientIp(req),
      metadata: { name: input.schoolName, plan: input.planKey },
    });
    await recordAudit({
      action: AUDIT.ACCOUNT_CREATED,
      schoolId: result.school.id,
      actorUserId: ctx.userId,
      actorEmail: ctx.email,
      targetType: "User",
      targetId: result.admin.id,
      metadata: { role: ROLES.SCHOOL_ADMIN },
    });

    // Welcome email so the new school administrator can start using the platform.
    try {
      const appUrl = process.env.APP_URL ?? "";
      await sendEmail({
        to: result.admin.email,
        subject: `Welcome to SIPlat — ${input.schoolName}`,
        body: `Hi ${input.adminName},\n\n${input.schoolName} is now set up on SIPlat, and you are the School Administrator.\n\nSign in to get started:\n${appUrl}/login\n\nEmail: ${result.admin.email}\nUse the temporary password you were given, then change it under “My security”.\n\nFrom here you can add students, guardians and staff (manually or by connecting your systems), set up transport and communications, and invite colleagues.\n\nWelcome aboard,\nThe SIPlat team`,
      });
    } catch { /* non-fatal: email provider may not be configured yet */ }

    return ok({ school: result.school, adminId: result.admin.id }, 201);
  } catch (err) {
    return handleError(err);
  }
}
