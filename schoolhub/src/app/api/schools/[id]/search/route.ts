import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { searchSchool, groupsToCsv } from "@/lib/search";
import { recordDownload, csvWithMetadata } from "@/lib/download";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

// Portal-wide, tenant-scoped search across every record type a School
// Administrator works with. `?types=` limits sections; `?format=csv` downloads
// the flattened results. Each hit carries the `tab` it lives under.
export async function GET(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.VIEW_DASHBOARDS, params.id);
    const sp = new URL(req.url).searchParams;
    const q = (sp.get("q") || "").trim();
    const format = sp.get("format");
    const types = (sp.get("types") || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (q.length < 2) {
      if (format === "csv") return new Response("", { status: 400 });
      return ok({ groups: [], total: 0, q });
    }

    const groups = await searchSchool(params.id, q, types);
    const total = groups.reduce((n, g) => n + g.items.length, 0);

    if (format === "csv") {
      const meta = await recordDownload(ctx, { section: "Search", reportName: `Search results — ${q}`, format: "csv", schoolId: params.id });
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
