import { requirePlatformAdmin } from "@/lib/session";
import { allAcknowledgements } from "@/lib/trust";
import { handleError, ok } from "@/lib/http";

// Super-Admin oversight: all policy/document acceptance records across the
// platform (item A6). Optional ?documentId= and ?q= filters.
export async function GET(req: Request) {
  try {
    await requirePlatformAdmin();
    const sp = new URL(req.url).searchParams;
    return ok({ acks: await allAcknowledgements({ documentId: sp.get("documentId") || undefined, q: sp.get("q") || undefined }) });
  } catch (err) { return handleError(err); }
}
