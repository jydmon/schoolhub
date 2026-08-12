import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

// Transport incident log with reporter, route/journey context and resolution.
export async function GET(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRANSPORT, params.id);
    const status = new URL(req.url).searchParams.get("status") || "";
    const incidents = await prisma.incident.findMany({
      where: { schoolId: params.id, ...(status ? { status } : {}) },
      orderBy: { at: "desc" }, take: 200,
    });
    const journeyIds = Array.from(new Set(incidents.map((i) => i.journeyId).filter(Boolean))) as string[];
    const reporterIds = Array.from(new Set(incidents.map((i) => i.reportedByUserId).filter(Boolean))) as string[];
    const [journeys, reporters] = await Promise.all([
      journeyIds.length ? prisma.journey.findMany({ where: { id: { in: journeyIds } }, include: { route: { select: { name: true } } } }) : [],
      reporterIds.length ? prisma.user.findMany({ where: { id: { in: reporterIds } }, select: { id: true, fullName: true } }) : [],
    ]);
    const jMap = new Map(journeys.map((j) => [j.id, j]));
    const uMap = new Map(reporters.map((u) => [u.id, u.fullName]));
    return ok({
      incidents: incidents.map((i) => ({
        id: i.id, type: i.type, notes: i.notes, severity: i.severity, status: i.status, at: i.at,
        resolvedAt: i.resolvedAt, resolutionNote: i.resolutionNote,
        routeName: i.journeyId ? (jMap.get(i.journeyId)?.route?.name || null) : null,
        session: i.journeyId ? (jMap.get(i.journeyId)?.session || null) : null,
        reportedBy: i.reportedByUserId ? (uMap.get(i.reportedByUserId) || "Driver") : null,
      })),
      counts: {
        open: incidents.filter((i) => i.status === "open").length,
        acknowledged: incidents.filter((i) => i.status === "acknowledged").length,
        resolved: incidents.filter((i) => i.status === "resolved").length,
      },
    });
  } catch (err) { return handleError(err); }
}

// Acknowledge / resolve / reopen an incident, or set its severity.
export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_TRANSPORT, params.id);
    const b = await req.json().catch(() => ({}));
    if (!b.id) return ok({ error: "id required" }, 400);
    const inc = await prisma.incident.findFirst({ where: { id: String(b.id), schoolId: params.id } });
    if (!inc) return ok({ error: "Incident not found" }, 404);
    const data: any = {};
    if (b.severity) data.severity = b.severity;
    if (b.status) {
      data.status = b.status;
      if (b.status === "resolved") { data.resolvedAt = new Date(); data.resolvedByUserId = ctx.userId; data.resolutionNote = b.resolutionNote ?? inc.resolutionNote; }
      else if (b.status === "open") { data.resolvedAt = null; data.resolvedByUserId = null; }
    }
    const updated = await prisma.incident.update({ where: { id: inc.id }, data });
    return ok({ incident: updated });
  } catch (err) { return handleError(err); }
}
