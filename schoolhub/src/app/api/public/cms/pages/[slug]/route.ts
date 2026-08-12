import { getPageBySlug } from "@/lib/cms-pages";

type Params = { params: { slug: string } };

// PUBLIC: a single published page's full content (no auth, CORS-open). The
// marketing site can fetch this and render it however it likes.
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=60",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const page = await getPageBySlug(params.slug, { publishedOnly: true });
    if (!page) return Response.json({ error: "Page not found" }, { status: 404, headers: CORS });
    return Response.json({
      page: {
        slug: page.slug, title: page.title, seoTitle: page.seoTitle, seoDescription: page.seoDescription,
        contentHtml: page.contentHtml, updatedAt: page.updatedAt,
      },
    }, { headers: CORS });
  } catch {
    return Response.json({ error: "Unable to load page" }, { status: 500, headers: CORS });
  }
}
