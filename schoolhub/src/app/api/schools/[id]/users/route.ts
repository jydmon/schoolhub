import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess, listTenantMemberships } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, AUDIT, ROLE_LABELS } from "@/lib/constants";
import { hashPassword, createVerificationToken } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { createUserSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { handleError, clientIp, ok } from "@/lib/http";

type Params = { params: { id: string } };

// List all users (memberships) in a school.
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);
    const memberships = await listTenantMemberships(params.id);
    return ok({
      users: memberships.map((m) => ({
        membershipId: m.id,
        role: m.role,
        roleLabel: ROLE_LABELS[m.role] ?? m.role,
        user: {
          id: m.user.id,
          email: m.user.email,
          fullName: m.user.fullName,
          status: m.user.status,
          emailVerified: m.user.emailVerified,
          mfaEnabled: m.user.mfaEnabled,
        },
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}

// Create (or attach) a user with a role in this school.
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);

    const input = createUserSchema.parse(await req.json());
    const email = input.email.toLowerCase();

    let user = await prisma.user.findUnique({ where: { email } });
    let created = false;

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          fullName: input.fullName,
          status: input.password ? "active" : "invited",
          passwordHash: input.password ? await hashPassword(input.password) : null,
        },
      });
      created = true;
    }

    // Idempotent role grant within this tenant.
    const existing = await prisma.membership.findUnique({
      where: {
        userId_schoolId_role: { userId: user.id, schoolId: params.id, role: input.role },
      },
    });
    if (existing) return ok({ error: "User already has that role here" }, 409);

    const membership = await prisma.membership.create({
      data: { userId: user.id, schoolId: params.id, role: input.role },
    });

    // Invited users get an email-verification / set-password link.
    if (created && !input.password) {
      const token = await createVerificationToken(user.id, "email_verify", 60 * 24 * 3);
      await sendEmail({
        to: user.email,
        subject: "You've been invited to SchoolHub",
        body: `Set up your account: ${process.env.APP_URL ?? ""}/verify?token=${token}`,
      });
    }

    await recordAudit({
      action: created ? AUDIT.ACCOUNT_CREATED : AUDIT.PERMISSION_CHANGED,
      schoolId: params.id,
      actorUserId: ctx.userId,
      actorEmail: ctx.email,
      targetType: "User",
      targetId: user.id,
      ip: clientIp(req),
      metadata: { role: input.role, email },
    });

    return ok({ membershipId: membership.id, userId: user.id }, 201);
  } catch (err) {
    return handleError(err);
  }
}
