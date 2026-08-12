import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertStaffArea } from "@/lib/platform-staff";
import { llmComplete, aiStatus } from "@/lib/ai/provider";
import { handleError, ok, AppError } from "@/lib/http";

// Verify the configured LLM provider with a tiny live completion. On success the
// config is marked verified. The key itself is never exposed. Gated to "comms".
export async function POST() {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "comms");

    const status = await aiStatus();
    if (!status.configured) throw new AppError("No AI provider is configured. Choose a provider and save an API key first.", 400);

    const reply = await llmComplete(
      "You are a connectivity test. Reply with exactly the word: OK.",
      "Reply with OK.",
      { temperature: 0, maxTokens: 5 },
    );
    if (!reply) throw new AppError("The provider did not respond — check the API key, model name and that the account is active.", 502);

    await prisma.aiConfig.update({ where: { id: "singleton" }, data: { verified: true } }).catch(() => {});
    return ok({ ok: true, provider: status.provider, model: status.model, reply: reply.trim().slice(0, 40) });
  } catch (err) { return handleError(err); }
}
