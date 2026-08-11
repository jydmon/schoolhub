import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertHubAccess } from "@/lib/integration/hub";
import { DEFAULT_OWNERSHIP } from "@/lib/integration/source-of-truth";
import { recordAudit } from "@/lib/audit";
import { AUDIT } from "@/lib/constants";
import { handleError, ok, AppError } from "@/lib/http";
import { z } from "zod";

type Params = { params: { id: string } };

// The data objects the Hub can map/synchronise (spec §7), shown with their owner.
const DATA_OBJECTS = [
  "School", "Campus", "Student", "Parent", "Guardian", "Parent-student relationship",
  "Staff", "Teacher", "Class", "Year group", "House", "Timetable", "Attendance",
  "Calendar event", "Activity", "Club", "Homework summary", "Behaviour record",
  "Reward record", "Detention", "Transport eligibility", "Transport route", "Vehicle",
  "Driver", "Student transport assignment", "Trip", "Consent status", "Payment status",
  "Document", "Newsletter", "Email communication", "GPS location", "Journey status",
];

// GET → ownership model (domain defaults + any school overrides).
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertHubAccess(ctx, params.id);
    const overrides = await prisma.sourceOfTruth.findMany({ where: { schoolId: params.id } });
    const ownership = Object.entries(DEFAULT_OWNERSHIP).map(([domain, owner]) => {
      const o = overrides.find((x) => x.domain === domain);
      return { domain, owner: o?.sourceLabel ?? owner, writeBack: o?.writeBack ?? false, overridden: !!o };
    });
    return ok({ ownership, dataObjects: DATA_OBJECTS });
  } catch (err) { return handleError(err); }
}

const approveSchema = z.object({ integrationId: z.string().min(1), approved: z.boolean().optional(), autoMerge: z.boolean().optional() });

// PATCH → approve a connector's configuration and/or set auto-merge (gates that
// source-of-truth enforcement checks before any write-back or auto-merge).
export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertHubAccess(ctx, params.id);
    const i = approveSchema.parse(await req.json());
    const integration = await prisma.integration.findFirst({ where: { id: i.integrationId, schoolId: params.id } });
    if (!integration) throw new AppError("Integration not found", 404);
    await prisma.integration.update({ where: { id: integration.id }, data: { ...(i.approved != null ? { approved: i.approved } : {}), ...(i.autoMerge != null ? { autoMerge: i.autoMerge } : {}) } });
    await recordAudit({ action: AUDIT.HUB_SOURCE_APPROVED, schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "Integration", targetId: integration.id, metadata: { approved: i.approved, autoMerge: i.autoMerge } });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
