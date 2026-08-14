import { requireAuth } from "@/lib/session";
import { trustDocumentsForUser } from "@/lib/trust";
import { textPdf } from "@/lib/pdf";
import { handleError } from "@/lib/http";

type Params = { params: { docId: string } };

// Download a policy the signed-in user can see, as a PDF. Scoped through
// trustDocumentsForUser so a user can only export documents surfaced to them.
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const docs = await trustDocumentsForUser(ctx.userId);
    const d = docs.find((x) => x.id === params.docId);
    if (!d) return new Response("Not found", { status: 404 });

    const plain = String(d.bodyHtml || "").replace(/<\s*(br|\/p|\/div|\/li)\s*>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
    const fmt = (v: any) => (v ? new Date(v).toLocaleDateString("en-GB") : "—");
    const meta = [
      `Category: ${d.category}`,
      `Version: ${d.version}`,
      `Published: ${fmt(d.publishedAt)}`,
      `Last updated: ${fmt(d.updatedAt)}`,
      d.effectiveDate ? `Effective: ${fmt(d.effectiveDate)}` : "",
      d.requireAck ? "Acknowledgement required" : "",
      "",
    ].filter(Boolean);
    const paragraphs = [...meta, d.summary ? `${d.summary}\n` : "", plain || "(No document text — see the source link.)", d.linkUrl ? `\nSource: ${d.linkUrl}` : ""].filter(Boolean);

    const pdf = textPdf(d.title, paragraphs);
    const safe = d.title.replace(/[^a-z0-9]+/gi, "-").slice(0, 40) || "policy";
    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safe}-v${d.version}.pdf"`,
      },
    });
  } catch (err) { return handleError(err); }
}
