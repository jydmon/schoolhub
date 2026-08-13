import { getAuthContext, clearImpersonationCookie } from "@/lib/session";
import { prisma } from "@/lib/db";
import { endSession } from "@/lib/support-access";
import { handleError, ok } from "@/lib/http";

// Reports whether the CURRENT session is an active support-access impersonation
// (powers the "you are in a support session" banner), and ends it.
export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!ctx || !ctx.impersonationRequestId) return ok({ impersonating: false });
    const req = await prisma.supportAccessRequest.findUnique({ where: { id: ctx.impersonationRequestId } });
    return ok({
      impersonating: true,
      requestId: ctx.impersonationRequestId,
      targetName: ctx.fullName, targetEmail: ctx.email,
      requesterName: req?.requesterName || null,
      endsAt: req?.expiresAt || null,
    });
  } catch (err) { return handleError(err); }
}

// End the current impersonation session (the admin clicking "End session").
export async function DELETE() {
  try {
    const ctx = await getAuthContext();
    if (ctx?.impersonationRequestId) await endSession(ctx.impersonationRequestId, ctx.impersonatorId || ctx.userId, "ended_by_admin");
    clearImpersonationCookie();
    return ok({ ended: true });
  } catch (err) { return handleError(err); }
}
