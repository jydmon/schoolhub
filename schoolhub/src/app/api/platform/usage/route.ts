import { requireAuth } from "@/lib/session";
import { assertStaffArea } from "@/lib/platform-staff";
import { userAnalytics, roleAnalytics, systemUsage, schoolCensus } from "@/lib/usage";
import { recordDownload, brandedPdf, xlsMetaSheet } from "@/lib/download";
import { sheetsToXls, type Sheet } from "@/lib/xls";
import { handleError, ok } from "@/lib/http";

type Census = Awaited<ReturnType<typeof schoolCensus>>;

// The data sheets for a census export (Excel prepends a "Download info" sheet).
function censusSheets(c: Census, schoolName: string): Sheet[] {
  const summary: (string | number)[][] = [
    ["School", schoolName],
    ["Period (days)", c.days],
    ["Total users", c.totalUsers],
    ["Active users", c.activeUsers],
    ["Inactive users", c.inactiveUsers],
    ["Invited", c.invited],
    ["Suspended", c.suspended],
    ["Never logged in", c.neverLoggedIn],
    ["Logins", c.loginCount],
    ["Actions", c.actions],
    ["Feature events", c.usageVolume],
  ];
  return [
    { name: "Summary", title: `School analytics — ${schoolName}`, headers: ["Metric", "Value"], rows: summary },
    { name: "By role", headers: ["Role", "Members"], rows: Object.entries(c.byRole || {}).map(([r, n]) => [r, n as number]) },
    { name: "Top features", headers: ["Feature", "Events"], rows: (c.topFeatures || []).map((f) => [f.area, f.count]) },
    { name: "Recent logins", headers: ["Name", "Email", "Roles", "Status", "Last login"], rows: (c.lastLogins || []).map((u) => [u.name || "", u.email || "", u.roles || "", u.status || "", u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("en-GB") : "never"]) },
  ];
}

// Flatten a census into text paragraphs for the branded PDF template.
function censusParagraphs(c: Census, schoolName: string): string[] {
  const lines: string[] = [`School: ${schoolName}`, `Period: last ${c.days} days`, "", "Summary"];
  for (const [k, v] of [
    ["Total users", c.totalUsers], ["Active users", c.activeUsers], ["Inactive users", c.inactiveUsers],
    ["Invited", c.invited], ["Suspended", c.suspended], ["Never logged in", c.neverLoggedIn],
    ["Logins", c.loginCount], ["Actions", c.actions], ["Feature events", c.usageVolume],
  ] as [string, number][]) lines.push(`  ${k}: ${v}`);
  lines.push("", "Members by role");
  for (const [r, n] of Object.entries(c.byRole || {})) lines.push(`  ${r}: ${n}`);
  lines.push("", "Top features");
  for (const f of (c.topFeatures || []).slice(0, 15)) lines.push(`  ${f.area}: ${f.count}`);
  lines.push("", "Recent logins", "Name  |  Roles  |  Status  |  Last login");
  for (const u of (c.lastLogins || []).slice(0, 40)) lines.push(`${u.name || u.email || "—"}  |  ${u.roles || "—"}  |  ${u.status || "—"}  |  ${u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("en-GB") : "never"}`);
  return lines;
}

// Usage analytics for the super-admin. ?view=users|roles|system|census
// For view=census, ?format=xlsx|pdf streams a governed, branded export.
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const url = new URL(req.url);
    const view = url.searchParams.get("view") || "system";
    const area = view === "users" ? "analytics" : "usage";
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, area);
    const days = Number(url.searchParams.get("days") || "30");
    const schoolId = url.searchParams.get("school") || undefined;
    if (view === "users") {
      const role = url.searchParams.get("role") || undefined;
      return ok({ users: await userAnalytics({ role, schoolId, days, limit: 200 }) });
    }
    if (view === "roles") {
      return ok({ roles: await roleAnalytics(["Parent", "Teacher"], { schoolId, days }) });
    }
    if (view === "census") {
      if (!schoolId) return ok({ census: null });
      const census = await schoolCensus(schoolId, days);
      const format = url.searchParams.get("format");
      if (format === "xlsx" || format === "xls" || format === "excel" || format === "pdf") {
        const reportName = "School analytics (overview)";
        const dmeta = await recordDownload(ctx, { section: "Analytics", reportName, format: format === "pdf" ? "pdf" : "xls", schoolId });
        const schoolName = dmeta.schoolName || "School";
        const base = `school-analytics-${days}d`;
        if (format === "pdf") {
          return new Response(new Uint8Array(brandedPdf(dmeta, `${reportName} — ${schoolName}`, censusParagraphs(census, schoolName))), {
            headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${base}.pdf"` },
          });
        }
        return new Response(new Uint8Array(sheetsToXls([xlsMetaSheet(dmeta), ...censusSheets(census, schoolName)])), {
          headers: { "Content-Type": "application/vnd.ms-excel", "Content-Disposition": `attachment; filename="${base}.xls"` },
        });
      }
      return ok({ census });
    }
    return ok({ system: await systemUsage(days, schoolId) });
  } catch (err) { return handleError(err); }
}
