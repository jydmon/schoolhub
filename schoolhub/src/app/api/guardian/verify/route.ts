import { guardianInvitePreview, acceptGuardianInvite } from "@/lib/guardian-relationships";
import { handleError, ok } from "@/lib/http";

const ipOf = (req: Request) => (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;

// Public: show a minimal preview of a verification invitation (no PII beyond
// the child's first name + school), so the guardian can confirm before acting.
export async function GET(req: Request) {
  try {
    const token = new URL(req.url).searchParams.get("token") || "";
    return ok(await guardianInvitePreview(token));
  } catch (err) { return handleError(err); }
}

// Public: the guardian confirms their identity/contact and (if new) sets a
// password. On success the platform validates the relationship and links access.
export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => ({}));
    const res = await acceptGuardianInvite({ token: String(b.token || ""), contact: String(b.contact || ""), fullName: b.fullName, password: b.password }, ipOf(req));
    return ok({ status: "linked", email: res.user.email });
  } catch (err) { return handleError(err); }
}
