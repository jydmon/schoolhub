import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { templateSchema } from "@/lib/validation";
import { listTenantTemplates, createTemplate } from "@/lib/templates";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };
// Tenant admin: this school's templates + platform templates shared with tenants.
export async function GET(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_CRM, params.id);
    const kind = new URL(req.url).searchParams.get("kind") || undefined;
    return ok({ templates: await listTenantTemplates(params.id, kind) });
  } catch (err) { return handleError(err); }
}
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_CRM, params.id);
    const body = templateSchema.parse(await req.json());
    return ok(await createTemplate({ ...body, scope: "tenant", schoolId: params.id, actorUserId: ctx.userId }), 201);
  } catch (err) { return handleError(err); }
}
