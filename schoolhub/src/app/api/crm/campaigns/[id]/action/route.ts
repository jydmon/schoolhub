import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { campaignActionSchema2 } from "@/lib/validation";
import { sendCampaign, cancelCampaign, sendTest, duplicateCampaign } from "@/lib/crm";
import { crmScope } from "../../../scope";
import { handleError, ok, AppError } from "@/lib/http";

type Params = { params: { id: string } };

export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const schoolId = crmScope(ctx, req);
    const campaign = await prisma.campaign.findUnique({ where: { id: params.id } });
    if (!campaign || campaign.schoolId !== schoolId) throw new AppError("Campaign not found", 404);

    const body = campaignActionSchema2.parse(await req.json());
    const actor = { userId: ctx.userId, email: ctx.email };

    if (body.action === "duplicate") {
      return ok(await duplicateCampaign(params.id, actor), 201);
    }
    if (body.action === "send") {
      return ok(await sendCampaign(params.id, actor));
    }
    if (body.action === "schedule") {
      if (!body.scheduledFor) throw new AppError("scheduledFor required", 400);
      await prisma.campaign.update({ where: { id: params.id }, data: { status: "scheduled", scheduledFor: new Date(body.scheduledFor) } });
      return ok({ ok: true, status: "scheduled" });
    }
    if (body.action === "cancel") {
      await cancelCampaign(params.id, actor);
      return ok({ ok: true, status: "cancelled" });
    }
    if (body.action === "test") {
      if (!body.testEmail) throw new AppError("testEmail required", 400);
      await sendTest(params.id, body.testEmail);
      return ok({ ok: true, sentTestTo: body.testEmail });
    }
    throw new AppError("Unknown action", 400);
  } catch (err) { return handleError(err); }
}
