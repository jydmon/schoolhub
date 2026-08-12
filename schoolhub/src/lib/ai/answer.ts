import { SourceRecord } from "./retrieval";
import { LANGUAGES } from "../constants";

const STOPWORDS = new Set("a an the is are was were do does did what when where who how why my our your their for to of on in at do i my need tomorrow today this week there any will can list show give me all please tell about".split(/\s+/));

// Canonicalise synonyms so pupil/student/child, staff/teacher, parent/guardian
// all match, and singular/plural are equivalent (light plural stripping).
const SYN: Record<string, string> = {
  pupil: "student", child: "student", kid: "student", learner: "student", student: "student",
  teacher: "staff", staff: "staff", employee: "staff",
  guardian: "parent", carer: "parent", parent: "parent",
  bus: "transport", coach: "transport", route: "transport", transport: "transport",
  menu: "meal", meal: "meal", lunch: "meal", dinner: "meal", food: "meal",
  trip: "trip", excursion: "trip", visit: "trip",
  behaviour: "behaviour", merit: "behaviour", detention: "behaviour", incident: "behaviour", reward: "behaviour",
  policy: "document", document: "document", allergy: "allergy", allergies: "allergy", allergen: "allergy",
};
function canon(t: string): string {
  let w = t;
  if (w.length > 3 && w.endsWith("es")) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s")) w = w.slice(0, -1);
  return SYN[w] || SYN[t] || w;
}

function tokenize(s: string): string[] {
  return (s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(canon);
}

export type Ranked = { record: SourceRecord; score: number };

/** Keyword relevance with title weighting and light recency boost. */
export function rank(records: SourceRecord[], question: string, k = 6): Ranked[] {
  const q = tokenize(question);
  if (q.length === 0) return [];
  const now = Date.now();
  const scored = records.map((record) => {
    const title = new Set(tokenize(record.title));
    const body = tokenize(record.text);
    let score = 0;
    for (const t of q) {
      if (title.has(t)) score += 3;
      if (body.includes(t)) score += 1;
    }
    // Upcoming events / recent newsletters get a small nudge.
    if (score > 0 && record.date) {
      const days = Math.abs((+new Date(record.date) - now) / 86400000);
      if (days < 14) score += 1;
    }
    return { record, score };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
}

function fmtDate(d: Date | null): string {
  if (!d) return "no date";
  return new Date(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
function fmtDateTime(d: Date | null): string {
  if (!d) return "no date";
  return new Date(d).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export type Answer = { answer: string; citations: any[]; found: boolean; verbatim?: boolean };

/**
 * Compose a grounded answer purely from retrieved records. No fabrication: every
 * claim comes from a cited record. Marks clearly what is school information.
 */
export function composeAnswer(question: string, ranked: Ranked[], opts: { lang?: string; isStaff?: boolean } = {}): Answer {
  const lang = opts.lang || "en";
  const langNote = lang !== "en"
    ? `\n\n_(Answering in English. Connect an AI model key to receive answers in ${LANGUAGES[lang] || lang}.)_`
    : "";

  if (ranked.length === 0) {
    return {
      answer: `I couldn't find anything about that in the school information you're allowed to see. I won't guess — please check with the school office, or rephrase your question.${langNote}`,
      citations: [],
      found: false,
    };
  }

  const lines: string[] = ["Here's what I found in your school information:\n"];
  const citations: any[] = [];
  for (const { record } of ranked.slice(0, 4)) {
    const r = record;
    let line = "";
    if (r.type === "event") line = `• **${r.title}** — ${fmtDateTime(r.date)}${r.text.includes("Location:") ? ` (${r.text.split("Location:")[1].split(".")[0].trim()})` : ""}.`;
    else if (r.type === "homework") line = `• **Homework: ${r.title}** — due ${fmtDate(r.date)}.`;
    else {
      const snippet = (r.text || "").replace(/\s+/g, " ").slice(0, 220);
      line = `• **${r.title}** (${r.sourceLabel}, effective ${fmtDate(r.date)}): ${snippet}${snippet.length >= 220 ? "…" : ""}`;
    }
    lines.push(line);
    citations.push({ title: r.title, type: r.type, source: r.sourceLabel, date: r.date, url: r.url });
  }

  lines.push(`\n_Source: SIPlat records above (school information, not an AI opinion). If something looks out of date, the school's published version is authoritative._${langNote}`);

  return { answer: lines.join("\n"), citations, found: true };
}
