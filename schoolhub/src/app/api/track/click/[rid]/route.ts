import { recordClick } from "@/lib/crm";

type Params = { params: { rid: string } };

const APP_URL = () => (process.env.APP_URL || "https://app.siplat.co").replace(/\/+$/, "");

// Public click tracker: records the click, then 302s to the original URL. Only
// http(s) targets are honoured (never javascript:/data:/relative) to avoid an
// open-redirect. Falls back to the app home if the target is missing/unsafe.
export async function GET(req: Request, { params }: Params) {
  try { await recordClick(params.rid); } catch { /* tracking must never block the redirect */ }
  const u = new URL(req.url).searchParams.get("u") || "";
  let target = APP_URL();
  try {
    const parsed = new URL(u);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") target = parsed.toString();
  } catch { /* keep fallback */ }
  return new Response(null, { status: 302, headers: { Location: target, "Cache-Control": "no-store" } });
}
