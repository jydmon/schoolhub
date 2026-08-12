import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, ROLES } from "@/lib/constants";
import { createInvitation } from "@/lib/invitations";
import { sendEmail } from "@/lib/email";
import { handleError, ok, AppError } from "@/lib/http";

type Params = { params: { id: string; guardianId: string } };

const APP_URL = () => (process.env.APP_URL || "https://app.siplat.co").replace(/\/+$/, "");

// Invite a parent/guardian to the platform. If they're already an active
// account they're already on the app (they'll see it in-app); otherwise we
// create an invitation and email them the activation link. (SMS/WhatsApp go out
// too when a messaging provider is configured and the parent has consented.)
export async function POST(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);

    const user = await prisma.user.findFirst({
      where: { id: params.guardianId, memberships: { some: { schoolId: params.id, role: ROLES.PARENT } } },
      include: { guardianLinks: { where: { schoolId: params.id }, include: { student: { select: { reference: true } } } } },
    });
    if (!user) throw new AppError("Guardian not found", 404);

    if (user.status === "active" && user.passwordHash) {
      return ok({ status: "already_on_platform", message: `${user.fullName} already has an active account — they'll see this in-app.` });
    }

    const studentRefs = user.guardianLinks.map((g) => g.student?.reference).filter(Boolean) as string[];
    const { activationLink } = await createInvitation({
      schoolId: params.id, email: user.email, role: ROLES.PARENT, studentRefs,
      invitedById: ctx.userId, actorEmail: ctx.email,
    });
    const link = `${APP_URL()}${activationLink}`;
    try {
      await sendEmail({
        to: user.email,
        subject: "You're invited to your school's SIPlat parent portal",
        body: `<p>Hello ${user.fullName},</p><p>Your school has invited you to the SIPlat parent portal, where you can see your child's updates, reports, trips and more.</p><p><a href="${link}">Activate your account</a></p>`,
      });
    } catch { /* email failure shouldn't block the invitation record */ }

    return ok({ status: "invited", message: `Invitation sent to ${user.email}. If they're on our messaging channels they'll also get a text/WhatsApp.` });
  } catch (err) { return handleError(err); }
}
