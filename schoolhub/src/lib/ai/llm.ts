import { Ranked } from "./answer";
import { llmComplete } from "./provider";

// Optional LLM phrasing for the assistant. If a provider is configured (saved
// AiConfig or env fallback), the model phrases a grounded answer — and, if
// asked, translates it — using ONLY the retrieved, permission-filtered context.
// With no provider this returns null and the caller uses the deterministic
// composer, so the app runs fully offline.
//
// The model is never given data outside the permission-filtered context, and is
// instructed not to invent facts. Citations are always computed separately from
// the retrieved records, regardless of which path produced the prose.

export async function maybeLlmAnswer(question: string, ranked: Ranked[], lang: string): Promise<string | null> {
  if (ranked.length === 0) return null;

  const context = ranked
    .map((r, i) => `[${i + 1}] (${r.record.type}, ${r.record.sourceLabel}, ${r.record.date ? new Date(r.record.date).toISOString().slice(0, 10) : "no date"}) ${r.record.title}: ${r.record.text}`)
    .join("\n");

  const system = [
    "You are SIPlat's assistant. Answer ONLY from the numbered CONTEXT.",
    "If the answer is not in the context, say you couldn't find it — never guess.",
    "Cite the [number] of each source you use. Keep school facts separate from any suggestion.",
    lang && lang !== "en" ? `Reply in ${lang}.` : "Reply in English.",
  ].join(" ");

  return llmComplete(system, `CONTEXT:\n${context}\n\nQUESTION: ${question}`);
}
