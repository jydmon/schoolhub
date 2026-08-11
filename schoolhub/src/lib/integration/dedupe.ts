// Duplicate detection for imported records. Produces a match score and a
// classification: "unambiguous" (safe to auto-link/merge only if the school has
// enabled it), "candidate" (goes to a review queue) or "distinct". Sensitive
// student/parent records are never auto-merged unless unambiguous AND the school
// opted in (enforced by the caller, guided by `classify`).

export type PersonRecord = {
  externalId?: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string; // ISO
};

function norm(s?: string): string { return (s || "").trim().toLowerCase(); }
function digits(s?: string): string { return (s || "").replace(/\D/g, ""); }

export type MatchResult = { score: number; signals: string[]; classification: "unambiguous" | "candidate" | "distinct" };

/**
 * Score two records 0..1. Strong identifiers (external id, email, phone+DOB)
 * push toward "unambiguous"; name-only agreement is a "candidate" for review.
 */
export function matchPeople(a: PersonRecord, b: PersonRecord): MatchResult {
  const signals: string[] = [];
  let score = 0;

  if (a.externalId && b.externalId && norm(a.externalId) === norm(b.externalId)) {
    signals.push("external id");
    score = Math.max(score, 1);
  }
  if (a.email && b.email && norm(a.email) === norm(b.email)) {
    signals.push("email");
    score = Math.max(score, 0.95);
  }
  const sameName = a.firstName && a.lastName && norm(a.firstName) === norm(b.firstName) && norm(a.lastName) === norm(b.lastName);
  const sameDob = a.dateOfBirth && b.dateOfBirth && a.dateOfBirth === b.dateOfBirth;
  const samePhone = a.phone && b.phone && digits(a.phone).length >= 7 && digits(a.phone).slice(-9) === digits(b.phone).slice(-9);

  if (sameName && sameDob) { signals.push("name + date of birth"); score = Math.max(score, 0.9); }
  if (sameName && samePhone) { signals.push("name + phone"); score = Math.max(score, 0.85); }
  if (samePhone) { signals.push("phone"); score = Math.max(score, 0.6); }
  if (sameName && !sameDob && !samePhone) { signals.push("name only"); score = Math.max(score, 0.5); }

  const classification: MatchResult["classification"] =
    score >= 0.9 ? "unambiguous" : score >= 0.5 ? "candidate" : "distinct";
  return { score: Math.round(score * 100) / 100, signals, classification };
}

/** Find the best existing match for `incoming` among `existing`. */
export function findDuplicate(incoming: PersonRecord, existing: PersonRecord[]): { index: number; match: MatchResult } | null {
  let best: { index: number; match: MatchResult } | null = null;
  existing.forEach((e, index) => {
    const match = matchPeople(incoming, e);
    if (match.classification !== "distinct" && (!best || match.score > best.match.score)) {
      best = { index, match };
    }
  });
  return best;
}

/** Whether an auto-merge is permitted: only unambiguous AND school opted in. */
export function mayAutoMerge(match: MatchResult, schoolAutoMergeEnabled: boolean): boolean {
  return match.classification === "unambiguous" && schoolAutoMergeEnabled;
}
