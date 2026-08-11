import { getAuthContext, clearSessionCookie } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import { AUDIT } from "@/lib/constants";
import { handleError, clientIp, ok } from "@/lib/http";

export async function POST(req: Request) {
  try {
    const ctx = await getAuthContext();
    clearSessionCookie();
    if (ctx) {
      await recordAudit({
        action: AUDIT.USER_LOGOUT,
        actorUserId: ctx.userId,
        actorEmail: ctx.email,
        ip: clientIp(req),
      });
    }
    return ok({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
