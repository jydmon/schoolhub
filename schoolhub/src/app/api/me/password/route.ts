import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { handleError, ok, AppError } from "@/lib/http";

// Change your own password. Requires the current password. Bumps sessionVersion
// so other sessions are signed out. A security notification is logged.
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const b = await req.json().catch(() => ({}));
    const current = String(b.currentPassword || "");
    const next = String(b.newPassword || "");
    if (next.length < 8) throw new AppError("Your new password must be at least 8 characters.", 400);

    const user = await prisma.user.findUnique({ where: { id: ctx.userId } });
    if (!user) throw new AppError("Account not found", 404);
    if (user.passwordHash) {
      if (!current) throw new AppError("Enter your current password.", 400);
      const okPw = await verifyPassword(current, user.passwordHash);
      if (!okPw) throw new AppError("Your current password is incorrect.", 403);
    }
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next), mustChangePassword: false, sessionVersion: { increment: 1 } } });
    await recordAudit({ action: "PASSWORD_CHANGED", actorUserId: user.id, actorEmail: user.email, targetType: "User", targetId: user.id });
    return ok({ ok: true, message: "Password updated. Other devices have been signed out." });
  } catch (err) { return handleError(err); }
}
