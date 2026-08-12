import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, AUDIT, SCHOOL_ROLES, ROLE_LABELS } from "@/lib/constants";
import { staffCreateSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

// List staff profiles with their roles and classes.
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);

    const profiles = await prisma.staffProfile.findMany({
      where: { schoolId: params.id },
      include: {
        user: { include: { memberships: { where: { schoolId: params.id } } } },
        classes: { include: { class: { select: { name: true } } } },
      },
      orderBy: { reference: "asc" },
    });

    return ok({
      staff: profiles.map((s) => ({
        id: s.id,
        reference: s.reference,
        jobTitle: s.jobTitle,
        department: s.department,
        status: (s as any).status ?? "active",
        source: (s as any).source ?? "manual",
        activities: JSON.parse(s.activities || "[]"),
        trips: JSON.parse(s.trips || "[]"),
        classes: s.classes.map((c) => c.class.name),
        user: { id: s.user.id, fullName: s.user.fullName, email: s.user.email, phone: s.user.phone, photoUrl: (s.user as any).photoUrl ?? null },
        roles: s.user.memberships.map((m) => ROLE_LABELS[m.role] ?? m.role),
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}

// Create or attach a staff member with an employment profile.
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);

    const input = staffCreateSchema.parse(await req.json());
    if (!SCHOOL_ROLES.includes(input.role as (typeof SCHOOL_ROLES)[number])) {
      return ok({ error: `role must be one of ${SCHOOL_ROLES.join(", ")}` }, 400);
    }
    const email = input.email.toLowerCase();

    const dupRef = await prisma.staffProfile.findUnique({
      where: { schoolId_reference: { schoolId: params.id, reference: input.reference } },
    });
    if (dupRef) return ok({ error: `Staff reference "${input.reference}" already exists` }, 409);

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: { email, fullName: input.fullName, status: "invited" },
      });
    } else {
      await prisma.user.update({ where: { id: user.id }, data: { fullName: input.fullName } });
    }

    await prisma.membership.upsert({
      where: { userId_schoolId_role: { userId: user.id, schoolId: params.id, role: input.role } },
      update: {},
      create: { userId: user.id, schoolId: params.id, role: input.role },
    });

    const profile = await prisma.staffProfile.upsert({
      where: { schoolId_userId: { schoolId: params.id, userId: user.id } },
      update: { reference: input.reference, jobTitle: input.jobTitle || null, department: input.department || null },
      create: {
        schoolId: params.id,
        userId: user.id,
        reference: input.reference,
        jobTitle: input.jobTitle || null,
        department: input.department || null,
      },
    });

    await recordAudit({
      action: AUDIT.STAFF_CHANGED,
      schoolId: params.id,
      actorUserId: ctx.userId,
      actorEmail: ctx.email,
      targetType: "StaffProfile",
      targetId: profile.id,
      metadata: { reference: input.reference, role: input.role },
    });

    return ok({ profile }, 201);
  } catch (err) {
    return handleError(err);
  }
}
