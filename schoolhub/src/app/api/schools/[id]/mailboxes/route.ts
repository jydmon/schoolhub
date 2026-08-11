import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { mailboxSchema } from "@/lib/validation";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

// List connected shared mailboxes.
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_KNOWLEDGE, params.id);
    const mailboxes = await prisma.sharedMailbox.findMany({ where: { schoolId: params.id }, orderBy: { createdAt: "asc" } });
    return ok({ mailboxes });
  } catch (err) {
    return handleError(err);
  }
}

// Connect an approved shared mailbox.
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_KNOWLEDGE, params.id);
    const input = mailboxSchema.parse(await req.json());
    const mailbox = await prisma.sharedMailbox.create({ data: { schoolId: params.id, address: input.address.toLowerCase(), label: input.label || null } });
    return ok({ mailbox }, 201);
  } catch (err) {
    return handleError(err);
  }
}
