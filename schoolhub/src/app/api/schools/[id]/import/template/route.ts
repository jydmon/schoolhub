import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { IMPORT_TEMPLATES, toCsv, templateFieldGuide } from "@/lib/csv";
import { sheetsToXls } from "@/lib/xls";
import { handleError } from "@/lib/http";

type Params = { params: { id: string } };

// Download a blank import template (header row + one example row) for the
// requested module. Gated on IMPORT_DATA so anyone who can run an import —
// including a teacher scoped to their own pupils — can fetch the template they
// need, rather than the full admin (MANAGE_USERS) permission.
//   default            → CSV (imports directly)
//   ?format=xlsx       → Excel workbook with a "Template" sheet (headers +
//                        example) and a "Field guide" sheet (definitions).
export async function GET(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.IMPORT_DATA, params.id);

    const sp = new URL(req.url).searchParams;
    const type = sp.get("type") || "";
    const tpl = IMPORT_TEMPLATES[type];
    if (!tpl) return new Response("Unknown import type", { status: 404 });

    const format = sp.get("format");
    if (format === "xlsx" || format === "xls" || format === "excel") {
      const xls = sheetsToXls([
        { name: "Template", title: `${type} — fill in below the header row`, headers: tpl.headers, rows: [tpl.example.map((v) => (typeof v === "boolean" ? String(v) : v))] },
        { name: "Field guide", headers: ["Field", "Required", "Example", "Guidance"], rows: templateFieldGuide(type).map((g) => [g.field, g.required, g.example, g.guidance]) },
      ]);
      return new Response(new Uint8Array(xls), {
        headers: {
          "Content-Type": "application/vnd.ms-excel",
          "Content-Disposition": `attachment; filename="${type}-import-template.xls"`,
        },
      });
    }

    const csv = toCsv(tpl.headers, [tpl.example]);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${type}-import-template.csv"`,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
