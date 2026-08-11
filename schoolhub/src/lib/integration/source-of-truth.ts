// Source-of-truth enforcement. Every data object/domain has an owner; SchoolHub
// must not overwrite externally-owned data unless write-back is explicitly
// enabled AND supported AND permitted AND logged AND approved (spec §8). This
// module centralises that decision so import/sync paths can't bypass it.

export type Owner =
  | "SchoolHub" | "School MIS" | "Behaviour system" | "Learning platform"
  | "Payment platform" | "GPS provider" | "Document repository"
  | "Calendar system" | "Other";

// Default ownership per data domain (matches spec §8 examples). Schools can
// override these in the source-of-truth registry (SourceOfTruth rows).
export const DEFAULT_OWNERSHIP: Record<string, Owner> = {
  identity: "School MIS",
  attendance: "School MIS",
  rewards: "Behaviour system",
  behaviour: "Behaviour system",
  homework: "Learning platform",
  payment: "Payment platform",
  gps: "GPS provider",
  docs: "Document repository",
  calendar: "Calendar system",
  journey: "SchoolHub",
  notification: "SchoolHub",
  home_reward_rule: "SchoolHub",
};

export type WriteContext = {
  domain: string;
  owner: Owner;                 // resolved owner for this domain (from registry)
  direction: "in" | "out" | "both"; // mapping direction being applied
  connectorSupportsWriteBack: boolean;
  writeBackEnabled: boolean;    // toggled on the integration
  userHasPermission: boolean;
  schoolApproved: boolean;      // config approved for this connector
};

export type WriteDecision = { allowed: boolean; reason: string };

/**
 * Decide whether SchoolHub may write a value OUT to (or overwrite data owned by)
 * an external system. Inbound reads (direction "in", SchoolHub not the owner)
 * are always allowed to update the SchoolHub copy; the gated case is writing to
 * externally-owned data.
 */
export function canWriteBack(ctx: WriteContext): WriteDecision {
  // Writing INTO SchoolHub from a source that owns the domain is always fine.
  if (ctx.direction === "in") return { allowed: true, reason: "inbound update to SchoolHub copy" };

  // SchoolHub owns it → no external write-back concept applies.
  if (ctx.owner === "SchoolHub") return { allowed: true, reason: "SchoolHub owns this domain" };

  // Outbound / bidirectional to an externally-owned domain: every gate must pass.
  if (!ctx.connectorSupportsWriteBack) return { allowed: false, reason: "connector does not support write-back" };
  if (!ctx.writeBackEnabled) return { allowed: false, reason: "write-back is disabled for this connector" };
  if (!ctx.userHasPermission) return { allowed: false, reason: "user lacks write-back permission" };
  if (!ctx.schoolApproved) return { allowed: false, reason: "connector configuration not approved by the school" };
  return { allowed: true, reason: "write-back permitted (supported, enabled, approved, logged)" };
}

/** Whether an inbound value from `sourceOwner` may overwrite the SchoolHub field. */
export function canInboundOverwrite(domainOwner: Owner, sourceOwner: Owner): boolean {
  // Only the owning system's data overwrites SchoolHub's copy of that domain.
  return domainOwner === sourceOwner;
}

export function resolveOwner(domain: string, override?: string | null): Owner {
  if (override && override.trim()) return override as Owner;
  return DEFAULT_OWNERSHIP[domain] ?? "SchoolHub";
}
