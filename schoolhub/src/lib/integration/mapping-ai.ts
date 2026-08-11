// AI-assisted field-mapping recommendation service.
//
// This is a *recommendation* engine, not an importer: it inspects external
// field names and sample values and proposes likely SchoolHub targets with a
// confidence score. It never mutates data and its output must be approved by an
// administrator before a mapping is saved (see spec §10). The scoring is a
// deterministic heuristic (name-token similarity + synonym hits + value-shape
// agreement) so results are explainable and testable; it can be swapped for an
// LLM call behind the same interface without changing callers.

export type TargetField = {
  key: string;          // canonical internal field, e.g. "student.firstName"
  label: string;
  object: string;       // student | guardian | staff | class | event | reward | transport
  synonyms: string[];   // lower-case tokens/phrases that hint at this field
  shape?: "email" | "phone" | "date" | "number" | "boolean" | "name";
};

export const TARGET_FIELDS: TargetField[] = [
  { key: "student.reference", label: "Student reference / ID", object: "student", synonyms: ["reference", "student id", "admission number", "admissionno", "upn", "pupil id", "schoolid", "adno"] },
  { key: "student.firstName", label: "Student first name", object: "student", synonyms: ["first name", "forename", "given name", "legal forename", "firstname"], shape: "name" },
  { key: "student.lastName", label: "Student last name", object: "student", synonyms: ["last name", "surname", "family name", "legal surname", "lastname"], shape: "name" },
  { key: "student.fullName", label: "Student full name", object: "student", synonyms: ["student name", "pupil name", "name", "full name"], shape: "name" },
  { key: "student.dateOfBirth", label: "Student date of birth", object: "student", synonyms: ["dob", "date of birth", "birth date", "born"], shape: "date" },
  { key: "student.yearGroup", label: "Year group", object: "student", synonyms: ["year", "year group", "ncyear", "yeargroup", "nc year"] },
  { key: "student.class", label: "Class / tutor group", object: "student", synonyms: ["class", "form", "tutor group", "reg group", "registration form", "tutorgroup", "reggroup"] },
  { key: "student.house", label: "House", object: "student", synonyms: ["house"] },
  { key: "guardian.fullName", label: "Guardian full name", object: "guardian", synonyms: ["parent name", "guardian name", "contact name", "parent"], shape: "name" },
  { key: "guardian.email", label: "Guardian email", object: "guardian", synonyms: ["parent email", "guardian email", "email", "contact email", "e-mail"], shape: "email" },
  { key: "guardian.phone", label: "Guardian telephone", object: "guardian", synonyms: ["parent mobile", "parent phone", "guardian telephone", "mobile", "telephone", "phone", "contact number", "tel"], shape: "phone" },
  { key: "guardian.relationship", label: "Relationship to child", object: "guardian", synonyms: ["relationship", "relation"] },
  { key: "staff.email", label: "Staff email", object: "staff", synonyms: ["staff email", "teacher email", "email"], shape: "email" },
  { key: "staff.reference", label: "Staff reference", object: "staff", synonyms: ["staff id", "staff code", "employee id", "reference"] },
  { key: "class.name", label: "Class name", object: "class", synonyms: ["class", "class name", "group"] },
  { key: "event.title", label: "Event title", object: "event", synonyms: ["title", "summary", "subject", "event", "event name"] },
  { key: "event.startsAt", label: "Event start", object: "event", synonyms: ["start", "start date", "start time", "starts", "begin", "date"], shape: "date" },
  { key: "event.location", label: "Event location", object: "event", synonyms: ["location", "venue", "room", "place"] },
  { key: "reward.points", label: "Reward points", object: "reward", synonyms: ["points", "merit total", "merits", "reward points", "score"], shape: "number" },
  { key: "reward.category", label: "Reward type", object: "reward", synonyms: ["reward type", "category", "type", "reason"] },
  { key: "transport.pickup", label: "Morning pickup location", object: "transport", synonyms: ["pickup point", "pick up", "pickup", "morning pickup", "collection point", "stop"] },
  { key: "transport.route", label: "Transport route", object: "transport", synonyms: ["route", "bus route", "route name"] },
];

export type FieldSample = { name: string; samples?: string[] };
export type Suggestion = { internalField: string; label: string; confidence: number; reason: string };
export type MappingRecommendation = {
  externalField: string;
  suggestion: Suggestion | null;
  alternatives: Suggestion[];
  uncertain: boolean; // confidence below the review threshold
};

const STOP = new Set(["the", "a", "of", "for", "to", "s"]);

export function tokenize(name: string): string[] {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2") // camelCase → words
    .replace(/[_\-.]+/g, " ")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t));
}

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a), B = new Set(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

// Value-shape detectors for sample-based confidence boosts.
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RE_PHONE = /^\+?[\d][\d\s().-]{5,}$/;
const RE_DATE = /^(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}|\d{4}-\d{2}-\d{2})/;
const RE_NUMBER = /^-?\d+(\.\d+)?$/;
const RE_BOOL = /^(true|false|yes|no|y|n|0|1)$/i;

export function detectShape(samples: string[] | undefined): TargetField["shape"] | "text" | null {
  const vals = (samples || []).map((s) => (s || "").trim()).filter(Boolean).slice(0, 20);
  if (vals.length === 0) return null;
  const frac = (re: RegExp) => vals.filter((v) => re.test(v)).length / vals.length;
  if (frac(RE_EMAIL) >= 0.8) return "email";
  if (frac(RE_DATE) >= 0.8) return "date";
  if (frac(RE_BOOL) >= 0.8) return "boolean";
  if (frac(RE_PHONE) >= 0.8) return "phone";
  if (frac(RE_NUMBER) >= 0.8) return "number";
  if (vals.every((v) => /^[A-Za-z ,'-]+$/.test(v)) && vals.some((v) => v.includes(" "))) return "name";
  return "text";
}

function scoreField(ext: FieldSample, target: TargetField): { score: number; reason: string } {
  const extTokens = tokenize(ext.name);
  const extPhrase = extTokens.join(" ");

  // 1) Name similarity: best of synonym match and label/key token jaccard.
  let nameScore = 0;
  let matchedSyn = "";
  for (const syn of target.synonyms) {
    if (extPhrase === syn) { nameScore = Math.max(nameScore, 1); matchedSyn = syn; }
    else if (extPhrase.includes(syn) || syn.includes(extPhrase)) { nameScore = Math.max(nameScore, 0.82); matchedSyn = syn; }
    else nameScore = Math.max(nameScore, jaccard(extTokens, tokenize(syn)) * 0.9);
  }
  nameScore = Math.max(nameScore, jaccard(extTokens, tokenize(target.label)) * 0.7);

  // 2) Value-shape agreement (only ever a bonus / mild penalty).
  let shapeAdj = 0;
  let shapeReason = "";
  if (target.shape) {
    const shape = detectShape(ext.samples);
    if (shape && shape === target.shape) { shapeAdj = 0.15; shapeReason = `values look like ${target.shape}`; }
    else if (shape && shape !== "text" && shape !== target.shape) { shapeAdj = -0.1; }
  }

  const score = Math.max(0, Math.min(1, nameScore + shapeAdj));
  const reasonBits = [];
  if (matchedSyn && nameScore >= 0.8) reasonBits.push(`name matches "${matchedSyn}"`);
  else if (nameScore > 0) reasonBits.push("name is similar");
  if (shapeReason) reasonBits.push(shapeReason);
  return { score, reason: reasonBits.join("; ") || "weak signal" };
}

/**
 * Recommend a SchoolHub target for each external field. `objectFilter` narrows
 * to one object's fields (e.g. only "student" targets). `threshold` is the
 * confidence below which a suggestion is flagged uncertain for review.
 */
export function suggestMappings(
  externalFields: FieldSample[],
  opts: { objectFilter?: string; threshold?: number } = {}
): MappingRecommendation[] {
  const threshold = opts.threshold ?? 0.55;
  const targets = opts.objectFilter ? TARGET_FIELDS.filter((t) => t.object === opts.objectFilter) : TARGET_FIELDS;

  return externalFields.map((ext) => {
    const ranked = targets
      .map((t) => ({ t, ...scoreField(ext, t) }))
      .sort((a, b) => b.score - a.score)
      .filter((r) => r.score > 0.2)
      .slice(0, 3)
      .map((r) => ({ internalField: r.t.key, label: r.t.label, confidence: Math.round(r.score * 100) / 100, reason: r.reason }));

    const suggestion = ranked[0] ?? null;
    return {
      externalField: ext.name,
      suggestion,
      alternatives: ranked.slice(1),
      uncertain: !suggestion || suggestion.confidence < threshold,
    };
  });
}
