import { prisma } from "./db";
import { recordAudit } from "./audit";
import { AUDIT } from "./constants";

// Marketing-website CMS pages. Platform-level (no schoolId). Public consumers
// read only published pages via /api/public/cms/* or the /site/<slug> render.

export function slugify(input: string): string {
  return (input || "").toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "page";
}

export async function listPages(opts: { publishedOnly?: boolean } = {}) {
  return prisma.cmsPage.findMany({
    where: opts.publishedOnly ? { status: "published" } : {},
    orderBy: [{ navOrder: "asc" }, { title: "asc" }],
  });
}

export async function getPageBySlug(slug: string, opts: { publishedOnly?: boolean } = {}) {
  const p = await prisma.cmsPage.findUnique({ where: { slug } });
  if (!p) return null;
  if (opts.publishedOnly && p.status !== "published") return null;
  return p;
}

export async function createPage(input: {
  title: string; slug?: string; status?: string; seoTitle?: string; seoDescription?: string;
  contentHtml?: string; navLabel?: string; showInNav?: boolean; navOrder?: number; actorUserId?: string | null;
}): Promise<{ id: string; slug: string }> {
  const title = (input.title || "").trim();
  if (title.length < 2) throw new Error("title is required");
  let slug = slugify(input.slug || title);
  // Ensure uniqueness by suffixing if needed.
  for (let i = 0; i < 50; i++) {
    const clash = await prisma.cmsPage.findUnique({ where: { slug } });
    if (!clash) break;
    slug = `${slugify(input.slug || title)}-${i + 2}`;
  }
  const page = await prisma.cmsPage.create({
    data: {
      slug, title,
      status: input.status === "published" ? "published" : "draft",
      seoTitle: input.seoTitle?.trim() || null,
      seoDescription: input.seoDescription?.trim() || null,
      contentHtml: input.contentHtml ?? "",
      navLabel: input.navLabel?.trim() || null,
      showInNav: input.showInNav ?? false,
      navOrder: Number.isFinite(input.navOrder) ? (input.navOrder as number) : 0,
      updatedById: input.actorUserId ?? null,
    },
  });
  await recordAudit({ action: AUDIT.CMS_PAGE_SAVED ?? "CMS_PAGE_SAVED", actorUserId: input.actorUserId, targetType: "CmsPage", targetId: page.id, metadata: { slug, status: page.status } });
  return { id: page.id, slug: page.slug };
}

export async function updatePage(id: string, patch: {
  title?: string; slug?: string; status?: string; seoTitle?: string; seoDescription?: string;
  contentHtml?: string; navLabel?: string; showInNav?: boolean; navOrder?: number;
}, actor?: { userId?: string | null }): Promise<void> {
  const data: any = {};
  if (patch.title !== undefined) data.title = patch.title.trim();
  if (patch.slug !== undefined) {
    let slug = slugify(patch.slug);
    const clash = await prisma.cmsPage.findFirst({ where: { slug, NOT: { id } } });
    if (clash) throw new Error("That slug is already in use");
    data.slug = slug;
  }
  if (patch.status !== undefined) data.status = patch.status === "published" ? "published" : "draft";
  if (patch.seoTitle !== undefined) data.seoTitle = patch.seoTitle.trim() || null;
  if (patch.seoDescription !== undefined) data.seoDescription = patch.seoDescription.trim() || null;
  if (patch.contentHtml !== undefined) data.contentHtml = patch.contentHtml;
  if (patch.navLabel !== undefined) data.navLabel = patch.navLabel.trim() || null;
  if (patch.showInNav !== undefined) data.showInNav = !!patch.showInNav;
  if (patch.navOrder !== undefined) data.navOrder = Number(patch.navOrder) || 0;
  const page = await prisma.cmsPage.update({ where: { id }, data });
  await recordAudit({ action: AUDIT.CMS_PAGE_SAVED ?? "CMS_PAGE_SAVED", actorUserId: actor?.userId, targetType: "CmsPage", targetId: id, metadata: { slug: page.slug, status: page.status, updated: Object.keys(data) } });
}

export async function setPageStatus(id: string, status: string, actor?: { userId?: string | null }): Promise<void> {
  const page = await prisma.cmsPage.update({ where: { id }, data: { status: status === "published" ? "published" : "draft" } });
  await recordAudit({ action: AUDIT.CMS_PAGE_SAVED ?? "CMS_PAGE_SAVED", actorUserId: actor?.userId, targetType: "CmsPage", targetId: id, metadata: { slug: page.slug, status: page.status } });
}

export async function deletePage(id: string, actor?: { userId?: string | null }): Promise<void> {
  const page = await prisma.cmsPage.delete({ where: { id } });
  await recordAudit({ action: AUDIT.CMS_PAGE_REMOVED ?? "CMS_PAGE_REMOVED", actorUserId: actor?.userId, targetType: "CmsPage", targetId: id, metadata: { slug: page.slug } });
}
