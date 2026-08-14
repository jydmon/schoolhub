import { requireAuth } from "@/lib/session";
import { assertStaffArea } from "@/lib/platform-staff";
import { policyCompliance } from "@/lib/policy-compliance";
import { recordDownload, csvWithMetadata } from "@/lib/download";
import { handleError, ok } from "@/lib/http";
import { NextResponse } from "next/server";

// Super-admin policy compliance dashboard data, or a CSV of outstanding
// acknowledgements (?format=csv). Gated to the content area.
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "policies");
    const data = await policyCompliance();

    if (new URL(req.url).searchParams.get("format") === "csv") {
      const q = (v: any) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const lines = ["Name,Email,Role,School,Policy,Version", ...data.outstanding.map((r) => [r.name, r.email, r.role, r.school, r.policy, r.version].map(q).join(","))];
      const meta = await recordDownload(ctx, { section: "Policies", reportName: "Outstanding policy acknowledgements", format: "csv" });
      return new NextResponse(csvWithMetadata(meta, lines.join("\r\n")), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="policy-compliance-outstanding.csv"` } });
    }
    return ok(data);
  } catch (err) { return handleError(err); }
}
