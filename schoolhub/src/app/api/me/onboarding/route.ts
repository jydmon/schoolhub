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
      select: { mustChangePassword: true, termsAcceptedAt: true, termsVersion: true, tourDismissed: true, memberships: { select: { schoolId: true, role: true } } },
    });
    if (!u) return ok({ error: "Not found" }, 404);

    // Mandatory school-profile setup for School Administrators on first login.
    let needsProfile = false; let profileSchoolId: string | null = null; let profile: any = null;
    const adminSchoolId = u.memberships.find((m) => m.role === ROLES.SCHOOL_ADMIN)?.schoolId;
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

    // Account activation gate (commercial onboarding). Applies to the user's
    // relevant school — their admin school if they're an admin, else their first
    // membership. Existing/grandfathered schools are "activated".
    let activation: any = null;
    const gateSchoolId = adminSchoolId ?? u.memberships[0]?.schoolId;
    if (gateSchoolId) {
      const s = await prisma.school.findUnique({ where: { id: gateSchoolId }, select: { id: true, name: true, activationStatus: true } });
      if (s) {
        const status = s.activationStatus ?? "activated";
        let paymentSubmitted = false; let paymentStatus: string | null = null;
        if (status !== "activated") {
          const pay = await prisma.paymentSubmission.findFirst({ where: { schoolId: s.id }, orderBy: { createdAt: "desc" }, select: { status: true } });
          paymentSubmitted = !!pay; paymentStatus = pay?.status ?? null;
        }
        activation = { schoolId: s.id, schoolName: s.name, status, isAdmin: !!adminSchoolId && adminSchoolId === s.id, paymentSubmitted, paymentStatus };
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
      activation,
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
    if (action === "submit_payment") {
      const schoolId = String(b.schoolId || "");
      const membership = await prisma.membership.findFirst({ where: { userId: ctx.userId, schoolId, role: ROLES.SCHOOL_ADMIN } });
      if (!membership) throw new AppError("You are not an administrator of this school.", 403);
      const f = (b.file || {}) as Record<string, string>;
      const dataUrl = String(f.dataUrl || "");
      if (!/^data:[^;,]+(;[^,]+)?,/i.test(dataUrl)) throw new AppError("Please attach your invoice or proof of payment.", 400);
      if (dataUrl.length > 6_000_000) throw new AppError("That file is too large (max ~4MB).", 400);
      await prisma.paymentSubmission.create({
        data: {
          schoolId, fileName: String(f.name || "invoice").slice(0, 200), fileType: String(f.type || "application/octet-stream").slice(0, 120),
          fileDataUrl: dataUrl, amount: b.amount != null ? Math.max(0, Math.round(Number(b.amount) || 0)) : null,
          note: b.note ? String(b.note).slice(0, 2000) : null, submittedById: ctx.userId, status: "submitted",
        },
      });
      await recordAudit({ action: "PAYMENT_SUBMITTED", schoolId, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "School", targetId: schoolId });
      return ok({ ok: true });
    }
    throw new AppError("Unknown action", 400);
  } catch (err) { return handleError(err); }
}
