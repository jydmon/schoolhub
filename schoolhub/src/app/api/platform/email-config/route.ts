import { requireAuth } from "@/lib/session";
import { assertStaffArea } from "@/lib/platform-staff";
import { emailConfigSchema } from "@/lib/validation";
import { getEmailConfig, setEmailConfig } from "@/lib/platform-ops";
import { handleError, ok } from "@/lib/http";

// Super-admin email configuration (send emails from the portal). Secret is
// encrypted at rest and never returned. Gated to the "comms" area.
export async function GET() {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "comms");
    return ok(await getEmailConfig());
  } catch (err) { return handleError(err); }
}
export async function PUT(req: Request) {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "comms");
    const body = emailConfigSchema.parse(await req.json());
    return ok(await setEmailConfig({ ...body, actorUserId: ctx.userId }));
  } catch (err) { return handleError(err); }
}
