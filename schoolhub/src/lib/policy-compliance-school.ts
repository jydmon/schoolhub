import { prisma } from "./db";
import { notify } from "./transport";
import { ROLE_LABELS } from "./constants";

// School-scoped policy compliance over the published Trust documents that reach
// a school's users (toAll → every user; toParents → parents). For each policy we
// report who is in scope, who has read it and who has accepted it (for policies
// that require acknowledgement), and who is outstanding — rolled up by policy and
// by user, so a School Administrator can monitor and chase compliance.

async function schoolAudience(schoolId: string) {
  const [memberships, guardians] = await Promise.all([
    prisma.membership.findMany({ where: { schoolId }, select: { userId: true, role: true } }),
    prisma.guardianLink.findMany({ where: { schoolId }, select: { parentUserId: true } }),
  ]);
  const roleByUser = new Map<string, string>();
  for (const m of memberships) if (!roleByUser.has(m.userId)) roleByUser.set(m.userId, m.role);
  const parentIds = new Set(guardians.map((g) => g.parentUserId));
  for (const p of parentIds) if (!roleByUser.has(p)) roleByUser.set(p, "Parent");
  return { roleByUser, parentIds, allUserIds: Array.from(roleByUser.keys()) };
}

export async function schoolPolicyCompliance(schoolId: string) {
  const { roleByUser, parentIds, allUserIds } = await schoolAudience(schoolId);
  const docs = await prisma.trustDocument.findMany({
    where: { status: "published", OR: [{ toAll: true }, { toParents: true }] },
    orderBy: [{ requireAck: "desc" }, { title: "asc" }],
  });
  if (!docs.length || !allUserIds.length) {
    return { policies: [], users: [], totals: { policies: docs.length, users: allUserIds.length, avgReadRate: 100, avgAcceptRate: 100, usersWithOutstanding: 0 } };
  }
  const docIds = docs.map((d) => d.id);
  const [acks, users] = await Promise.all([
    prisma.trustDocumentAck.findMany({ where: { userId: { in: allUserIds }, documentId: { in: docIds } } }),
    prisma.user.findMany({ where: { id: { in: allUserIds } }, select: { id: true, fullName: true, email: true } }),
  ]);
  let reads: { documentId: string; userId: string; version: number }[] = [];
  try { reads = await prisma.trustDocumentRead.findMany({ where: { userId: { in: allUserIds }, documentId: { in: docIds } } }); } catch { reads = []; }
  const ackSet = new Set(acks.map((a) => `${a.documentId}:${a.userId}:${a.version}`));
  const readSet = new Set(reads.map((r) => `${r.documentId}:${r.userId}:${r.version}`));
  const userMap = new Map(users.map((u) => [u.id, u]));

  const audienceOf = (d: any) => d.toAll ? allUserIds : Array.from(parentIds);
  const isRead = (docId: string, uid: string, v: number) => ackSet.has(`${docId}:${uid}:${v}`) || readSet.has(`${docId}:${uid}:${v}`);
  const isAcked = (docId: string, uid: string, v: number) => ackSet.has(`${docId}:${uid}:${v}`);

  // ---- Per-policy rollup ----
  const policies = docs.map((d) => {
    const aud = audienceOf(d);
    const notRead: string[] = [], notAccepted: string[] = [];
    let readC = 0, accC = 0;
    for (const uid of aud) {
      if (isRead(d.id, uid, d.version)) readC++; else notRead.push(uid);
      if (d.requireAck) { if (isAcked(d.id, uid, d.version)) accC++; else notAccepted.push(uid); }
    }
    return {
      id: d.id, title: d.title, category: d.category, version: d.version, requireAck: d.requireAck,
      publishedAt: d.publishedAt, updatedAt: d.updatedAt,
      audienceCount: aud.length, readCount: readC, acceptedCount: accC,
      notReadCount: notRead.length, notAcceptedCount: d.requireAck ? notAccepted.length : 0,
      readRate: aud.length ? Math.round((readC / aud.length) * 100) : 100,
      acceptRate: d.requireAck ? (aud.length ? Math.round((accC / aud.length) * 100) : 100) : null,
      // Who to chase: for ack policies, those who haven't accepted; else those who haven't read.
      outstandingUserIds: d.requireAck ? notAccepted : notRead,
    };
  });

  // ---- Per-user rollup ----
  const usersRollup = allUserIds.map((uid) => {
    const applicable = docs.filter((d) => d.toAll || (d.toParents && parentIds.has(uid)));
    const ackApplicable = applicable.filter((d) => d.requireAck);
    const readN = applicable.filter((d) => isRead(d.id, uid, d.version)).length;
    const accN = ackApplicable.filter((d) => isAcked(d.id, uid, d.version)).length;
    const u = userMap.get(uid);
    const role = roleByUser.get(uid) || "Parent";
    return {
      userId: uid, name: u?.fullName || "Unknown", email: u?.email || "", role: ROLE_LABELS[role] || role,
      applicable: applicable.length, read: readN, unread: applicable.length - readN,
      toAccept: ackApplicable.length, accepted: accN, unaccepted: ackApplicable.length - accN,
      fullyCompliant: readN === applicable.length && accN === ackApplicable.length,
    };
  }).sort((a, b) => (a.unaccepted + a.unread) - (b.unaccepted + b.unread) === 0 ? a.name.localeCompare(b.name) : (b.unaccepted + b.unread) - (a.unaccepted + a.unread));

  const avg = (arr: number[]) => (arr.length ? Math.round(arr.reduce((s, x) => s + x, 0) / arr.length) : 100);
  const totals = {
    policies: docs.length,
    users: allUserIds.length,
    avgReadRate: avg(policies.map((p) => p.readRate)),
    avgAcceptRate: avg(policies.filter((p) => p.acceptRate != null).map((p) => p.acceptRate as number)),
    usersWithOutstanding: usersRollup.filter((u) => !u.fullyCompliant).length,
  };
  return { policies, users: usersRollup, totals };
}

// Send an in-app reminder to the given users about outstanding policies (all, or
// one specific policy). Returns how many were reminded.
export async function remindPolicyUsers(schoolId: string, userIds: string[], documentId?: string) {
  const ids = Array.from(new Set(userIds)).filter(Boolean);
  if (!ids.length) return { reminded: 0 };
  let title = "Policy reminder";
  let body = "You have one or more policies to review and accept. Open Help & support → Policies.";
  if (documentId) {
    const d = await prisma.trustDocument.findUnique({ where: { id: documentId }, select: { title: true } });
    if (d) { title = `Reminder: please review “${d.title}”`; body = `Open Help & support → Policies to read and accept “${d.title}”.`; }
  }
  await notify(ids, { kind: "policy_reminder", title, body, schoolId });
  return { reminded: ids.length };
}

// CSV export of the compliance report (per-policy summary + per-user detail).
export function complianceCsv(data: Awaited<ReturnType<typeof schoolPolicyCompliance>>): string {
  const q = (v: any) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines: string[] = [];
  lines.push("Policy compliance — by policy");
  lines.push(["Policy", "Version", "Requires acceptance", "Audience", "Read", "Read %", "Accepted", "Accept %", "Not read", "Not accepted"].join(","));
  for (const p of data.policies) lines.push([p.title, p.version, p.requireAck ? "Yes" : "No", p.audienceCount, p.readCount, `${p.readRate}%`, p.requireAck ? p.acceptedCount : "—", p.acceptRate == null ? "—" : `${p.acceptRate}%`, p.notReadCount, p.requireAck ? p.notAcceptedCount : "—"].map(q).join(","));
  lines.push("");
  lines.push("Policy compliance — by user");
  lines.push(["User", "Email", "Role", "Applicable", "Read", "Unread", "To accept", "Accepted", "Unaccepted", "Fully compliant"].join(","));
  for (const u of data.users) lines.push([u.name, u.email, u.role, u.applicable, u.read, u.unread, u.toAccept, u.accepted, u.unaccepted, u.fullyCompliant ? "Yes" : "No"].map(q).join(","));
  return lines.join("\r\n");
}
