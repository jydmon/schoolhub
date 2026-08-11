// Pure logic for product-usage analytics (logins + feature usage) for parents,
// teachers and other roles. Operates on plain UsageEvent-like records so it is
// unit-testable without a database. DB flows live in src/lib/usage.ts.
// Unit-tested in tests/phase17b.test.ts.

export type EventLike = {
  userId: string;
  role?: string;
  action: string;       // login | view | export | message_sent | ...
  area?: string | null; // dashboard | reports | transport | ...
  count?: number;
  at: Date | string;
};

function ms(d: Date | string): number { return new Date(d).getTime(); }

/** Per-user rollup: login count, first/last login, distinct active days, total
 *  actions (volume), and the functions (areas/actions) carried out with counts. */
export function summarizeUser(events: EventLike[]) {
  const logins = events.filter((e) => e.action === "login");
  const loginTimes = logins.map((e) => ms(e.at)).sort((a, b) => a - b);
  const days = new Set(events.map((e) => new Date(e.at).toISOString().slice(0, 10)));
  const volume = events.reduce((s, e) => s + (e.count ?? 1), 0);

  const functions: Record<string, number> = {};
  for (const e of events) {
    if (e.action === "login") continue;
    const key = e.area || e.action;
    functions[key] = (functions[key] ?? 0) + (e.count ?? 1);
  }
  const topFunctions = Object.entries(functions)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return {
    userId: events[0]?.userId ?? null,
    role: events.find((e) => e.role)?.role ?? null,
    logins: logins.length,
    firstLogin: loginTimes.length ? new Date(loginTimes[0]) : null,
    lastLogin: loginTimes.length ? new Date(loginTimes[loginTimes.length - 1]) : null,
    activeDays: days.size,
    volume,
    topFunctions,
  };
}

/** Group events by user and summarise each (for a per-user analytics table). */
export function summarizeByUser(events: EventLike[]) {
  const byUser = new Map<string, EventLike[]>();
  for (const e of events) {
    const arr = byUser.get(e.userId) || [];
    arr.push(e);
    byUser.set(e.userId, arr);
  }
  return Array.from(byUser.values())
    .map((evs) => summarizeUser(evs))
    .sort((a, b) => b.volume - a.volume);
}

/** Aggregate volume for a role (e.g. all parents / all teachers). */
export function summarizeRole(events: EventLike[], role: string) {
  const filtered = events.filter((e) => e.role === role);
  const users = new Set(filtered.map((e) => e.userId));
  const logins = filtered.filter((e) => e.action === "login").length;
  const volume = filtered.reduce((s, e) => s + (e.count ?? 1), 0);
  const activeUsers = new Set(filtered.filter((e) => e.action === "login").map((e) => e.userId));
  const functions: Record<string, number> = {};
  for (const e of filtered) {
    if (e.action === "login") continue;
    const key = e.area || e.action;
    functions[key] = (functions[key] ?? 0) + (e.count ?? 1);
  }
  return {
    role,
    users: users.size,
    activeUsers: activeUsers.size,
    logins,
    volume,
    avgLoginsPerUser: users.size ? Math.round((logins / users.size) * 10) / 10 : 0,
    topFunctions: Object.entries(functions).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
  };
}
