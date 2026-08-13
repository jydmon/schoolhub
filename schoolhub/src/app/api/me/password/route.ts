import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { handleError, ok, AppError } from "@/lib/http";

// Change your own password. Requires the current password. Bumps sessionVersion
// so other sessions are signed out. Stamps passwordChangedAt (guarded).
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const b = await req.json().catch(() => ({}));
    const current = String(b.currentPassword || "");
    const next = String(b.newPassword || "");
    if (next.length < 8) throw new AppError("Your new password must be at least 8 characters.", 400);

    const user = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { id: true, email: true, passwordHash: true } });
    if (!user) throw new AppError("Account not found", 404);
    if (user.passwordHash) {
      if (!current) throw new AppError("Enter your current password.", 400);
      const okPw = await verifyPassword(current, user.passwordHash);
      if (!okPw) throw new AppError("Your current password is incorrect.", 403);
      if (await verifyPassword(next, user.passwordHash)) throw new AppError("Choose a password you haven't used before.", 400);
    }
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next), mustChangePassword: false, sessionVersion: { increment: 1 } } });
    // Stamp password age separately so a not-yet-migrated column can't fail the change.
    try { await prisma.user.update({ where: { id: user.id }, data: { passwordChangedAt: new Date() } }); } catch {}
    await recordAudit({ action: "PASSWORD_CHANGED", actorUserId: user.id, actorEmail: user.email, targetType: "User", targetId: user.id });
    return ok({ ok: true, message: "Password updated. Other devices have been signed out." });
  } catch (err) { return handleError(err); }
}
