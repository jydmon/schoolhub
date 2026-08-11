import { requireAuth } from "@/lib/session";
import { audienceCounts, syncUsersToContacts } from "@/lib/crm";
import { AUDIENCE_LABELS } from "@/lib/crm-logic";
import { crmScope } from "../scope";
import { handleError, ok } from "@/lib/http";

// Audience overview for the CRM dashboard.
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const schoolId = crmScope(ctx, req);
    return ok({ labels: AUDIENCE_LABELS, counts: await audienceCounts(schoolId) });
  } catch (err) { return handleError(err); }
}

// Sync platform users (parents/drivers/tenant admins…) into CRM contacts so
// campaigns can reach them. Body: { roles: string[] }.
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const schoolId = crmScope(ctx, req);
    const { roles } = await req.json();
    const n = await syncUsersToContacts(Array.isArray(roles) ? roles : [], schoolId);
    return ok({ synced: n });
  } catch (err) { return handleError(err); }
}
