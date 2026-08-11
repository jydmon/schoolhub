import { requireAuth, requirePlatformAdmin } from "@/lib/session";
import { seedDefaultContent } from "@/lib/defaults";
import { handleError, ok } from "@/lib/http";

// Load (or top up) the starter content — subscription packages, platform
// policies, help videos and message templates. Idempotent. Platform admin only.
export async function POST() {
  try {
    const ctx = await requireAuth();
    if (!ctx.isPlatformAdmin) await requirePlatformAdmin();
    const result = await seedDefaultContent(ctx.userId);
    return ok({ ok: true, ...result });
  } catch (err) {
    return handleError(err);
  }
}
