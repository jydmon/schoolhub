import { prisma } from "./db";

// Shared "activity history" search over the audit trail, used by both the
// tenant School-Administrator portal (scoped to one school) and the platform
// super-admin portal (all tenants). One query surface, two scopes.

export type HistoryQuery = {
  schoolId?: string | null; // tenant scope — required for tenant, omit for platform
  platform?: boolean;       // platform scope — search across all schools + platform events
  q?: string;               // free-text across action / actor / target / metadata
  action?: string;
  actor?: string;
  targetType?: string;
  from?: string;            // ISO date/datetime (inclusive lower bound)
  to?: string;              // ISO date or datetime (inclusive upper bound)
  take?: number;
};

function endOfDay(v: string): Date {
  // date-only "YYYY-MM-DD" → end of that day; otherwise use as-is.
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(`${v}T23:59:59.999`);
  return new Date(v);
}

function buildWhere(query: HistoryQuery) {
  const where: any = {};
  if (query.platform) {
    // all events — no school filter
  } else {
    where.schoolId = query.schoolId ?? "__none__";
  }
  if (query.action) where.action = query.action;
  if (query.targetType) where.targetType = query.targetType;
  if (query.actor) where.actorEmail = { contains: query.actor, mode: "insensitive" };

  const createdAt: any = {};
  if (query.from) { const d = new Date(query.from); if (!isNaN(d.getTime())) createdAt.gte = d; }
  if (query.to) { const d = endOfDay(query.to); if (!isNaN(d.getTime())) createdAt.lte = d; }
  if (Object.keys(createdAt).length) where.createdAt = createdAt;

  const needle = (query.q || "").trim();
  if (needle) {
    where.OR = [
      { action: { contains: needle, mode: "insensitive" } },
      { actorEmail: { contains: needle, mode: "insensitive" } },
      { targetType: { contains: needle, mode: "insensitive" } },
      { targetId: { contains: needle, mode: "insensitive" } },
      { metadata: { contains: needle, mode: "insensitive" } },
    ];
  }
  return where;
}

export async function searchHistory(query: HistoryQuery) {
  const where = buildWhere(query);
  const take = Math.min(Math.max(query.take ?? 300, 1), 500);
  const entries = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
    include: query.platform ? { school: { select: { name: true } } } : undefined,
  });
  return { entries, count: entries.length, truncated: entries.length === take };
}

// Distinct action names + actors within the scope, to populate filter dropdowns.
export async function historyFacets(scope: { schoolId?: string | null; platform?: boolean }) {
  const scopeWhere = scope.platform ? {} : { schoolId: scope.schoolId ?? "__none__" };
  const [actions, actors] = await Promise.all([
    prisma.auditLog.findMany({ where: scopeWhere, select: { action: true }, distinct: ["action"], orderBy: { action: "asc" }, take: 200 }),
    prisma.auditLog.findMany({ where: { ...scopeWhere, actorEmail: { not: null } }, select: { actorEmail: true }, distinct: ["actorEmail"], orderBy: { actorEmail: "asc" }, take: 200 }),
  ]);
  return {
    actions: actions.map((a) => a.action).filter(Boolean),
    actors: actors.map((a) => a.actorEmail).filter(Boolean) as string[],
  };
}
