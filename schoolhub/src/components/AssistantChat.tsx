"use client";

import { useState } from "react";

const LANGS: [string, string][] = [["en", "English"], ["fr", "Français"], ["es", "Español"], ["pl", "Polski"], ["ur", "اردو"], ["ar", "العربية"]];

export default function AssistantChat({ schoolId, examples }: { schoolId?: string; examples?: string[] }) {
  const [q, setQ] = useState("");
  const [lang, setLang] = useState("en");
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<any[]>([]);

  async function ask(question?: string) {
    const text = (question ?? q).trim();
    if (!text) return;
    setBusy(true); setQ("");
    try {
      const res = await fetch(`/api/ai/ask`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text, lang, schoolId }) });
      const data = await res.json();
      setTurns((t) => [{ q: text, a: data.answer || data.error || "No answer", citations: data.citations || [], found: data.found }, ...t]);
    } catch {
      setTurns((t) => [{ q: text, a: "Network error", citations: [], found: false }, ...t]);
    } finally { setBusy(false); }
  }

  return (
    <div className="panel">
      <h2>Ask the assistant</h2>
      <p className="sub">Answers come only from information you're authorised to see. Sources are cited; it won't guess.</p>
      <div className="row">
        <div style={{ flex: 4 }}><input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} placeholder="Ask a question…" /></div>
        <div><select value={lang} onChange={(e) => setLang(e.target.value)}>{LANGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div style={{ display: "flex", alignItems: "flex-end" }}><button disabled={busy} onClick={() => ask()}>{busy ? "…" : "Ask"}</button></div>
      </div>
      {examples && examples.length > 0 && (
        <div className="chips" style={{ marginTop: 10 }}>
          {examples.map((ex) => <button key={ex} className="secondary small" onClick={() => ask(ex)}>{ex}</button>)}
        </div>
      )}
      <div style={{ marginTop: 16 }}>
        {turns.map((t, i) => (
          <div key={i} style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 12 }}>
            <div style={{ fontWeight: 700 }}>{t.q}</div>
            <div style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{renderMd(t.a)}</div>
            {t.citations?.length > 0 && (
              <div className="chips" style={{ marginTop: 8 }}>
                <span className="muted" style={{ fontSize: 12 }}>Sources:</span>
                {t.citations.map((c: any, j: number) => (
                  <span key={j} className="chip" title={c.source}>{c.url ? <a href={c.url} target="_blank" rel="noreferrer">{c.title}</a> : c.title}{c.date ? ` · ${new Date(c.date).toLocaleDateString("en-GB")}` : ""}</span>
                ))}
              </div>
            )}
            {!t.found && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>No matching school information found.</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// Minimal **bold** rendering so the composed answers read nicely.
function renderMd(text: string) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>));
}
