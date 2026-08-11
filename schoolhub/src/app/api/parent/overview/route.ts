import { requireAuth } from "@/lib/session";
import { getOverview, RangeKey } from "@/lib/parent";
import { handleError, ok } from "@/lib/http";

const RANGES: RangeKey[] = ["today", "tomorrow", "week", "month"];

// Parent daily/weekly/monthly dashboard across all their children and schools.
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const r = new URL(req.url).searchParams.get("range") as RangeKey;
    const range = RANGES.includes(r) ? r : "today";
    const data = await getOverview(ctx.userId, range, new Date());
    return ok(data);
  } catch (err) {
    return handleError(err);
  }
}
