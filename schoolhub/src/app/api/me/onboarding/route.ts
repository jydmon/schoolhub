import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { hashPassword } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { TERMS_VERSION } from "@/lib/terms";
import { handleError, ok, AppError } from "@/lib/http";

// First-login onboarding state for the signed-in user: whether they must change
// a temporary password, accept the current Terms, and whether the guided tour
// has been dismissed. Drives the blocking onboarding overlay.
export async function GET() {
  try {
    const ctx = await requireAuth();
    const u = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { mustChangePassword: true, termsAcceptedAt: true, termsVersion: true, tourDismissed: true } });
    if (!u) return ok({ error: "Not found" }, 404);
    return ok({
      mustChangePassword: !!u.mustChangePassword,
      termsAccepted: u.termsVersion === TERMS_VERSION && !!u.termsAcceptedAt,
      currentTermsVersion: TERMS_VERSION,
      acceptedTermsVersion: u.termsVersion,
      tourDismissed: !!u.tourDismissed,
    });
  } catch (err) { return handleError(err); }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const b = await req.json().catch(() => ({}));
    const action = String(b.action || "");

    if (action === "change_password") {
      const pw = String(b.newPassword || "");
      if (pw.length < 8) throw new AppError("Password must be at least 8 characters", 400);
      await prisma.user.update({ where: { id: ctx.userId }, data: { passwordHash: await hashPassword(pw), mustChangePassword: false } });
      await recordAudit({ action: "PASSWORD_CHANGED", actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "User", targetId: ctx.userId, metadata: { reason: "temp_password_change" } });
      return ok({ ok: true });
    }
    if (action === "accept_terms") {
      await prisma.user.update({ where: { id: ctx.userId }, data: { termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION } });
      await recordAudit({ action: "TERMS_ACCEPTED", actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "User", targetId: ctx.userId, metadata: { version: TERMS_VERSION } });
      return ok({ ok: true });
    }
    if (action === "dismiss_tour") {
      await prisma.user.update({ where: { id: ctx.userId }, data: { tourDismissed: true } });
      return ok({ ok: true });
    }
    throw new AppError("Unknown action", 400);
  } catch (err) { return handleError(err); }
}
