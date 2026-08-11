import { recordOpen } from "@/lib/crm";

type Params = { params: { rid: string } };

// 1×1 transparent GIF (public email-open beacon). Never throws to the client.
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

export async function GET(_req: Request, { params }: Params) {
  try { await recordOpen(params.rid); } catch { /* tracking must never break rendering */ }
  return new Response(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(PIXEL.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "Pragma": "no-cache",
    },
  });
}
