import { requireAuth, requirePlatformAdmin } from "@/lib/session";
import { getSecurityPolicy, setSecurityPolicy } from "@/lib/security-policy";
import { recordAudit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";

// Read the current security policy (any signed-in user may read it — e.g. to
// show "password expires in N days"). Only the Super Administrator may change it.
export async function GET() {
  try {
    await requireAuth();
    return ok(await getSecurityPolicy());
  } catch (err) { return handleError(err); }
}

export async function PUT(req: Request) {
  try {
    const ctx = await requirePlatformAdmin();
    const b = await req.json().catch(() => ({}));
    const patch: any = {};
    if (b.passwordExpiryDays != null) patch.passwordExpiryDays = Number(b.passwordExpiryDays);
    if (b.passwordGraceDays != null) patch.passwordGraceDays = Number(b.passwordGraceDays);
    if (typeof b.mfaRequired === "boolean") patch.mfaRequired = b.mfaRequired;
    const policy = await setSecurityPolicy(patch);
    await recordAudit({ action: "SECURITY_POLICY_UPDATED", actorUserId: ctx.userId, actorEmail: ctx.email, metadata: patch });
    return ok(policy);
  } catch (err) { return handleError(err); }
}
