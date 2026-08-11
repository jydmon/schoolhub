import { Ranked } from "./answer";

// Optional LLM backend. If OPENAI_API_KEY is set, the assistant asks the model
// to phrase a grounded answer (and translate to the requested language) using
// ONLY the retrieved context. With no key, this returns null and the caller
// uses the deterministic composer instead — so the app runs fully offline.
//
// The model is never given data outside the permission-filtered context, and is
// instructed not to invent facts. Citations are always computed separately from
// the retrieved records, regardless of which path produced the prose.

export async function maybeLlmAnswer(question: string, ranked: Ranked[], lang: string): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key || ranked.length === 0) return null;

  const context = ranked
    .map((r, i) => `[${i + 1}] (${r.record.type}, ${r.record.sourceLabel}, ${r.record.date ? new Date(r.record.date).toISOString().slice(0, 10) : "no date"}) ${r.record.title}: ${r.record.text}`)
    .join("\n");

  const system = [
    "You are SchoolHub's assistant. Answer ONLY from the numbered CONTEXT.",
    "If the answer is not in the context, say you couldn't find it — never guess.",
    "Cite the [number] of each source you use. Keep school facts separate from any suggestion.",
    lang && lang !== "en" ? `Reply in ${lang}.` : "Reply in English.",
  ].join(" ");

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: `CONTEXT:\n${context}\n\nQUESTION: ${question}` },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}
