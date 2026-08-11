import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { IMPORT_TEMPLATES, toCsv } from "@/lib/csv";
import { handleError } from "@/lib/http";
import { NextResponse } from "next/server";

type Params = { params: { id: string } };

// Download a CSV template (headers + one example row) for a given import type.
export async function GET(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);

    const type = new URL(req.url).searchParams.get("type") || "students";
    const tpl = IMPORT_TEMPLATES[type];
    if (!tpl) return NextResponse.json({ error: "Unknown template type" }, { status: 400 });

    const csv = toCsv(tpl.headers, [tpl.example]);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="schoolhub-${type}-template.csv"`,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
