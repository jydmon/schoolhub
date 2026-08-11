"use client";

import { useEffect, useState, useCallback } from "react";
import AssistantChat from "@/components/AssistantChat";

const DRAFT_TYPES: [string, string][] = [
  ["parent_notification", "Parent notification"],
  ["event_summary", "Event summary"],
  ["transport_delay", "Transport delay message"],
  ["consent_reminder", "Consent reminder"],
  ["policy_summary", "Policy summary"],
  ["translation", "Translation"],
];
const STAFF_EXAMPLES = ["Which trips are happening today?", "Which policies are due for review?", "Which parents have not completed consent?", "Summarise today's school activities."];

export default function AssistantTab({ schoolId }: { schoolId: string }) {
  const [type, setType] = useState("parent_notification");
  const [prompt, setPrompt] = useState("");
  const [drafts, setDrafts] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const d = await fetch(`/api/ai/drafts?schoolId=${schoolId}`).then((r) => r.json());
    setDrafts(d.drafts ?? []);
  }, [schoolId]);
  useEffect(() => { load(); }, [load]);

  async function generate() {
    setBusy(true);
    await fetch(`/api/ai/draft`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, schoolId, prompt: prompt || undefined }) });
    setPrompt(""); setBusy(false); load();
  }
  async function update(id: string, body: any) {
    await fetch(`/api/ai/drafts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    load();
  }

  const needsPrompt = ["parent_notification", "transport_delay", "translation"].includes(type);

  return (
    <>
      <AssistantChat schoolId={schoolId} examples={STAFF_EXAMPLES} />

      <div className="panel">
        <h2>AI drafting tools</h2>
        <p className="sub">The assistant only drafts. Nothing is sent or changed until you confirm.</p>
        <div className="row">
          <div><label>Draft type</label><select value={type} onChange={(e) => setType(e.target.value)}>{DRAFT_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          {needsPrompt && <div style={{ flex: 3 }}><label>Prompt / content</label><input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={type === "translation" ? "Text to translate…" : "What should it say?"} /></div>}
          <div style={{ display: "flex", alignItems: "flex-end" }}><button disabled={busy} onClick={generate}>{busy ? "…" : "Generate draft"}</button></div>
        </div>
      </div>

      <div className="panel">
        <h2>Drafts awaiting confirmation</h2>
        {drafts.length === 0 && <p className="muted">No drafts yet.</p>}
        {drafts.map((d) => (
          <div key={d.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 12 }}>
            <div className="flex-between">
              <strong>{d.title}</strong>
              <span className={`badge ${d.status === "confirmed" ? "active" : d.status === "discarded" ? "suspended" : "trial"}`}>{d.status}</span>
            </div>
            <textarea defaultValue={d.body} onBlur={(e) => e.target.value !== d.body && update(d.id, { body: e.target.value })} rows={Math.min(10, (d.body.match(/\n/g)?.length || 2) + 2)} style={{ width: "100%", marginTop: 8, padding: 10, border: "1px solid var(--line)", borderRadius: 8, fontSize: 13 }} />
            {d.status === "draft" && (
              <div style={{ marginTop: 8 }}>
                <button className="small" onClick={() => update(d.id, { status: "confirmed" })}>Confirm</button>{" "}
                <button className="small secondary" onClick={() => update(d.id, { status: "discarded" })}>Discard</button>
                <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>Confirming approves the text (sending arrives with the notifications module).</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
