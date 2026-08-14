import { requireAuth } from "@/lib/session";
import { searchTeacher, groupsToCsv } from "@/lib/search";
import { handleError, ok } from "@/lib/http";

// Teacher search — scoped strictly to the teacher's assigned classes, subjects,
// trips and the pupils within them. `?format=csv` downloads the flattened results.
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const sp = new URL(req.url).searchParams;
    const q = (sp.get("q") || "").trim();
    const school = sp.get("school") || undefined;
    const format = sp.get("format");
    if (q.length < 2) {
      if (format === "csv") return new Response("", { status: 400 });
      return ok({ groups: [], total: 0, q });
    }
    const groups = await searchTeacher(ctx.userId, q, school);
    const total = groups.reduce((n, g) => n + g.items.length, 0);
    if (format === "csv") {
      return new Response(groupsToCsv(groups, q), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="search-${q.replace(/[^a-z0-9]+/gi, "-").slice(0, 30)}.csv"`,
        },
      });
    }
    return ok({ groups, total, q });
  } catch (err) { return handleError(err); }
}
