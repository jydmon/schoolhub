import { requireAuth } from "@/lib/session";
import { assertStaffArea, listStaff, upsertStaff } from "@/lib/platform-staff";
import { platformStaffSchema } from "@/lib/validation";
import { handleError, ok } from "@/lib/http";

// SIPlat staff & access management — restricted to the "team" area (owner-only
// by default). Manages which super-admin areas each staff member can open.
export async function GET(_req: Request) {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "team");
    return ok({ staff: await listStaff() });
  } catch (err) { return handleError(err); }
}
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "team");
    const body = platformStaffSchema.parse(await req.json());
    return ok(await upsertStaff({ ...body, actorUserId: ctx.userId }), 201);
  } catch (err) { return handleError(err); }
}
