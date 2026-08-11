import { requireAuth } from "@/lib/session";
import { assertStaffArea, listRoles, ensurePlatformRoles, createPlatformRole, deletePlatformRole } from "@/lib/platform-staff";
import { handleError, ok } from "@/lib/http";

export async function GET() {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "team");
    await ensurePlatformRoles();
    return ok({ roles: await listRoles() });
  } catch (err) { return handleError(err); }
}

// Create (or update) a custom platform staff role.
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "team");
    const body = await req.json().catch(() => ({}));
    const role = await createPlatformRole({
      name: String(body?.name ?? ""),
      key: body?.key ? String(body.key) : undefined,
      areas: Array.isArray(body?.areas) ? body.areas.map(String) : [],
      actorUserId: ctx.userId,
    });
    return ok({ role }, 201);
  } catch (err) { return handleError(err); }
}

// Delete a custom role by ?key=...
export async function DELETE(req: Request) {
  try {
    const ctx = await requireAuth();
    await assertStaffArea(ctx.userId, ctx.isPlatformAdmin, "team");
    const key = new URL(req.url).searchParams.get("key");
    if (!key) return ok({ error: "key required" }, 400);
    await deletePlatformRole(key, { userId: ctx.userId });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
