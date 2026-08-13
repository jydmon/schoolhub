import { publicTrustDocuments, publicTrustDocument } from "@/lib/trust";
import { handleError, ok } from "@/lib/http";

// Public Trust Centre feed — published + publicTrust documents only. No auth.
export async function GET(req: Request) {
  try {
    const slug = new URL(req.url).searchParams.get("slug");
    if (slug) {
      const doc = await publicTrustDocument(slug);
      if (!doc) return ok({ error: "Not found" }, 404);
      return ok({ document: doc });
    }
    return ok({ documents: await publicTrustDocuments() });
  } catch (err) { return handleError(err); }
}
