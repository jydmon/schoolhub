import { prisma } from "@/lib/db";
import { verifyPassword, signSession, SESSION_TTL, SESSION_TTL_REMEMBER } from "@/lib/auth";
import { setSessionCookie } from "@/lib/session";
import { verifyTotp } from "@/lib/mfa";
import { loginSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { AUDIT } from "@/lib/constants";
import { rateLimit } from "@/lib/ratelimit";
import { recordLoginEvent } from "@/lib/user-admin";
import { getSecurityPolicy, passwordExpiry } from "@/lib/security-policy";
import { handleError, clientIp, ok } from "@/lib/http";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password, mfaToken } = loginSchema.parse(body);
    const remember = body?.remember === true;
    const ip = clientIp(req);

    const rl = rateLimit(`login:${email.toLowerCase()}`, 8, 5 * 60_000);
    if (!rl.ok) {
      await recordAudit({ action: AUDIT.RATE_LIMITED, actorEmail: email, ip, metadata: { endpoint: "login" } });
      return ok({ error: "Too many attempts. Please wait a few minutes and try again." }, 429);
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    const device = req.headers.get("user-agent");
    const fail = async (reason: string) => {
      await recordAudit({ action: AUDIT.USER_LOGIN_FAILED, actorEmail: email, ip, metadata: { reason } });
      await recordLoginEvent({ userId: user?.id ?? null, email, ip, device, result: reason === "suspended" || reason === "disabled" ? reason : "failed" });
      return ok({ error: reason === "suspended" ? "This account is suspended." : reason === "disabled" ? "This account has been disabled by your school." : "Invalid email or password" }, reason === "suspended" || reason === "disabled" ? 403 : 401);
    };

    if (!user || !user.passwordHash) return fail("no_account");
    if (user.status === "suspended") return fail("suspended");
    if (user.status === "disabled") return fail("disabled");
    if (!(await verifyPassword(password, user.passwordHash))) return fail("bad_password");

    // MFA gate for accounts that already have it enabled.
    if (user.mfaEnabled) {
      if (!mfaToken) {
        return ok({ mfaRequired: true });
      }
      if (!user.mfaSecret || !verifyTotp(mfaToken, user.mfaSecret)) {
        return fail("bad_mfa");
      }
    }

    const policy = await getSecurityPolicy();

    // Grandfather: stamp passwordChangedAt on first login after this ships so the
    // whole user base isn't marked "expired" at once.
    const stampPwChanged = (user as any).passwordChangedAt ? {} : { passwordChangedAt: new Date() };

    setSessionCookie(user, remember);
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), ...stampPwChanged },
    });
    await recordAudit({ action: AUDIT.USER_LOGIN, actorUserId: user.id, actorEmail: user.email, ip });
    await recordLoginEvent({ userId: user.id, email: user.email, ip, device, result: "success" });

    // Mandatory-MFA enrolment gate + password-expiry evaluation.
    const mfaEnrollmentRequired = policy.mfaRequired && !user.mfaEnabled;
    const exp = passwordExpiry((user as any).passwordChangedAt, policy);
    const mustChange = user.mustChangePassword || (exp.expired && !exp.canDefer);

    // Native clients store this token and send it as `Authorization: Bearer`.
    const token = signSession(
      { sub: user.id, email: user.email, isPlatformAdmin: user.isPlatformAdmin, ver: user.sessionVersion ?? 0 },
      remember ? SESSION_TTL_REMEMBER : SESSION_TTL,
    );

    return ok({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        isPlatformAdmin: user.isPlatformAdmin,
        emailVerified: user.emailVerified,
        mfaEnabled: user.mfaEnabled,
      },
      mfaEnrollmentRequired,
      passwordExpired: exp.expired,
      passwordCanDefer: exp.canDefer,
      passwordDaysLeft: exp.daysLeft,
      mustChangePassword: mustChange,
    });
  } catch (err) {
    return handleError(err);
  }
}
