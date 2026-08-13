import { requirePlatformAdmin, setImpersonationCookie, clearImpersonationCookie } from "@/lib/session";
import { startSession, endSession } from "@/lib/support-access";
import { handleError, ok, AppError } from "@/lib/http";

type Params = { params: { id: string } };

// Start or stop a support-access session. Must be the requesting admin, and NOT
// currently impersonating (requirePlatformAdmin resolves the admin's own session).
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requirePlatformAdmin();
    const action = String((await req.json().catch(() => ({}))).action || "");
    if (action === "start") {
      const { token, ttl, request } = await startSession(ctx, params.id);
      setImpersonationCookie(token, ttl);
      return ok({ started: true, request });
    }
    if (action === "stop") {
      await endSession(params.id, ctx.userId, "ended_by_admin");
      clearImpersonationCookie();
      return ok({ stopped: true });
    }
    throw new AppError("Unknown action", 400);
  } catch (err) { return handleError(err); }
}
