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

/** System usage totals for the platform (volume, logins, active users, by area). */
export async function systemUsage(days = 30) {
  const events = await prisma.usageEvent.findMany({ where: { at: { gte: sinceDate(days) } }, take: 100000 });
  const volume = events.reduce((s, e) => s + (e.count ?? 1), 0);
  const logins = events.filter((e) => e.action === "login").length;
  const activeUsers = new Set(events.filter((e) => e.action === "login").map((e) => e.userId)).size;
  const byArea: Record<string, number> = {};
  for (const e of events) { if (e.area) byArea[e.area] = (byArea[e.area] ?? 0) + (e.count ?? 1); }
  return { volume, logins, activeUsers, byArea };
}
