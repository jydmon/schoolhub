import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { listMenuItems, createMenuItem, setMenuItemActive, updateMenuItem, deleteMenuItem } from "@/lib/menus";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    return ok({ items: await listMenuItems(params.id) });
  } catch (err) { return handleError(err); }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_CONTENT, params.id);
    const b = await req.json().catch(() => ({}));
    const res = await createMenuItem({
      schoolId: params.id,
      day: b.day, weekOf: b.weekOf, yearGroup: b.yearGroup, className: b.className,
      meal: b.meal, course: b.course, name: String(b.name ?? ""),
      description: b.description, allergens: b.allergens,
      vegetarian: b.vegetarian === true, vegan: b.vegan === true,
      price: typeof b.price === "number" ? b.price : (b.price ? Math.round(parseFloat(String(b.price).replace(/[£,\s]/g, "")) * 100) : 0),
      active: b.active !== false, actorUserId: ctx.userId,
    });
    return ok(res, 201);
  } catch (err) { return handleError(err); }
}

// PATCH: with only {id, active} toggles visibility; otherwise edits the item.
export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_CONTENT, params.id);
    const b = await req.json().catch(() => ({}));
    if (!b.id) return ok({ error: "id required" }, 400);
    const keys = Object.keys(b).filter((k) => k !== "id");
    if (keys.length === 1 && keys[0] === "active") await setMenuItemActive(params.id, String(b.id), b.active !== false);
    else await updateMenuItem(params.id, String(b.id), b);
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_CONTENT, params.id);
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return ok({ error: "id required" }, 400);
    await deleteMenuItem(params.id, id);
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
