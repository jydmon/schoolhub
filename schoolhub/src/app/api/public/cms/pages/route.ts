import { listPages } from "@/lib/cms-pages";

// PUBLIC: published pages for the marketing site to consume (no auth, CORS-open
// so a static site on another origin can fetch it). Returns lightweight nav/list
// data; fetch a single page's content via /[slug].
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=60",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET() {
  try {
    const pages = await listPages({ publishedOnly: true });
    const body = {
      pages: pages.map((p) => ({
        slug: p.slug, title: p.title, navLabel: p.navLabel, showInNav: p.showInNav,
        navOrder: p.navOrder, seoTitle: p.seoTitle, seoDescription: p.seoDescription, updatedAt: p.updatedAt,
      })),
    };
    return Response.json(body, { headers: CORS });
  } catch {
    return Response.json({ error: "Unable to load pages" }, { status: 500, headers: CORS });
  }
}
