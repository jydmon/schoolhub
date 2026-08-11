import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { generateMfaSecret, buildOtpAuthUrl, verifyTotp } from "@/lib/mfa";
import { enableMfaSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { AUDIT } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";

// Begin MFA enrollment: generate a secret and return the otpauth URL to scan.
// The secret is stored but MFA is not active until confirmed via PUT.
export async function POST() {
  try {
    const ctx = await requireAuth();
    const secret = generateMfaSecret();
    await prisma.user.update({ where: { id: ctx.userId }, data: { mfaSecret: secret } });
    return ok({
      secret,
      otpauthUrl: buildOtpAuthUrl(secret, ctx.email),
    });
  } catch (err) {
    return handleError(err);
  }
}

// Confirm enrollment by verifying a TOTP code, then activate MFA.
export async function PUT(req: Request) {
  try {
    const ctx = await requireAuth();
    const { token } = enableMfaSchema.parse(await req.json());
    const user = await prisma.user.findUnique({ where: { id: ctx.userId } });
    if (!user?.mfaSecret) return ok({ error: "Start MFA setup first" }, 400);
    if (!verifyTotp(token, user.mfaSecret)) return ok({ error: "Invalid code" }, 400);
    await prisma.user.update({ where: { id: ctx.userId }, data: { mfaEnabled: true } });
    await recordAudit({ action: AUDIT.MFA_ENABLED, actorUserId: ctx.userId, actorEmail: ctx.email });
    return ok({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

// Disable MFA.
export async function DELETE() {
  try {
    const ctx = await requireAuth();
    await prisma.user.update({
      where: { id: ctx.userId },
      data: { mfaEnabled: false, mfaSecret: null },
    });
    await recordAudit({ action: AUDIT.MFA_DISABLED, actorUserId: ctx.userId, actorEmail: ctx.email });
    return ok({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
