import { getAuthContext } from "@/lib/session";
import { handleError, ok } from "@/lib/http";

export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return ok({ authenticated: false }, 200);
    return ok({ authenticated: true, ...ctx });
  } catch (err) {
    return handleError(err);
  }
}
