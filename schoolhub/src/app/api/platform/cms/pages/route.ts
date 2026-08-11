import { requireAuth } from "@/lib/session";
import { assertStaffArea } from "@/lib/platform-staff";
import { listPages, createPage } from "@/lib/cms-pages";
import { handleError, ok } from "@/lib/http";

// Admin: list / create website CMS pages (gated to the "cms" area).
export async function GET() {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "cms");
    return ok({ pages: await listPages() });
  } catch (err) { return handleError(err); }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "cms");
    const b = await req.json().catch(() => ({}));
    const res = await createPage({
      title: String(b.title ?? ""), slug: b.slug, status: b.status,
      seoTitle: b.seoTitle, seoDescription: b.seoDescription, contentHtml: b.contentHtml,
      navLabel: b.navLabel, showInNav: b.showInNav, navOrder: b.navOrder, actorUserId: ctx.userId,
    });
    return ok(res, 201);
  } catch (err) { return handleError(err); }
}
