import { listPages } from "@/lib/cms-pages";
import { handleError, ok } from "@/lib/http";

// PUBLIC: published pages for the marketing site to consume (no auth). Returns
// lightweight nav/list data; fetch a single page's content via /[slug].
export async function GET() {
  try {
    const pages = await listPages({ publishedOnly: true });
    return ok({
      pages: pages.map((p) => ({
        slug: p.slug, title: p.title, navLabel: p.navLabel, showInNav: p.showInNav,
        navOrder: p.navOrder, seoTitle: p.seoTitle, seoDescription: p.seoDescription, updatedAt: p.updatedAt,
      })),
    });
  } catch (err) { return handleError(err); }
}
