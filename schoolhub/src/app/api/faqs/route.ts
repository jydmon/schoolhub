import { requireAuth } from "@/lib/session";
import { listPublished } from "@/lib/faqs";
import { handleError, ok } from "@/lib/http";

// FAQs shown to every signed-in user in Help & Support.
export async function GET() {
  try {
    const ctx = await requireAuth();
    return ok({ items: await listPublished(), canManage: ctx.isPlatformAdmin });
  } catch (err) { return handleError(err); }
}
