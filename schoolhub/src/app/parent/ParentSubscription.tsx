"use client";

import { useEffect, useState } from "react";

const dt = (v: any) => (v ? new Date(v).toLocaleDateString() : "—");

export default function ParentSubscription() {
  const [d, setD] = useState<any>(null);
  useEffect(() => { fetch("/api/parent/subscription").then((r) => r.json()).then(setD).catch(() => {}); }, []);
  if (!d) return <div className="panel">Loading…</div>;
  const ai = d.aiAssistant || {};

  return (
    <>
      <div className="panel">
        <h2 style={{ margin: 0 }}>My subscription</h2>
        <p className="sub">Your SIPlat AI Assistant subscription, linked schools and children.</p>
      </div>

      <div className="panel">
        <div className="flex-between" style={{ alignItems: "flex-start" }}>
          <div>
            <h2 style={{ fontSize: 16, margin: 0 }}>✨ Premium AI Assistant</h2>
            <p className="sub" style={{ marginBottom: 0 }}>Answers across timetable, menu, attendance, reports, transport and multi-year trends — scoped to your children.</p>
          </div>
          <span className={`badge ${ai.active ? "active" : "archived"}`}>{ai.active ? "Active" : ai.status === "none" ? "Not subscribed" : ai.status}</span>
        </div>
        <table style={{ marginTop: 12 }}><tbody>
          <tr><th style={{ width: 160 }}>Status</th><td>{ai.status === "none" ? "No active subscription" : ai.status}</td></tr>
          {ai.price && <tr><th>Price</th><td>{ai.price} / {ai.interval}</td></tr>}
          {ai.renewalDate && <tr><th>Renews</th><td>{dt(ai.renewalDate)}</td></tr>}
        </tbody></table>
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Billing is handled securely by your school via Stripe — card details are never stored in SIPlat. To change or cancel your subscription, contact your school office.</p>
      </div>

      {d.subscriptions?.length > 1 && (
        <div className="panel">
          <h2 style={{ fontSize: 16, margin: 0 }}>All subscriptions</h2>
          <table style={{ marginTop: 8 }}>
            <thead><tr><th>Plan</th><th>Status</th><th>Price</th><th>Renews</th></tr></thead>
            <tbody>{d.subscriptions.map((s: any) => (
              <tr key={s.id}><td>{s.planKey}</td><td><span className={`badge ${["active", "trialing"].includes(s.status) ? "active" : "archived"}`}>{s.status}</span></td><td>{s.price} / {s.interval}</td><td className="muted">{dt(s.renewalDate)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <div className="panel">
        <h2 style={{ fontSize: 16, margin: 0 }}>Linked schools &amp; children</h2>
        {(d.childrenBySchool || []).length === 0 ? <p className="muted" style={{ marginTop: 8 }}>No children linked to your account yet.</p> :
          (d.childrenBySchool || []).map((s: any) => (
            <div key={s.schoolId} style={{ borderTop: "1px solid var(--line)", padding: "10px 0" }}>
              <strong>{s.schoolName}</strong>
              <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{s.children.join(", ")}</div>
            </div>
          ))}
        {(d.schools || []).length > 1 && <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Your children are enrolled across {d.schools.length} schools — your account spans all of them.</p>}
      </div>
    </>
  );
}
