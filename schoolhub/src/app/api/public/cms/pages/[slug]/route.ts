import { getPageBySlug } from "@/lib/cms-pages";
import { handleError, ok, AppError } from "@/lib/http";

type Params = { params: { slug: string } };

// PUBLIC: a single published page's full content (no auth). The marketing site
// can fetch this and render it however it likes.
export async function GET(_req: Request, { params }: Params) {
  try {
    const page = await getPageBySlug(params.slug, { publishedOnly: true });
    if (!page) throw new AppError("Page not found", 404);
    return ok({
      page: {
        slug: page.slug, title: page.title, seoTitle: page.seoTitle, seoDescription: page.seoDescription,
        contentHtml: page.contentHtml, updatedAt: page.updatedAt,
      },
    });
  } catch (err) { return handleError(err); }
}
