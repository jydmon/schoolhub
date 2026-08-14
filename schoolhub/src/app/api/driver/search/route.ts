import { requireAuth } from "@/lib/session";
import { searchDriver, groupsToCsv } from "@/lib/search";
import { recordDownload, csvWithMetadata } from "@/lib/download";
import { handleError, ok } from "@/lib/http";

// Driver / transport search — scoped to the routes the driver is assigned to and
// the pupils travelling on them. `?format=csv` downloads the flattened results.
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const sp = new URL(req.url).searchParams;
    const q = (sp.get("q") || "").trim();
    const format = sp.get("format");
    if (q.length < 2) {
      if (format === "csv") return new Response("", { status: 400 });
      return ok({ groups: [], total: 0, q });
    }
    const groups = await searchDriver(ctx.userId, q);
    const total = groups.reduce((n, g) => n + g.items.length, 0);
    if (format === "csv") {
      const meta = await recordDownload(ctx, { section: "Search", reportName: `Search results — ${q}`, format: "csv" });
      return new Response(csvWithMetadata(meta, groupsToCsv(groups, q)), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="search-${q.replace(/[^a-z0-9]+/gi, "-").slice(0, 30)}.csv"`,
        },
      });
    }
    return ok({ groups, total, q });
  } catch (err) { return handleError(err); }
}
