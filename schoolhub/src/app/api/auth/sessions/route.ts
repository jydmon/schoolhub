import { prisma } from "@/lib/db";
import { requireAuth, setSessionCookie } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import { AUDIT } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";

// Sign out of all other sessions: bump sessionVersion (invalidates every existing
// token) and re-issue a fresh cookie for the current device.
export async function POST() {
  try {
    const ctx = await requireAuth();
    const user = await prisma.user.update({ where: { id: ctx.userId }, data: { sessionVersion: { increment: 1 } } });
    setSessionCookie(user);
    await recordAudit({ action: AUDIT.SESSIONS_REVOKED, actorUserId: ctx.userId, actorEmail: ctx.email });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
