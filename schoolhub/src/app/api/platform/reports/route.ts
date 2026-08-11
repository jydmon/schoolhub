import { requireAuth } from "@/lib/session";
import { assertStaffArea } from "@/lib/platform-staff";
import { reportRunSchema } from "@/lib/validation";
import { generateReport, listReports } from "@/lib/platform-ops";
import { handleError, ok } from "@/lib/http";

// Super-admin report generator (usage, subscription, engagement, event tracking…).
export async function GET() {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "analytics");
    return ok({ reports: await listReports(null) });
  } catch (err) { return handleError(err); }
}
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "analytics");
    const body = reportRunSchema.parse(await req.json());
    return ok(await generateReport({ ...body, actorUserId: ctx.userId }), 201);
  } catch (err) { return handleError(err); }
}
