import { notFound } from "next/navigation";
import { getPageBySlug } from "@/lib/cms-pages";

type Props = { params: { slug: string } };

// PUBLIC rendered CMS page at /site/<slug>. Only published pages render; drafts
// 404. This is the "connect later" surface — the marketing site can link here,
// or consume /api/public/cms/* and render in its own shell.
export async function generateMetadata({ params }: Props) {
  const page = await getPageBySlug(params.slug, { publishedOnly: true });
  if (!page) return { title: "Not found" };
  return { title: page.seoTitle || page.title, description: page.seoDescription || undefined };
}

export default async function CmsSitePage({ params }: Props) {
  const page = await getPageBySlug(params.slug, { publishedOnly: true });
  if (!page) notFound();
  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: "48px 20px", fontFamily: "Inter, system-ui, sans-serif", lineHeight: 1.65, color: "#1e293b" }}>
      <h1 style={{ fontSize: 32, marginBottom: 20 }}>{page.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: page.contentHtml || "" }} />
    </main>
  );
}
