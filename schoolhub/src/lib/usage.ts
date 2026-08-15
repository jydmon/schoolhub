import { prisma } from "./db";
import { summarizeByUser, summarizeRole, type EventLike } from "./usage-logic";

// Usage-analytics data layer. Records product-usage events (logins + feature
// usage) and aggregates them for the super-admin analytics + system-usage views.
// This is behavioural/aggregate telemetry — never pupil data.

/** Record a usage event (call from login + key actions). Best-effort. */
export async function recordUsage(input: { userId: string; role?: string; schoolId?: string | null; action: string; area?: string | null; count?: number }): Promise<void> {
  try {
    await prisma.usageEvent.create({
      data: {
        userId: input.userId, role: input.role ?? "", schoolId: input.schoolId ?? null,
        action: input.action, area: input.area ?? null, count: input.count ?? 1,
      },
    });
  } catch { /* analytics must never break the request path */ }
}

function sinceDate(days: number): Date { return new Date(Date.now() - days * 24 * 60 * 60 * 1000); }

/** Per-user analytics (login count, last login, functions, volume) — optionally
 *  filtered to a role and/or school, over the last N days. */
export async function userAnalytics(opts: { role?: string; schoolId?: string | null; days?: number; limit?: number } = {}) {
  const events = await prisma.usageEvent.findMany({
    where: {
      at: { gte: sinceDate(opts.days ?? 30) },
      ...(opts.role ? { role: opts.role } : {}),
      ...(opts.schoolId ? { schoolId: opts.schoolId } : {}),
    },
    orderBy: { at: "desc" },
    take: 20000,
  });
  const rows = summarizeByUser(events as EventLike[]);
  // Attach display names.
  const ids = rows.map((r) => r.userId).filter(Boolean) as string[];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, email: true } }) : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  const withNames = rows.map((r) => ({ ...r, name: byId.get(r.userId!)?.fullName ?? null, email: byId.get(r.userId!)?.email ?? null }));
  return opts.limit ? withNames.slice(0, opts.limit) : withNames;
}

/** Cohort analytics for parents and teachers (and any other role). */
export async function roleAnalytics(roles: string[], opts: { schoolId?: string | null; days?: number } = {}) {
  const events = await prisma.usageEvent.findMany({
    where: { at: { gte: sinceDate(opts.days ?? 30) }, ...(opts.schoolId ? { schoolId: opts.schoolId } : {}) },
    take: 50000,
  });
  return roles.map((role) => summarizeRole(events as EventLike[], role));
}

/** System usage totals (volume, logins, active users, by area) — platform-wide
 *  or scoped to a single school when schoolId is given. */
export async function systemUsage(days = 30, schoolId?: string | null) {
  const events = await prisma.usageEvent.findMany({ where: { at: { gte: sinceDate(days) }, ...(schoolId ? { schoolId } : {}) }, take: 100000 });
  const volume = events.reduce((s, e) => s + (e.count ?? 1), 0);
  const logins = events.filter((e) => e.action === "login").length;
  const activeUsers = new Set(events.filter((e) => e.action === "login").map((e) => e.userId)).size;
  const byArea: Record<string, number> = {};
  for (const e of events) { if (e.area) byArea[e.area] = (byArea[e.area] ?? 0) + (e.count ?? 1); }
  return { volume, logins, activeUsers, byArea };
}

/** Per-school analytics census: user counts by role, active vs inactive, last
 *  logins, actions, a login trend and the most-used areas — over the last N days.
 *  Built from memberships + User.lastLoginAt/status + LoginEvent + AuditLog +
 *  UsageEvent, so it works on existing data with no extra instrumentation. */
export async function schoolCensus(schoolId: string, days = 30) {
  const since = sinceDate(days);
  const memberships = await prisma.membership.findMany({ where: { schoolId }, select: { userId: true, role: true } });
  const byRole: Record<string, number> = {};
  for (const m of memberships) byRole[m.role] = (byRole[m.role] ?? 0) + 1;
  const userIds = Array.from(new Set(memberships.map((m) => m.userId)));
  const rolesByUser = new Map<string, string[]>();
  for (const m of memberships) { const a = rolesByUser.get(m.userId) ?? []; if (!a.includes(m.role)) a.push(m.role); rolesByUser.set(m.userId, a); }
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true, email: true, status: true, lastLoginAt: true } }) : [];

  const totalUsers = users.length;
  const activeUsers = users.filter((u) => u.lastLoginAt && u.lastLoginAt >= since).length;
  const suspended = users.filter((u) => u.status === "suspended").length;
  const invited = users.filter((u) => u.status === "invited").length;
  const neverLoggedIn = users.filter((u) => !u.lastLoginAt).length;

  const lastLogins = [...users]
    .sort((a, b) => (b.lastLoginAt?.getTime() ?? 0) - (a.lastLoginAt?.getTime() ?? 0))
    .slice(0, 100)
    .map((u) => ({ name: u.fullName || u.email, email: u.email, roles: (rolesByUser.get(u.id) ?? []).join(", "), status: u.status, lastLoginAt: u.lastLoginAt }));

  const actions = await prisma.auditLog.count({ where: { schoolId, createdAt: { gte: since } } });

  const loginRows = await prisma.loginEvent.findMany({ where: { schoolId, result: "success", at: { gte: since } }, select: { at: true }, take: 100000 });
  const byDay: Record<string, number> = {};
  for (const l of loginRows) { const d = l.at.toISOString().slice(0, 10); byDay[d] = (byDay[d] ?? 0) + 1; }
  const trend = Object.entries(byDay).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, count]) => ({ date, count }));

  const usage = await prisma.usageEvent.findMany({ where: { schoolId, at: { gte: since } }, select: { area: true, action: true, count: true }, take: 100000 });
  const byFeature: Record<string, number> = {};
  for (const e of usage) { const k = e.area || e.action || "other"; byFeature[k] = (byFeature[k] ?? 0) + (e.count ?? 1); }
  const topFeatures = Object.entries(byFeature).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([area, count]) => ({ area, count }));
  const usageVolume = usage.reduce((s, e) => s + (e.count ?? 1), 0);

  return {
    days, totalUsers, activeUsers, inactiveUsers: totalUsers - activeUsers, suspended, invited, neverLoggedIn,
    byRole, actions, loginCount: loginRows.length, usageVolume, trend, topFeatures, lastLogins,
  };
}
