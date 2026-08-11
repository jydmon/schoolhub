// Pure logic for PII protection. Pupil-identifying fields (names, DOB, contact
// details, address) are encrypted at rest (see pii.ts) and, critically, are
// NEVER shown to platform (SIPlat) staff — including during troubleshooting —
// unless the school's tenant admin grants a time-boxed, audited unmask. Parents
// and teachers (in-tenant, authorised) always see the real values. This module
// holds the masking + access-decision rules; crypto lives in pii.ts.
// Unit-tested in tests/phase17c.test.ts.

// Roles that legitimately see pupil PII (inside their own tenant).
const IN_TENANT_PII_ROLES = ["Parent", "Teacher", "SchoolAdministrator", "SchoolLeader"];

export type PiiActor = {
  isPlatformStaff: boolean;   // SIPlat internal staff / super admin
  roles?: string[];           // tenant roles the actor holds in the relevant school
};

export type UnmaskGrant = {
  schoolId: string;
  grantedByUserId: string;    // the tenant admin who granted it
  grantedToUserId: string;    // the platform staff member
  expiresAt: Date | string;
  scope?: string;             // e.g. "troubleshooting:ticket-123"
};

/** Can this actor see raw pupil PII for a school right now? */
export function canSeePII(actor: PiiActor, opts: { schoolId?: string; grant?: UnmaskGrant | null; now?: Date } = {}): boolean {
  const now = opts.now ?? new Date();
  // In-tenant authorised roles always see PII for their school.
  if (!actor.isPlatformStaff && (actor.roles ?? []).some((r) => IN_TENANT_PII_ROLES.includes(r))) return true;
  // Platform staff: only with a valid, unexpired, school-matched grant.
  if (actor.isPlatformStaff && opts.grant) {
    const g = opts.grant;
    const matchesSchool = !opts.schoolId || g.schoolId === opts.schoolId;
    const live = new Date(g.expiresAt).getTime() > now.getTime();
    return matchesSchool && live;
  }
  return false;
}

/** Mask a person's name: keep initials, hide the rest. "Ella Blake" -> "E•••• B••••". */
export function maskName(name?: string | null): string {
  const n = String(name ?? "").trim();
  if (!n) return "•••";
  return n.split(/\s+/).map((part) => {
    if (part.length <= 1) return part.toUpperCase();
    return part[0].toUpperCase() + "•".repeat(Math.min(part.length - 1, 4));
  }).join(" ");
}

/** Mask a field by kind. Reveals just enough to be useful for support. */
export function maskField(value: string | null | undefined, kind: "email" | "phone" | "dob" | "address" | "generic" = "generic"): string {
  const v = String(value ?? "").trim();
  if (!v) return "";
  switch (kind) {
    case "email": {
      const [local, domain] = v.split("@");
      if (!domain) return "•••";
      return (local?.[0] ?? "•") + "•••@" + domain.replace(/^[^.]+/, (m) => m[0] + "•••");
    }
    case "phone": {
      const digits = v.replace(/\D/g, "");
      return digits.length >= 4 ? "•••••" + digits.slice(-4) : "••••";
    }
    case "dob": return "••/••/••••";
    case "address": return "••• (hidden)";
    default: return v.length <= 2 ? "••" : v[0] + "•".repeat(Math.min(v.length - 1, 6));
  }
}

// Fields considered PII on a pupil record.
export const PII_FIELDS = ["fullName", "firstName", "lastName", "dob", "email", "phone", "homeAddress", "guardianName"] as const;

/** Return a view of a pupil record for an actor: raw if permitted, else masked. */
export function viewPupil<T extends Record<string, any>>(pupil: T, actor: PiiActor, opts: { schoolId?: string; grant?: UnmaskGrant | null; now?: Date } = {}): T & { _piiMasked: boolean } {
  if (canSeePII(actor, opts)) return { ...pupil, _piiMasked: false };
  const out: any = { ...pupil, _piiMasked: true };
  for (const f of ["fullName", "firstName", "lastName", "guardianName"]) if (f in out) out[f] = maskName(out[f]);
  if ("email" in out) out.email = maskField(out.email, "email");
  if ("phone" in out) out.phone = maskField(out.phone, "phone");
  if ("dob" in out) out.dob = maskField(out.dob, "dob");
  if ("homeAddress" in out) out.homeAddress = maskField(out.homeAddress, "address");
  return out;
}

/** Whether a grant request is well-formed and in the future. */
export function validateGrant(g: Partial<UnmaskGrant>, now = new Date()): { ok: boolean; reason: string } {
  if (!g.schoolId) return { ok: false, reason: "schoolId required" };
  if (!g.grantedToUserId) return { ok: false, reason: "grantee required" };
  if (!g.expiresAt || new Date(g.expiresAt).getTime() <= now.getTime()) return { ok: false, reason: "expiry must be in the future" };
  return { ok: true, reason: "ok" };
}
