import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { rollup } from "@/lib/crm-logic";
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
