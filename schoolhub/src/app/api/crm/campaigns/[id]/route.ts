import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { rollup } from "@/lib/crm-logic";
import { campaignUpdateSchema } from "@/lib/validation";
import { crmScope } from "../../scope";
import { handleError, ok } from "@/lib/http";
import { AppError } from "@/lib/http";

type Params = { params: { id: string } };

export async function GET(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const schoolId = crmScope(ctx, req);
    const campaign = await prisma.campaign.findUnique({ where: { id: params.id } });
    if (!campaign || campaign.schoolId !== schoolId) throw new AppError("Campaign not found", 404);
    const recipients = await prisma.campaignRecipient.findMany({ where: { campaignId: params.id }, take: 1000 });
    return ok({ campaign, stats: rollup(recipients), recipients: recipients.slice(0, 200) });
  } catch (err) { return handleError(err); }
}

// Edit a DRAFT campaign (name / subject / body / audience) from the CRM
// "View / edit" action. Only drafts are editable; sent/scheduled/cancelled
// campaigns are read-only.
export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const schoolId = crmScope(ctx, req);
    const campaign = await prisma.campaign.findUnique({ where: { id: params.id } });
    if (!campaign || campaign.schoolId !== schoolId) throw new AppError("Campaign not found", 404);
    if (campaign.status !== "draft") throw new AppError("Only draft campaigns can be edited", 400);
    const input = campaignUpdateSchema.parse(await req.json());
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.subject !== undefined) data.subject = input.subject;
    if (input.body !== undefined) data.body = input.body;
    if (input.audience !== undefined) data.audienceJson = JSON.stringify(input.audience);
    const updated = await prisma.campaign.update({ where: { id: params.id }, data });
    return ok({ campaign: updated });
  } catch (err) { return handleError(err); }
}
