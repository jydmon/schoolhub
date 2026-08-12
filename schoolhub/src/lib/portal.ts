import { ROLES } from "./constants";

// Roles whose home is the full School portal (admin views, or the lightweight
// "Member" account view for support staff). Everyone else has a dedicated portal.
const SCHOOL_PORTAL_ROLES: string[] = [ROLES.SCHOOL_ADMIN, ROLES.SCHOOL_LEADER, ROLES.SUPPORT_STAFF];

/**
 * The dedicated portal a set of roles should resolve to. Returns a path for a
 * specialist portal (teacher / transport manager / driver / parent), or null
 * when the user belongs in the School portal (or has no recognised specialist
 * role). A management role always wins, so a user who is both an admin and a
 * driver stays in the School portal.
 *
 * This is the single source of truth for "where does this person land?", used
 * by the root redirect AND the school entry points so a specialist can never be
 * dropped onto the wrong portal.
 */
export function specialistPortalPath(roles: string[]): string | null {
  if (roles.some((r) => SCHOOL_PORTAL_ROLES.includes(r))) return null;
  if (roles.includes(ROLES.TEACHER)) return "/teacher";
  if (roles.includes(ROLES.TRANSPORT_MANAGER)) return "/transport";
  if (roles.includes(ROLES.DRIVER)) return "/driver";
  if (roles.includes(ROLES.PARENT)) return "/parent";
  return null;
}
