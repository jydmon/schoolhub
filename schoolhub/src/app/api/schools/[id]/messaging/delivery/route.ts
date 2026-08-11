import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, AUDIT } from "@/lib/constants";
import { buildDeliveryReport, deliveryReportToCsv } from "@/lib/messaging-report";
import { recordAudit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";
import { NextResponse } from "next/server";

type Params = { params: { id: string } };

// School-side per-channel delivery report (SMS / WhatsApp / push / email / in-app).
//   GET               → JSON report
//   GET ?format=csv   → CSV download
//   GET ?days=7       → window (default 30, capped at 365)
//   GET ?channel=sms  → restrict to a single channel
export async function GET(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.VIEW_DASHBOARDS, params.id);

    const url = new URL(req.url);
    const daysParam = url.searchParams.get("days");
    const days = daysParam ? parseInt(daysParam, 10) : undefined;
    const channel = url.searchParams.get("channel");
    const format = url.searchParams.get("format");

    const report = await buildDeliveryReport(params.id, {
      days: Number.isNaN(days as number) ? undefined : days,
      channel,
    });

    if (format === "csv") {
      await recordAudit({
        action: AUDIT.REPORT_RUN,
        schoolId: params.id,
        actorUserId: ctx.userId,
        actorEmail: ctx.email,
        metadata: { type: "messaging-delivery", format: "csv", days: report.window.days, channel: report.channelFilter },
      });
      return new NextResponse(deliveryReportToCsv(report), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="messaging-delivery-report.csv"`,
        },
      });
    }

    return ok({ report });
  } catch (err) {
    return handleError(err);
  }
}
