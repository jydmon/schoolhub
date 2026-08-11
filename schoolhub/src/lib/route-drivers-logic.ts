// Pure logic for assigning one or more drivers to a route. Validates the roster
// (roles, sessions, exactly one primary, no duplicate driver+session) and picks
// the effective driver for a given session/day. DB flows live in
// src/lib/transport.ts. Unit-tested in tests/crm.test.ts.

export type DriverAssignment = {
  driverUserId: string;
  role?: string;    // primary | relief | secondary
  session?: string; // all | am | pm
};

export const DRIVER_ROLES = ["primary", "relief", "secondary"] as const;
export const DRIVER_SESSIONS = ["all", "am", "pm"] as const;

export function normalizeAssignments(list: DriverAssignment[]): DriverAssignment[] {
  const out: DriverAssignment[] = [];
  const seen = new Set<string>();
  for (const a of list) {
    const driverUserId = String(a.driverUserId || "").trim();
    if (!driverUserId) continue;
    const role = (DRIVER_ROLES as readonly string[]).includes(a.role || "") ? a.role! : "relief";
    const session = (DRIVER_SESSIONS as readonly string[]).includes(a.session || "") ? a.session! : "all";
    const key = `${driverUserId}:${session}`;
    if (seen.has(key)) continue; // no duplicate driver in the same session
    seen.add(key);
    out.push({ driverUserId, role, session });
  }
  return out;
}

/** Validate a roster. Rules: at least one driver; at most one primary; a driver
 *  may not hold both an "all" session and an am/pm session (ambiguous). */
export function validateRoster(list: DriverAssignment[]): { ok: boolean; reason: string; assignments: DriverAssignment[] } {
  const assignments = normalizeAssignments(list);
  if (assignments.length === 0) return { ok: false, reason: "at least one driver required", assignments };
  const primaries = assignments.filter((a) => a.role === "primary");
  if (primaries.length > 1) return { ok: false, reason: "only one primary driver allowed", assignments };
  // Ensure a driver isn't both "all" and a specific session.
  const byDriver = new Map<string, Set<string>>();
  for (const a of assignments) {
    const s = byDriver.get(a.driverUserId) || new Set<string>();
    s.add(a.session!);
    byDriver.set(a.driverUserId, s);
  }
  for (const [, sessions] of byDriver) {
    if (sessions.has("all") && (sessions.has("am") || sessions.has("pm"))) {
      return { ok: false, reason: "a driver cannot be assigned to both 'all' and a specific session", assignments };
    }
  }
  return { ok: true, reason: "ok", assignments };
}

/** If no primary is set, promote the first assignment so a route always has one. */
export function ensurePrimary(list: DriverAssignment[]): DriverAssignment[] {
  const assignments = normalizeAssignments(list);
  if (assignments.some((a) => a.role === "primary")) return assignments;
  if (assignments.length) assignments[0] = { ...assignments[0], role: "primary" };
  return assignments;
}

/** The driver who should run a given session (am/pm), preferring a session-
 *  specific assignment, then the primary, then any "all" assignment. */
export function effectiveDriver(list: DriverAssignment[], session: "am" | "pm"): string | null {
  const a = normalizeAssignments(list);
  const specific = a.find((x) => x.session === session);
  if (specific) return specific.driverUserId;
  const primary = a.find((x) => x.role === "primary" && (x.session === "all"));
  if (primary) return primary.driverUserId;
  const anyAll = a.find((x) => x.session === "all");
  return anyAll?.driverUserId ?? null;
}

/** The primary driver id for Route.driverUserId back-compat. */
export function primaryDriver(list: DriverAssignment[]): string | null {
  const a = ensurePrimary(list);
  return a.find((x) => x.role === "primary")?.driverUserId ?? null;
}
