import { requirePlatformAdmin } from "@/lib/session";
import { trustReport } from "@/lib/reports";
import { handleError, ok } from "@/lib/http";

// Trust-level (academy-trust / school-group) roll-up across all member schools.
export async function GET(_req: Request, { params }: { params: { groupId: string } }) {
  try {
    await requirePlatformAdmin();
    const report = await trustReport(params.groupId);
    return ok({ report });
  } catch (err) { return handleError(err); }
}
