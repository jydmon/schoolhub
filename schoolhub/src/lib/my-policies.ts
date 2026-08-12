import { prisma } from "./db";
import { ROLES } from "./constants";

const STAFF_ROLES: string[] = [ROLES.SCHOOL_ADMIN, ROLES.SCHOOL_LEADER, ROLES.TEACHER, ROLES.TRANSPORT_MANAGER, ROLES.SUPPORT_STAFF, ROLES.INTEGRATION_ADMIN];

// Published policies that apply to a given user (by their roles + schools),
// annotated with whether they've acknowledged the CURRENT version. This is the
// per-user compliance view the login reminder and the "my policies" list use.
export async function policiesForUser(userId: string) {
  const memberships = await prisma.membership.findMany({ where: { userId }, select: { schoolId: true, role: true } });
  const schoolIds = Array.from(new Set(memberships.map((m) => m.schoolId)));
  const roles = new Set(memberships.map((m) => m.role));
  const isParent = roles.has(ROLES.PARENT) || (await prisma.guardianLink.count({ where: { parentUserId: userId } })) > 0;
  const isTeacher = roles.has(ROLES.TEACHER);
  const isStaff = Array.from(roles).some((r) => STAFF_ROLES.includes(r));

  const audienceOk = (aud: string) =>
    aud === "all" || (aud === "parents" && isParent) || (aud === "teachers" && isTeacher) || (aud === "staff" && isStaff);

  const policies = await prisma.policy.findMany({
    where: { published: true, OR: [{ schoolId: { in: schoolIds } }, { schoolId: null }] },
    orderBy: [{ requireAck: "desc" }, { category: "asc" }, { title: "asc" }],
  });
  const applicable = policies.filter((p) => audienceOk(p.audience));

  const acks = await prisma.policyAck.findMany({ where: { userId, policyId: { in: applicable.map((p) => p.id) } } });
  const ackKey = new Set(acks.map((a) => `${a.policyId}:${a.version}`));

  return applicable.map((p) => ({
    id: p.id,
    title: p.title,
    category: p.category,
    audience: p.audience,
    version: p.version,
    summary: p.summary,
    body: p.body,
    hasBody: !!(p.body && p.body.trim()),
    fileUrl: p.fileUrl,
    effectiveDate: p.effectiveDate,
    mandatory: p.requireAck,
    acknowledged: ackKey.has(`${p.id}:${p.version}`),
  }));
}
