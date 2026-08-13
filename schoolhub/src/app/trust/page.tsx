"use client";

import { useEffect, useMemo, useState } from "react";

// Public Trust Centre — no authentication. Lists the platform's published
// trust/compliance/security/privacy documents for prospective customers,
// auditors and the public. Fed by /api/public/trust.

const CAT_LABEL: Record<string, string> = {
  policy: "Policies", security: "Security", privacy: "Privacy", compliance: "Compliance",
  terms: "Terms", certification: "Certifications", subprocessor: "Sub-processors", other: "Other",
};
const CAT_ORDER = ["security", "privacy", "compliance", "certification", "subprocessor", "terms", "policy", "other"];

const C = {
  brand: "#4F46E5", ink: "#0F172A", muted: "#64748B", line: "#E5E9F2", bg: "#F7F9FC", panel: "#FFFFFF",
};

export default function TrustCentrePage() {
  const [docs, setDocs] = useState<any[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    fetch("/api/public/trust").then((r) => r.json()).then((d) => setDocs(d.documents || [])).catch(() => { setErr(true); setDocs([]); });
  }, []);

  const grouped = useMemo(() => {
    const g: Record<string, any[]> = {};
    for (const d of docs || []) (g[d.category] = g[d.category] || []).push(d);
    return CAT_ORDER.filter((c) => g[c]?.length).map((c) => ({ category: c, items: g[c] }));
  }, [docs]);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: "system-ui,-apple-system,Segoe UI,Roboto,sans-serif" }}>
      <header style={{ background: `linear-gradient(135deg, ${C.brand}, #0EA5E9)`, color: "#fff", padding: "48px 20px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{ fontSize: 13, opacity: 0.85, fontWeight: 700, letterSpacing: 1 }}>SIPLAT</div>
          <h1 style={{ fontSize: 34, margin: "10px 0 6px" }}>Trust Centre</h1>
          <p style={{ fontSize: 15, maxWidth: 620, opacity: 0.95, lineHeight: 1.5 }}>
            How we keep schools&apos; and families&apos; data safe. Our security practices, privacy commitments,
            compliance posture and legal terms — published and kept current.
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 860, margin: "0 auto", padding: "28px 20px 60px" }}>
        {docs === null ? (
          <p style={{ color: C.muted }}>Loading…</p>
        ) : docs.length === 0 ? (
          <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 24, color: C.muted }}>
            {err ? "The Trust Centre is temporarily unavailable." : "No documents have been published yet — please check back soon."}
          </div>
        ) : grouped.map((grp) => (
          <section key={grp.category} style={{ marginBottom: 26 }}>
            <h2 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 1, color: C.muted, margin: "0 0 10px" }}>{CAT_LABEL[grp.category] || grp.category}</h2>
            <div style={{ display: "grid", gap: 10 }}>
              {grp.items.map((d: any) => {
                const isOpen = open === d.slug;
                return (
                  <article key={d.slug} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden" }}>
                    <button onClick={() => setOpen(isOpen ? null : d.slug)}
                      style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "16px 18px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                      <span>
                        <span style={{ fontWeight: 700, fontSize: 16, color: C.ink }}>{d.title}</span>
                        {d.summary ? <span style={{ display: "block", color: C.muted, fontSize: 13, marginTop: 3 }}>{d.summary}</span> : null}
                        <span style={{ display: "block", color: C.muted, fontSize: 11, marginTop: 4 }}>
                          v{d.version}{d.effectiveDate ? ` · effective ${new Date(d.effectiveDate).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}` : ""}
                        </span>
                      </span>
                      <span style={{ color: C.brand, fontSize: 22, lineHeight: 1 }}>{isOpen ? "–" : "+"}</span>
                    </button>
                    {isOpen && (
                      <div style={{ borderTop: `1px solid ${C.line}`, padding: "16px 18px" }}>
                        {d.linkUrl ? (
                          <p><a href={d.linkUrl} target="_blank" rel="noopener noreferrer" style={{ color: C.brand, fontWeight: 600 }}>Open the full document ↗</a></p>
                        ) : null}
                        {d.bodyHtml ? (
                          <div style={{ fontSize: 14, lineHeight: 1.6, color: "#1E293B" }} dangerouslySetInnerHTML={{ __html: d.bodyHtml }} />
                        ) : (!d.linkUrl ? <p style={{ color: C.muted }}>No further detail published.</p> : null)}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        ))}

        <footer style={{ marginTop: 30, paddingTop: 18, borderTop: `1px solid ${C.line}`, color: C.muted, fontSize: 12 }}>
          Questions about our security or compliance? Contact your SIPlat account manager. Documents here are published and version-controlled by SIPlat.
        </footer>
      </main>
    </div>
  );
}
