// Knowledge Hub helpers: audience parsing and visibility rules.

export function parseAudience(csv: string | null | undefined): string[] {
  return (csv || "").split(",").map((s) => s.trim()).filter(Boolean);
}

type DocLike = {
  status: string;
  archived: boolean;
  audienceRoles: string;
  effectiveDate?: Date | string | null;
  expiryDate?: Date | string | null;
};

function withinDates(doc: DocLike, now: Date): boolean {
  if (doc.effectiveDate && new Date(doc.effectiveDate) > now) return false;
  if (doc.expiryDate && new Date(doc.expiryDate) < now) return false;
  return true;
}

/** Parents normally only see published documents with a parent audience. */
export function docVisibleToParent(doc: DocLike, now = new Date()): boolean {
  if (doc.archived) return false;
  if (doc.status !== "published") return false;
  if (!parseAudience(doc.audienceRoles).includes("parent")) return false;
  return withinDates(doc, now);
}

/** For AI retrieval by staff: approved or published, staff/parent audience. */
export function docSearchableByStaff(doc: DocLike, now = new Date()): boolean {
  if (doc.archived) return false;
  if (!["approved", "published"].includes(doc.status)) return false;
  const aud = parseAudience(doc.audienceRoles);
  if (!aud.includes("staff") && !aud.includes("parent")) return false;
  return withinDates(doc, now);
}

/** Concatenated searchable text for a document. */
export function docText(d: { title: string; description?: string | null; category: string; bodyText?: string | null }): string {
  return [d.title, d.category, d.description || "", d.bodyText || ""].join(" \n ");
}
