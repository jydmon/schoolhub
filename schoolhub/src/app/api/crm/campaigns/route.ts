import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { campaignCreateSchema } from "@/lib/validation";
import { createCampaign, resolveRecipients } from "@/lib/crm";
import { crmScope } from "../scope";
import { handleError, ok } from "@/lib/http";

export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const schoolId = crmScope(ctx, req);
    const campaigns = await prisma.campaign.findMany({ where: { schoolId }, orderBy: { createdAt: "desc" }, take: 200 });
    return ok({ campaigns });
  } catch (err) { return handleError(err); }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const schoolId = crmScope(ctx, req);
    const body = campaignCreateSchema.parse(await req.json());
    const { id } = await createCampaign({ ...body, schoolId, actorUserId: ctx.userId, actorEmail: ctx.email });
    // Preview the resolved audience size so the composer can show "N recipients".
    const recipients = await resolveRecipients(body.audience ?? {}, schoolId);
    return ok({ id, estimatedRecipients: recipients.length }, 201);
  } catch (err) { return handleError(err); }
}
