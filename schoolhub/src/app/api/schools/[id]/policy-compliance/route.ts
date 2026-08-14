import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { schoolPolicyCompliance, remindPolicyUsers, complianceCsv } from "@/lib/policy-compliance-school";
import { recordDownload, csvWithMetadata } from "@/lib/download";
import { recordAudit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

// School-administrator policy compliance monitoring: read/accept status across
// the school's users, with CSV export (GET) and reminders (POST).
export async function GET(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.VIEW_DASHBOARDS, params.id);
    const data = await schoolPolicyCompliance(params.id);
    if (new URL(req.url).searchParams.get("format") === "csv") {
      await recordAudit({ action: "POLICY_COMPLIANCE_EXPORT", schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "School", targetId: params.id });
      const meta = await recordDownload(ctx, { section: "Policy compliance", reportName: "Policy compliance", format: "csv", schoolId: params.id });
      return new Response(csvWithMetadata(meta, complianceCsv(data)), {
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="policy-compliance.csv"` },
      });
    }
    return ok(data);
  } catch (err) { return handleError(err); }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.VIEW_DASHBOARDS, params.id);
    const b = await req.json().catch(() => ({}));
    const userIds: string[] = Array.isArray(b.userIds) ? b.userIds.map(String) : [];
    if (!userIds.length) return ok({ error: "Select at least one user to remind." }, 400);
    const res = await remindPolicyUsers(params.id, userIds, b.documentId ? String(b.documentId) : undefined);
    await recordAudit({ action: "POLICY_REMINDER_SENT", schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "School", targetId: params.id, metadata: { count: res.reminded, documentId: b.documentId || null } });
    return ok(res);
  } catch (err) { return handleError(err); }
}
