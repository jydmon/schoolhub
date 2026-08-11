import { unsubscribeByToken } from "@/lib/crm";
import { handleError, ok } from "@/lib/http";

// Public one-click unsubscribe carried in every campaign email footer.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const email = url.searchParams.get("e") ?? "";
    const token = url.searchParams.get("t") ?? "";
    const done = await unsubscribeByToken(email, token);
    return ok({ ok: done, message: done ? "You've been unsubscribed." : "Invalid or expired link." }, done ? 200 : 400);
  } catch (err) {
    return handleError(err);
  }
}
export async function POST(req: Request) { return GET(req); }
