import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { getChildren } from "@/lib/parent";
import { policiesForUser } from "@/lib/my-policies";
import { TERMS_VERSION, TERMS_TITLE } from "@/lib/terms";
import { handleError, ok } from "@/lib/http";

// The parent's own profile: personal + contact details, linked children with
// their schools, and a full compliance history (Terms + policies accepted with
// version/date-time, plus anything still outstanding).
export async function GET() {
  try {
    const ctx = await requireAuth();
    const [user, children, policies] = await Promise.all([
      prisma.user.findUnique({ where: { id: ctx.userId }, select: { id: true, fullName: true, email: true, phone: true, photoUrl: true, mfaEnabled: true, termsAcceptedAt: true, termsVersion: true } }),
      getChildren(ctx.userId),
      policiesForUser(ctx.userId),
    ]);

    const childrenOut = children.map((c: any) => ({
      id: c.student.id,
      name: `${c.student.firstName} ${c.student.lastName}`.trim(),
      reference: c.student.reference,
      yearGroup: c.student.yearGroup,
      relationship: c.relationship,
      schoolId: c.school.id,
      schoolName: c.school.name,
    }));
    // Distinct schools across all children (for the multi-school summary).
    const schoolsMap = new Map<string, string>();
    childrenOut.forEach((c) => schoolsMap.set(c.schoolId, c.schoolName));

    const accepted = policies.filter((p) => p.acknowledged).map((p) => ({ id: p.id, title: p.title, version: p.version, acceptedAt: p.acceptedAt, mandatory: p.mandatory }));
    const outstanding = policies.filter((p) => p.mandatory && !p.acknowledged).map((p) => ({ id: p.id, title: p.title, version: p.version, updated: !!p.previouslyAcceptedAt, previouslyAcceptedAt: p.previouslyAcceptedAt }));

    return ok({
      profile: { id: user?.id, fullName: user?.fullName, email: user?.email, phone: user?.phone, photoUrl: user?.photoUrl, mfaEnabled: user?.mfaEnabled },
      children: childrenOut,
      schools: Array.from(schoolsMap.entries()).map(([id, name]) => ({ id, name })),
      terms: { title: TERMS_TITLE, currentVersion: TERMS_VERSION, acceptedVersion: user?.termsVersion || null, acceptedAt: user?.termsAcceptedAt || null, upToDate: user?.termsVersion === TERMS_VERSION && !!user?.termsAcceptedAt },
      policies: { accepted, outstanding },
    });
  } catch (err) { return handleError(err); }
}
