import { requireAuth } from "@/lib/session";
import { assertStaffArea } from "@/lib/platform-staff";
import { aiConfigSchema } from "@/lib/validation";
import { getAiConfig, setAiConfig, PROVIDERS } from "@/lib/ai/provider";
import { handleError, ok } from "@/lib/http";

// Super-admin AI provider configuration for the assistant. The secret (API key)
// is encrypted at rest and never returned. Gated to the "comms" area.
export async function GET() {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "comms");
    return ok({ config: await getAiConfig(), providers: PROVIDERS.map(({ key, label, defaultModel, free, hint, baseUrl }) => ({ key, label, defaultModel, free: !!free, hint, baseUrl: baseUrl || "" })) });
  } catch (err) { return handleError(err); }
}

export async function PUT(req: Request) {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "comms");
    const body = aiConfigSchema.parse(await req.json());
    return ok(await setAiConfig({ ...body, actorUserId: ctx.userId }));
  } catch (err) { return handleError(err); }
}
