import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { importSchema } from "@/lib/validation";
import { runImport } from "@/lib/import";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

// Import history for a school.
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);

    const batches = await prisma.importBatch.findMany({
      where: { schoolId: params.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { createdBy: { select: { email: true } } },
    });
    return ok({
      batches: batches.map((b) => ({
        id: b.id,
        type: b.type,
        filename: b.filename,
        status: b.status,
        totalRows: b.totalRows,
        createdRows: b.createdRows,
        updatedRows: b.updatedRows,
        skippedRows: b.skippedRows,
        errorRows: b.errorRows,
        createdBy: b.createdBy?.email ?? null,
        createdAt: b.createdAt,
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}

// Run a CSV import.
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.MANAGE_USERS, params.id);

    const { type, csvText, filename } = importSchema.parse(await req.json());
    const result = await runImport({
      schoolId: params.id,
      type,
      csvText,
      filename,
      actorUserId: ctx.userId,
      actorEmail: ctx.email,
    });
    return ok(result, 200);
  } catch (err) {
    return handleError(err);
  }
}
