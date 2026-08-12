"use client";

import { useCallback, useEffect, useState } from "react";

const LANGS: [string, string][] = [["en", "English"], ["fr", "Français"], ["es", "Español"], ["pl", "Polski"], ["ur", "اردو"], ["ar", "العربية"]];

export default function AssistantChat({ schoolId, examples }: { schoolId?: string; examples?: string[] }) {
  const [q, setQ] = useState("");
  const [lang, setLang] = useState("en");
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const loadHistory = useCallback(async () => {
    try { const d = await fetch(`/api/ai/history${schoolId ? `?schoolId=${schoolId}` : ""}`).then((r) => r.json()); setHistory(d.items ?? []); }
    catch { /* ignore */ }
  }, [schoolId]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  async function ask(question?: string) {
    const text = (question ?? q).trim();
    if (!text) return;
    setBusy(true); setQ("");
    try {
      const res = await fetch(`/api/ai/ask`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text, lang, schoolId }) });
      const data = await res.json();
      setTurns((t) => [{ q: text, a: data.answer || data.error || "No answer", citations: data.citations || [], found: data.found }, ...t]);
      loadHistory();
    } catch {
      setTurns((t) => [{ q: text, a: "Network error", citations: [], found: false }, ...t]);
    } finally { setBusy(false); }
  }
  async function delOne(id: string) { await fetch(`/api/ai/history?id=${id}`, { method: "DELETE" }); loadHistory(); }
  async function clearAll() { await fetch(`/api/ai/history?all=1`, { method: "DELETE" }); setHistory([]); }

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

      {history.length > 0 && (
        <div style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
          <div className="flex-between">
            <button className="linklike" style={{ fontSize: 13 }} onClick={() => setShowHistory((v) => !v)}>{showHistory ? "▾" : "▸"} Recent searches ({history.length})</button>
            {showHistory && <button className="secondary small" onClick={clearAll}>Clear all</button>}
          </div>
          {showHistory && (
            <div style={{ marginTop: 8 }}>
              {history.map((h) => (
                <div key={h.id} className="flex-between" style={{ padding: "5px 0", gap: 8 }}>
                  <button className="linklike" style={{ fontSize: 13, textAlign: "left" }} title={h.answer} onClick={() => ask(h.question)}>{h.question}</button>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <span className="mono muted" style={{ fontSize: 11 }}>{new Date(h.createdAt).toLocaleDateString([], { day: "numeric", month: "short" })}</span>
                    <button className="linklike" style={{ fontSize: 12, color: "var(--danger)" }} onClick={() => delOne(h.id)} title="Delete this search">✕</button>
                  </span>
                </div>
              ))}
            </div>
          )}
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
