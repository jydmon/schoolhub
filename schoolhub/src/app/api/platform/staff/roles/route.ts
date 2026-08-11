import { requireAuth } from "@/lib/session";
import { assertStaffArea, listRoles, ensurePlatformRoles } from "@/lib/platform-staff";
import { handleError, ok } from "@/lib/http";

export async function GET() {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "team");
    await ensurePlatformRoles();
    return ok({ roles: await listRoles() });
  } catch (err) { return handleError(err); }
}
