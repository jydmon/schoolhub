import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/session";
import { hashPassword } from "@/lib/auth";
import { onboardSchoolSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { AUDIT, ROLES } from "@/lib/constants";
import { handleError, clientIp, ok } from "@/lib/http";

// List all tenants (platform admin only).
export async function GET() {
  try {
    await requirePlatformAdmin();
    const schools = await prisma.school.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        group: true,
        subscription: { include: { plan: true } },
        _count: { select: { memberships: true, students: true, campuses: true } },
      },
    });
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

    return ok({ school: result.school, adminId: result.admin.id }, 201);
  } catch (err) {
    return handleError(err);
  }
}
