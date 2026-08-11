import { setSessionCookie } from "@/lib/session";
import { acceptInvitation } from "@/lib/invitations";
import { recordLoginEvent } from "@/lib/user-admin";
import { inviteAcceptSchema } from "@/lib/validation";
import { handleError, ok, clientIp } from "@/lib/http";

// Public onboarding endpoint. Accepts an invitation (token + code), sets the
// password, records Terms acceptance (enforced by the schema's acceptTerms:true),
// activates the account, links the role/children, and signs the user in. If the
// school requires MFA, the client is told to complete MFA setup next.
export async function POST(req: Request) {
  try {
    const i = inviteAcceptSchema.parse(await req.json());
    const res = await acceptInvitation({ token: i.token, code: i.code, fullName: i.fullName, password: i.password });
    setSessionCookie(res.user);
    await recordLoginEvent({ userId: res.user.id, email: res.user.email, schoolId: res.schoolId, ip: clientIp(req), device: req.headers.get("user-agent"), result: "success" });
    return ok({
      user: { id: res.user.id, email: res.user.email, fullName: res.user.fullName, emailVerified: res.user.emailVerified, mfaEnabled: res.user.mfaEnabled },
      requireMfa: res.requireMfa, role: res.role, schoolId: res.schoolId, linkedChildren: res.linkedChildren,
    });
  } catch (err) { return handleError(err); }
}
