import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { crmContactSchema } from "@/lib/validation";
import { captureContact, audienceCounts } from "@/lib/crm";
import { crmScope } from "../scope";
import { handleError, ok } from "@/lib/http";

// List CRM contacts (filtered by ?audience / ?status) and the audience counts.
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const schoolId = crmScope(ctx, req);
    const url = new URL(req.url);
    const audience = url.searchParams.get("audience") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const contacts = await prisma.crmContact.findMany({
      where: { schoolId, ...(audience ? { audience } : {}), ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return ok({ contacts, counts: await audienceCounts(schoolId) });
  } catch (err) { return handleError(err); }
}

// Manually add / import a contact.
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const schoolId = crmScope(ctx, req);
    const body = crmContactSchema.parse(await req.json());
    const res = await captureContact({ ...body, schoolId, source: "manual" });
    return ok(res, res.created ? 201 : 200);
  } catch (err) { return handleError(err); }
}
