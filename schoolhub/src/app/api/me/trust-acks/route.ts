import { requireAuth } from "@/lib/session";
import { trustDocumentsForUser, acknowledgeTrustDocument } from "@/lib/trust";
import { handleError, ok } from "@/lib/http";

// Documents surfaced to the signed-in user (parents/staff), with ack state,
// and the endpoint to acknowledge one.
export async function GET() {
  try {
    const ctx = await requireAuth();
    const items = await trustDocumentsForUser(ctx.userId);
    return ok({ items, outstanding: items.filter((d) => d.requireAck && !d.acknowledged).length });
  } catch (err) { return handleError(err); }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const b = await req.json().catch(() => ({}));
    if (!b.documentId) return ok({ error: "documentId required" }, 400);
    return ok(await acknowledgeTrustDocument(ctx.userId, String(b.documentId)));
  } catch (err) { return handleError(err); }
}
