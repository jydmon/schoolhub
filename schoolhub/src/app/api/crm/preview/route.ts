import { requireAuth } from "@/lib/session";
import { previewSchema } from "@/lib/validation";
import { renderPreview } from "@/lib/templates";
import { crmScope } from "../scope";
import { handleError, ok } from "@/lib/http";

// Render a subject/body with merge tags for the composer preview panel.
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    crmScope(ctx, req); // authorises CRM access (platform or ?school=)
    const body = previewSchema.parse(await req.json());
    return ok(renderPreview({ subject: body.subject, body: body.body }, body.vars));
  } catch (err) { return handleError(err); }
}
