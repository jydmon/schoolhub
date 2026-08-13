import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { listRoles, createRole, saveRole, setEnabled, restoreDefault, deleteCustomRole, assignRole, unassignRole, usersWithRoles, PERMISSION_CATALOG, PAGE_CATALOG, CRUD_RESOURCES } from "@/lib/roles";
import { handleError, ok, AppError } from "@/lib/http";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);
    const [roles, users] = await Promise.all([listRoles(params.id), usersWithRoles(params.id)]);
    return ok({ roles, users, catalog: { permissions: PERMISSION_CATALOG, pages: PAGE_CATALOG, crud: CRUD_RESOURCES } });
  } catch (err) { return handleError(err); }
}

// POST: create a custom role (optionally cloning an existing one).
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);
    const b = await req.json().catch(() => ({}));
    return ok(await createRole(params.id, b, ctx.userId, b.cloneFrom), 201);
  } catch (err) { return handleError(err); }
}

// PATCH: op = save | enable | restore | delete | assign | unassign
export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);
    const b = await req.json().catch(() => ({}));
    switch (b.op) {
      case "save": return ok(await saveRole(params.id, String(b.key), b, ctx.userId));
      case "enable": return ok(await setEnabled(params.id, String(b.key), b.enabled !== false, ctx.userId));
      case "restore": return ok(await restoreDefault(params.id, String(b.key), ctx.userId));
      case "delete": return ok(await deleteCustomRole(params.id, String(b.key), ctx.userId));
      case "assign": return ok(await assignRole(params.id, String(b.userId), String(b.key), ctx.userId));
      case "unassign": return ok(await unassignRole(params.id, String(b.userId), String(b.key), ctx.userId));
      default: throw new AppError("Unknown operation", 400);
    }
  } catch (err) { return handleError(err); }
}
