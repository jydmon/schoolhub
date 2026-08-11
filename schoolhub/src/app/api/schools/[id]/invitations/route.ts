import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { inviteCreateSchema } from "@/lib/validation";
import { createInvitation } from "@/lib/invitations";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

// List invitations for the tenant (admin).
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);
    const invitations = await prisma.invitation.findMany({
      where: { schoolId: params.id },
      select: { id: true, email: true, role: true, status: true, requireMfa: true, expiresAt: true, acceptedAt: true, createdAt: true },
      orderBy: { createdAt: "desc" }, take: 200,
    });
    return ok({ invitations });
  } catch (err) { return handleError(err); }
}

// Create an invitation. Parents cannot self-register — this is the only way an
// account is provisioned. The token + code are returned so the caller can email
// the activation link (never stored in raw form).
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);
    const i = inviteCreateSchema.parse(await req.json());
    const res = await createInvitation({
      schoolId: params.id, email: i.email, role: i.role, studentRefs: i.studentRefs,
      requireMfa: i.requireMfa, invitedById: ctx.userId, actorEmail: ctx.email,
    });
    return ok(res, 201);
  } catch (err) { return handleError(err); }
}
