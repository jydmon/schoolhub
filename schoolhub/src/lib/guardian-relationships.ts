import { prisma } from "./db";
import { hashPassword } from "./auth";
import { generateToken } from "./invite-logic";
import { ROLES } from "./constants";
import { AppError } from "./http";

// ---------------------------------------------------------------------------
// Guardian relationship workflow.
//
// SECURITY MODEL: a parent NEVER gains access to a child by supplying a name +
// date of birth + school. Access requires this school-controlled lifecycle:
//   1. School CREATES a relationship (draft) linking a named guardian to a pupil.
//   2. School ISSUES an invitation (a one-time verification token, delivered to
//      the guardian's contact on file).
//   3. The guardian VERIFIES identity/contact (confirms the contact the school
//      recorded and sets a password) — or the school verifies them in person.
//   4. The platform VALIDATES and only then creates the GuardianLink that the
//      parent portal reads. No GuardianLink is ever created any other way here.
//   5. The school can amend / suspend / resume / revoke / reissue at any time.
// Every transition is written to GuardianAudit with before/after values.
// ---------------------------------------------------------------------------

export type Actor = { userId?: string | null; email?: string | null; role?: string; ip?: string | null };

const TOKEN_TTL_DAYS = 14;

async function childLabel(studentId?: string | null) {
  if (!studentId) return null;
  const s = await prisma.student.findUnique({ where: { id: studentId }, select: { firstName: true, lastName: true, reference: true } });
  return s ? `${s.firstName} ${s.lastName}`.trim() : null;
}

export async function logGuardianAudit(input: {
  schoolId: string; studentId?: string | null; relationshipId?: string | null; guardianUserId?: string | null;
  guardianLabel?: string | null; childLabel?: string | null; action: string; actor: Actor;
  previousValues?: Record<string, unknown>; newValues?: Record<string, unknown>; note?: string;
}) {
  try {
    await prisma.guardianAudit.create({
      data: {
        schoolId: input.schoolId, studentId: input.studentId ?? null, relationshipId: input.relationshipId ?? null,
        guardianUserId: input.guardianUserId ?? null, guardianLabel: input.guardianLabel ?? null, childLabel: input.childLabel ?? null,
        action: input.action, actorUserId: input.actor.userId ?? null, actorEmail: input.actor.email ?? null, actorRole: input.actor.role ?? "school",
        previousValues: JSON.stringify(input.previousValues ?? {}), newValues: JSON.stringify(input.newValues ?? {}),
        note: input.note ?? null, ip: input.actor.ip ?? null,
      },
    });
  } catch (err) { console.error("[guardian-audit] failed", input.action, err); }
}

export function relPublic(r: any) {
  return {
    id: r.id, schoolId: r.schoolId, studentId: r.studentId, guardianUserId: r.guardianUserId,
    guardianName: r.guardianName, guardianEmail: r.guardianEmail, guardianPhone: r.guardianPhone,
    relationship: r.relationship, hasParentalResponsibility: r.hasParentalResponsibility,
    isPrimaryContact: r.isPrimaryContact, isEmergencyContact: r.isEmergencyContact,
    collectionAuthorised: r.collectionAuthorised, custodyArrangement: r.custodyArrangement,
    status: r.status, invitedAt: r.invitedAt, verifiedAt: r.verifiedAt, verificationMethod: r.verificationMethod,
    linkedAt: r.linkedAt, suspendedAt: r.suspendedAt, revokedAt: r.revokedAt,
    inviteExpires: r.inviteTokenExpires, hasPendingInvite: !!r.inviteToken && r.status === "invited",
    createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

export async function listRelationships(schoolId: string, filters: { studentId?: string; status?: string } = {}) {
  const rels = await prisma.guardianRelationship.findMany({
    where: { schoolId, ...(filters.studentId ? { studentId: filters.studentId } : {}), ...(filters.status ? { status: filters.status } : {}) },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });
  const studentIds = Array.from(new Set(rels.map((r) => r.studentId)));
  const students = await prisma.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, firstName: true, lastName: true, reference: true, yearGroup: true } });
  const sMap = new Map(students.map((s) => [s.id, s]));
  return rels.map((r) => ({ ...relPublic(r), student: sMap.get(r.studentId) || null }));
}

export async function relationshipDetail(schoolId: string, relId: string) {
  const r = await prisma.guardianRelationship.findFirst({ where: { id: relId, schoolId } });
  if (!r) throw new AppError("Relationship not found", 404);
  const student = await prisma.student.findUnique({ where: { id: r.studentId }, select: { id: true, firstName: true, lastName: true, reference: true, yearGroup: true } });
  const audit = await prisma.guardianAudit.findMany({ where: { relationshipId: relId }, orderBy: { createdAt: "desc" }, take: 200 });
  return {
    ...relPublic(r), student,
    audit: audit.map((a) => ({
      id: a.id, action: a.action, actorEmail: a.actorEmail, actorRole: a.actorRole,
      guardianLabel: a.guardianLabel, childLabel: a.childLabel, note: a.note, ip: a.ip,
      previousValues: safeJson(a.previousValues), newValues: safeJson(a.newValues), createdAt: a.createdAt,
    })),
  };
}

function safeJson(s: string) { try { return JSON.parse(s || "{}"); } catch { return {}; } }

export async function createRelationship(schoolId: string, input: {
  studentId: string; guardianName: string; guardianEmail: string; guardianPhone?: string;
  relationship?: string; hasParentalResponsibility?: boolean; isPrimaryContact?: boolean;
  isEmergencyContact?: boolean; collectionAuthorised?: boolean; custodyArrangement?: string;
}, actor: Actor) {
  const student = await prisma.student.findFirst({ where: { id: input.studentId, schoolId } });
  if (!student) throw new AppError("Pupil not found in this school", 404);
  if (!input.guardianName?.trim() || !input.guardianEmail?.trim()) throw new AppError("Guardian name and email are required", 400);

  const rel = await prisma.guardianRelationship.create({
    data: {
      schoolId, studentId: input.studentId, guardianName: input.guardianName.trim(), guardianEmail: input.guardianEmail.trim().toLowerCase(),
      guardianPhone: input.guardianPhone?.trim() || null, relationship: input.relationship || "Parent",
      hasParentalResponsibility: input.hasParentalResponsibility !== false,
      isPrimaryContact: !!input.isPrimaryContact, isEmergencyContact: !!input.isEmergencyContact,
      collectionAuthorised: !!input.collectionAuthorised, custodyArrangement: input.custodyArrangement || null,
      status: "draft", createdById: actor.userId ?? null,
    },
  });
  const cl = `${student.firstName} ${student.lastName}`.trim();
  await logGuardianAudit({ schoolId, studentId: input.studentId, relationshipId: rel.id, guardianLabel: `${rel.guardianName} <${rel.guardianEmail}>`, childLabel: cl, action: "created", actor, newValues: relPublic(rel), note: "Relationship created (draft)." });
  return relPublic(rel);
}

const AMENDABLE = ["guardianName", "guardianEmail", "guardianPhone", "relationship", "hasParentalResponsibility", "isPrimaryContact", "isEmergencyContact", "collectionAuthorised", "custodyArrangement"] as const;

export async function amendRelationship(schoolId: string, relId: string, patch: Record<string, any>, actor: Actor) {
  const rel = await prisma.guardianRelationship.findFirst({ where: { id: relId, schoolId } });
  if (!rel) throw new AppError("Relationship not found", 404);
  const before: Record<string, any> = {}, after: Record<string, any> = {}, data: Record<string, any> = {};
  for (const k of AMENDABLE) {
    if (!(k in patch)) continue;
    let v = patch[k];
    if (k === "guardianEmail" && typeof v === "string") v = v.trim().toLowerCase();
    else if (typeof v === "string") v = v.trim();
    if ((rel as any)[k] === v) continue;
    before[k] = (rel as any)[k]; after[k] = v; data[k] = v;
  }
  if (Object.keys(data).length === 0) return relPublic(rel);
  const updated = await prisma.guardianRelationship.update({ where: { id: rel.id }, data });
  // Keep an existing active GuardianLink's relationship label in sync.
  if (rel.linkId && ("relationship" in data)) {
    await prisma.guardianLink.update({ where: { id: rel.linkId }, data: { relationship: data.relationship } }).catch(() => {});
  }
  await logGuardianAudit({ schoolId, studentId: rel.studentId, relationshipId: rel.id, guardianUserId: rel.guardianUserId, guardianLabel: `${updated.guardianName} <${updated.guardianEmail}>`, childLabel: await childLabel(rel.studentId), action: "amended", actor, previousValues: before, newValues: after, note: "Relationship details amended." });
  return relPublic(updated);
}

export async function issueInvite(schoolId: string, relId: string, actor: Actor, opts: { appUrl: string }) {
  const rel = await prisma.guardianRelationship.findFirst({ where: { id: relId, schoolId } });
  if (!rel) throw new AppError("Relationship not found", 404);
  if (rel.status === "revoked") throw new AppError("This relationship has been revoked — reinstate it before inviting.", 409);
  const reissue = rel.status === "invited" || !!rel.inviteToken;
  const token = generateToken();
  const expires = new Date(Date.now() + TOKEN_TTL_DAYS * 86400000);
  const updated = await prisma.guardianRelationship.update({
    where: { id: rel.id }, data: { inviteToken: token, inviteTokenExpires: expires, invitedAt: new Date(), status: rel.status === "active" ? rel.status : "invited" },
  });
  const link = `${opts.appUrl.replace(/\/+$/, "")}/guardian/verify?token=${token}`;
  await logGuardianAudit({ schoolId, studentId: rel.studentId, relationshipId: rel.id, guardianLabel: `${rel.guardianName} <${rel.guardianEmail}>`, childLabel: await childLabel(rel.studentId), action: reissue ? "invite_reissued" : "invited", actor, newValues: { invitedAt: updated.invitedAt, expires }, note: `Verification invitation ${reissue ? "reissued" : "issued"} to ${rel.guardianEmail}.` });
  return { relationship: relPublic(updated), token, link, reissue };
}

async function doLink(rel: any, method: "self" | "school", actor: Actor, extra: { fullName?: string; password?: string; ref?: string }) {
  const email = rel.guardianEmail.toLowerCase();
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    if (!extra.password) throw new AppError("A password is required to activate a new account.", 400);
    user = await prisma.user.create({ data: { email, fullName: extra.fullName || rel.guardianName, passwordHash: await hashPassword(extra.password), status: "active", emailVerified: true, phone: rel.guardianPhone || undefined } });
  } else if (extra.password) {
    user = await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(extra.password), status: "active", emailVerified: true, sessionVersion: { increment: 1 } } });
  }
  await prisma.membership.upsert({ where: { userId_schoolId_role: { userId: user.id, schoolId: rel.schoolId, role: ROLES.PARENT } }, update: {}, create: { userId: user.id, schoolId: rel.schoolId, role: ROLES.PARENT } });
  const guardianLink = await prisma.guardianLink.upsert({
    where: { parentUserId_studentId: { parentUserId: user.id, studentId: rel.studentId } },
    update: { relationship: rel.relationship, isPrimaryContact: rel.isPrimaryContact, isEmergencyContact: rel.isEmergencyContact, collectionAuthorised: rel.collectionAuthorised, hasParentalResponsibility: rel.hasParentalResponsibility, custodyArrangement: rel.custodyArrangement },
    create: { schoolId: rel.schoolId, parentUserId: user.id, studentId: rel.studentId, relationship: rel.relationship, isPrimaryContact: rel.isPrimaryContact, isEmergencyContact: rel.isEmergencyContact, collectionAuthorised: rel.collectionAuthorised, hasParentalResponsibility: rel.hasParentalResponsibility, custodyArrangement: rel.custodyArrangement || undefined },
  });
  const updated = await prisma.guardianRelationship.update({
    where: { id: rel.id },
    data: { guardianUserId: user.id, status: "active", verifiedAt: rel.verifiedAt ?? new Date(), verificationMethod: method, linkedAt: new Date(), linkId: guardianLink.id, inviteToken: null, inviteTokenExpires: null, verificationRef: extra.ref ?? rel.verificationRef },
  });
  const cl = await childLabel(rel.studentId);
  await logGuardianAudit({ schoolId: rel.schoolId, studentId: rel.studentId, relationshipId: rel.id, guardianUserId: user.id, guardianLabel: `${rel.guardianName} <${email}>`, childLabel: cl, action: "validated", actor, note: `Identity verified (${method}); platform validated the relationship.` });
  await logGuardianAudit({ schoolId: rel.schoolId, studentId: rel.studentId, relationshipId: rel.id, guardianUserId: user.id, guardianLabel: `${rel.guardianName} <${email}>`, childLabel: cl, action: "linked", actor, note: `Account linked to ${cl}. Access granted.` });
  return { user, relationship: relPublic(updated) };
}

// School verifies the guardian in person and links the account immediately.
export async function adminVerify(schoolId: string, relId: string, actor: Actor, opts: { ref?: string }) {
  const rel = await prisma.guardianRelationship.findFirst({ where: { id: relId, schoolId } });
  if (!rel) throw new AppError("Relationship not found", 404);
  if (rel.status === "revoked") throw new AppError("This relationship has been revoked.", 409);
  await prisma.guardianRelationship.update({ where: { id: rel.id }, data: { verifiedAt: new Date(), verificationMethod: "school", verificationRef: opts.ref || null } });
  await logGuardianAudit({ schoolId, studentId: rel.studentId, relationshipId: rel.id, guardianLabel: `${rel.guardianName} <${rel.guardianEmail}>`, childLabel: await childLabel(rel.studentId), action: "identity_verified", actor, newValues: { method: "school", ref: opts.ref || null }, note: "Identity verified by the school." });
  const fresh = await prisma.guardianRelationship.findUnique({ where: { id: rel.id } });
  return doLink(fresh, "school", actor, { ref: opts.ref });
}

// Parent accepts their invitation, confirming identity/contact and setting a password.
export async function acceptGuardianInvite(input: { token: string; contact: string; fullName?: string; password?: string }, ip?: string | null) {
  const rel = await prisma.guardianRelationship.findUnique({ where: { inviteToken: input.token } });
  if (!rel) throw new AppError("This verification link is invalid or has already been used.", 400);
  if (rel.status === "revoked") throw new AppError("This invitation is no longer valid.", 409);
  if (rel.inviteTokenExpires && rel.inviteTokenExpires < new Date()) throw new AppError("This verification link has expired — ask the school to reissue it.", 400);

  // Identity/contact check: the guardian must confirm the contact the SCHOOL
  // recorded (email or phone). Name + DOB are never accepted as proof.
  const contact = (input.contact || "").trim().toLowerCase();
  const emailMatch = contact === rel.guardianEmail.toLowerCase();
  const digits = (s: string) => s.replace(/\D/g, "");
  const phoneMatch = !!rel.guardianPhone && digits(contact).length >= 6 && digits(contact) === digits(rel.guardianPhone);
  if (!emailMatch && !phoneMatch) throw new AppError("The contact details you entered don't match what your school has on file. Please contact the school office.", 403);

  const actor: Actor = { email: rel.guardianEmail, role: "guardian", ip };
  await prisma.guardianRelationship.update({ where: { id: rel.id }, data: { verifiedAt: new Date(), verificationMethod: "self" } });
  await logGuardianAudit({ schoolId: rel.schoolId, studentId: rel.studentId, relationshipId: rel.id, guardianLabel: `${rel.guardianName} <${rel.guardianEmail}>`, childLabel: await childLabel(rel.studentId), action: "invite_accepted", actor, note: "Guardian opened the invitation and confirmed their contact." });
  await logGuardianAudit({ schoolId: rel.schoolId, studentId: rel.studentId, relationshipId: rel.id, guardianLabel: `${rel.guardianName} <${rel.guardianEmail}>`, childLabel: await childLabel(rel.studentId), action: "identity_verified", actor, newValues: { method: "self", via: emailMatch ? "email" : "phone" }, note: "Guardian verified their identity via the contact on file." });
  const fresh = await prisma.guardianRelationship.findUnique({ where: { id: rel.id } });
  const res = await doLink(fresh, "self", actor, { fullName: input.fullName, password: input.password });
  return res;
}

async function removeLink(rel: any) {
  if (rel.guardianUserId) {
    await prisma.guardianLink.deleteMany({ where: { parentUserId: rel.guardianUserId, studentId: rel.studentId, schoolId: rel.schoolId } });
  } else if (rel.linkId) {
    await prisma.guardianLink.deleteMany({ where: { id: rel.linkId } });
  }
}

export async function suspendRelationship(schoolId: string, relId: string, actor: Actor, note?: string) {
  const rel = await prisma.guardianRelationship.findFirst({ where: { id: relId, schoolId } });
  if (!rel) throw new AppError("Relationship not found", 404);
  await removeLink(rel);
  const updated = await prisma.guardianRelationship.update({ where: { id: rel.id }, data: { status: "suspended", suspendedAt: new Date(), linkId: null } });
  await logGuardianAudit({ schoolId, studentId: rel.studentId, relationshipId: rel.id, guardianUserId: rel.guardianUserId, guardianLabel: `${rel.guardianName} <${rel.guardianEmail}>`, childLabel: await childLabel(rel.studentId), action: "suspended", actor, previousValues: { status: rel.status }, newValues: { status: "suspended" }, note: note || "Access suspended — the GuardianLink was removed." });
  return relPublic(updated);
}

export async function resumeRelationship(schoolId: string, relId: string, actor: Actor) {
  const rel = await prisma.guardianRelationship.findFirst({ where: { id: relId, schoolId } });
  if (!rel) throw new AppError("Relationship not found", 404);
  if (rel.status !== "suspended") throw new AppError("Only a suspended relationship can be resumed.", 409);
  if (!rel.guardianUserId || !rel.verifiedAt) {
    // Never verified — cannot silently grant access; require re-invitation.
    const updated = await prisma.guardianRelationship.update({ where: { id: rel.id }, data: { status: "draft", suspendedAt: null } });
    await logGuardianAudit({ schoolId, studentId: rel.studentId, relationshipId: rel.id, guardianLabel: `${rel.guardianName} <${rel.guardianEmail}>`, childLabel: await childLabel(rel.studentId), action: "resumed", actor, note: "Reinstated to draft — a fresh invitation and verification are required before access is granted." });
    return relPublic(updated);
  }
  return doLink(rel, (rel.verificationMethod as any) || "school", actor, {});
}

export async function revokeRelationship(schoolId: string, relId: string, actor: Actor, note?: string) {
  const rel = await prisma.guardianRelationship.findFirst({ where: { id: relId, schoolId } });
  if (!rel) throw new AppError("Relationship not found", 404);
  await removeLink(rel);
  const updated = await prisma.guardianRelationship.update({ where: { id: rel.id }, data: { status: "revoked", revokedAt: new Date(), inviteToken: null, inviteTokenExpires: null, linkId: null } });
  await logGuardianAudit({ schoolId, studentId: rel.studentId, relationshipId: rel.id, guardianUserId: rel.guardianUserId, guardianLabel: `${rel.guardianName} <${rel.guardianEmail}>`, childLabel: await childLabel(rel.studentId), action: "revoked", actor, previousValues: { status: rel.status }, newValues: { status: "revoked" }, note: note || "Relationship revoked — access removed and any pending invite cancelled." });
  return relPublic(updated);
}

// Public (unauthenticated) preview for the verification page — minimal data only.
export async function guardianInvitePreview(token: string) {
  const rel = await prisma.guardianRelationship.findUnique({ where: { inviteToken: token } });
  if (!rel) return { valid: false as const, reason: "invalid" };
  if (rel.status === "revoked") return { valid: false as const, reason: "revoked" };
  if (rel.inviteTokenExpires && rel.inviteTokenExpires < new Date()) return { valid: false as const, reason: "expired" };
  const student = await prisma.student.findUnique({ where: { id: rel.studentId }, select: { firstName: true } });
  const school = await prisma.school.findUnique({ where: { id: rel.schoolId }, select: { name: true } });
  const existing = await prisma.user.findUnique({ where: { email: rel.guardianEmail.toLowerCase() }, select: { passwordHash: true } });
  return {
    valid: true as const,
    guardianName: rel.guardianName,
    childFirstName: student?.firstName || "your child",
    schoolName: school?.name || "your school",
    relationship: rel.relationship,
    needsPassword: !existing?.passwordHash,
  };
}
