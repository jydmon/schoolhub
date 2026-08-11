import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertStaffArea, upsertStaff, setStaffStatus } from "@/lib/platform-staff";
import { platformStaffPatchSchema } from "@/lib/validation";
import { handleError, ok, AppError } from "@/lib/http";

type Params = { params: { id: string } };
export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "team");
    const staff = await prisma.platformStaff.findUnique({ where: { id: params.id } });
    if (!staff) throw new AppError("Staff not found", 404);
    const body = platformStaffPatchSchema.parse(await req.json());
    if (body.status && !body.roleKey) { await setStaffStatus(params.id, body.status, { userId: ctx.userId }); }
    else { await upsertStaff({ userId: staff.userId, email: staff.email, name: staff.name ?? undefined, roleKey: body.roleKey ?? staff.roleKey, status: body.status ?? staff.status, actorUserId: ctx.userId }); }
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
