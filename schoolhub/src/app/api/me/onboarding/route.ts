import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { hashPassword } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { TERMS_VERSION } from "@/lib/terms";
import { ROLES } from "@/lib/constants";
import { handleError, ok, AppError } from "@/lib/http";

const PROFILE_FIELDS = ["name", "contactEmail", "contactPhone", "contactName", "addressLine1", "addressLine2", "city", "county", "postcode", "country", "headTeacher", "headTeacherEmail", "headTeacherPhone", "logoUrl"] as const;
const REQUIRED_PROFILE = PROFILE_FIELDS.filter((f) => f !== "logoUrl"); // logo is optional

// First-login onboarding state for the signed-in user: whether they must change
// a temporary password, accept the current Terms, and whether the guided tour
// has been dismissed. Drives the blocking onboarding overlay.
export async function GET() {
  try {
    const ctx = await requireAuth();
    const u = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { mustChangePassword: true, termsAcceptedAt: true, termsVersion: true, tourDismissed: true, memberships: { where: { role: ROLES.SCHOOL_ADMIN }, select: { schoolId: true }, take: 1 } },
    });
    if (!u) return ok({ error: "Not found" }, 404);

    // Mandatory school-profile setup for School Administrators on first login.
    let needsProfile = false; let profileSchoolId: string | null = null; let profile: any = null;
    const adminSchoolId = u.memberships[0]?.schoolId;
    if (adminSchoolId) {
      const s = await prisma.school.findUnique({
        where: { id: adminSchoolId },
        select: { id: true, name: true, contactEmail: true, contactPhone: true, contactName: true, addressLine1: true, addressLine2: true, city: true, county: true, postcode: true, country: true, headTeacher: true, headTeacherEmail: true, headTeacherPhone: true, logoUrl: true, profileCompletedAt: true },
      });
      if (s) {
        profileSchoolId = s.id;
        needsProfile = !s.profileCompletedAt;
        profile = { ...s };
      }
    }

    return ok({
      mustChangePassword: !!u.mustChangePassword,
      termsAccepted: u.termsVersion === TERMS_VERSION && !!u.termsAcceptedAt,
      currentTermsVersion: TERMS_VERSION,
      acceptedTermsVersion: u.termsVersion,
      tourDismissed: !!u.tourDismissed,
      needsProfile,
      profileSchoolId,
      profile,
    });
  } catch (err) { return handleError(err); }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const b = await req.json().catch(() => ({}));
    const action = String(b.action || "");

    if (action === "change_password") {
      const pw = String(b.newPassword || "");
      if (pw.length < 8) throw new AppError("Password must be at least 8 characters", 400);
      await prisma.user.update({ where: { id: ctx.userId }, data: { passwordHash: await hashPassword(pw), mustChangePassword: false } });
      await recordAudit({ action: "PASSWORD_CHANGED", actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "User", targetId: ctx.userId, metadata: { reason: "temp_password_change" } });
      return ok({ ok: true });
    }
    if (action === "accept_terms") {
      await prisma.user.update({ where: { id: ctx.userId }, data: { termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION } });
      await recordAudit({ action: "TERMS_ACCEPTED", actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "User", targetId: ctx.userId, metadata: { version: TERMS_VERSION } });
      return ok({ ok: true });
    }
    if (action === "dismiss_tour") {
      await prisma.user.update({ where: { id: ctx.userId }, data: { tourDismissed: true } });
      return ok({ ok: true });
    }
    if (action === "save_profile") {
      const schoolId = String(b.schoolId || "");
      const membership = await prisma.membership.findFirst({ where: { userId: ctx.userId, schoolId, role: ROLES.SCHOOL_ADMIN } });
      if (!membership) throw new AppError("You are not an administrator of this school.", 403);
      const f = (b.profile || {}) as Record<string, string>;
      const missing = REQUIRED_PROFILE.filter((k) => !String(f[k] ?? "").trim());
      if (missing.length) throw new AppError("Please complete all required fields before continuing.", 400);
      const data: Record<string, unknown> = { profileCompletedAt: new Date() };
      for (const k of PROFILE_FIELDS) if (f[k] !== undefined) data[k] = String(f[k]).trim() || null;
      await prisma.school.update({ where: { id: schoolId }, data });
      await recordAudit({ action: "SCHOOL_PROFILE_COMPLETED", schoolId, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "School", targetId: schoolId });
      return ok({ ok: true });
    }
    throw new AppError("Unknown action", 400);
  } catch (err) { return handleError(err); }
}
