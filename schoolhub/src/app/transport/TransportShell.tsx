"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell, { NavGroup } from "@/components/AppShell";
import { Control, Routes, Profiles, Fees, Requests, Enquiries } from "../school/[id]/TransportTab";
import { TMDashboard, TMFleet, TMDrivers, TMIncidents, TMMessages } from "./TransportPages";

const TITLES: Record<string, string> = {
  dashboard: "Transport dashboard", control: "Control centre", incidents: "Incidents", messages: "Driver messages",
  routes: "Routes & stops", fleet: "Fleet", drivers: "Drivers", profiles: "Student transport",
  requests: "Parent requests", enquiries: "Enquiries", fees: "Fees & cost",
};

export default function TransportShell({ email = "" }: { email?: string }) {
  const [active, setActive] = useState("dashboard");
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [schoolId, setSchoolId] = useState<string>("");
  const [openIncidents, setOpenIncidents] = useState(0);
  const [unreadMsgs, setUnreadMsgs] = useState(0);

  useEffect(() => {
    fetch(`/api/transport/context`).then((r) => r.json()).then((d) => {
      setSchools(d.schools ?? []);
      if ((d.schools ?? []).length) setSchoolId(d.schools[0].id);
    }).catch(() => {});
  }, []);

  const loadBadges = useCallback(() => {
    if (!schoolId) return;
    fetch(`/api/schools/${schoolId}/transport/incidents?status=open`).then((r) => r.json()).then((d) => setOpenIncidents(d.counts?.open ?? 0)).catch(() => {});
    fetch(`/api/schools/${schoolId}/transport/messages`).then((r) => r.json()).then((d) => setUnreadMsgs(d.totalUnread ?? 0)).catch(() => {});
  }, [schoolId]);
  useEffect(() => { loadBadges(); }, [loadBadges, active]);

  function nav(k: string) { setActive(k); if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" }); }

  const NAV: NavGroup[] = [
    { label: "Operations", items: [
      { key: "dashboard", label: "Dashboard", icon: "📊" },
      { key: "control", label: "Control centre", icon: "🛰️" },
      { key: "incidents", label: "Incidents", icon: "⚠️", badge: openIncidents },
      { key: "messages", label: "Driver messages", icon: "✉️", badge: unreadMsgs },
    ] },
    { label: "Network", items: [
      { key: "routes", label: "Routes & stops", icon: "🗺️" },
      { key: "fleet", label: "Fleet", icon: "🚌" },
      { key: "drivers", label: "Drivers", icon: "🧑‍✈️" },
      { key: "profiles", label: "Student transport", icon: "🎒" },
    ] },
    { label: "Service", items: [
      { key: "requests", label: "Parent requests", icon: "🔁" },
      { key: "enquiries", label: "Enquiries", icon: "❓" },
      { key: "fees", label: "Fees & cost", icon: "💷" },
    ] },
  ];

  function body() {
    if (!schoolId) return <div className="panel">Loading your transport service…</div>;
    switch (active) {
      case "dashboard": return <TMDashboard schoolId={schoolId} onNavigate={nav} />;
      case "control": return <Control schoolId={schoolId} />;
      case "incidents": return <TMIncidents schoolId={schoolId} />;
      case "messages": return <TMMessages schoolId={schoolId} />;
      case "routes": return <Routes schoolId={schoolId} />;
      case "fleet": return <TMFleet schoolId={schoolId} />;
      case "drivers": return <TMDrivers schoolId={schoolId} />;
      case "profiles": return <Profiles schoolId={schoolId} />;
      case "requests": return <Requests schoolId={schoolId} />;
      case "enquiries": return <Enquiries schoolId={schoolId} />;
      case "fees": return <Fees schoolId={schoolId} />;
      default: return <TMDashboard schoolId={schoolId} onNavigate={nav} />;
    }
  }

  return (
    <AppShell brandSub="Transport" nav={NAV} active={active} onNavigate={nav} title={TITLES[active] || "Transport"} email={email} role="Transport Manager">
      {schools.length > 1 && (
        <div className="panel flex-between" style={{ alignItems: "center" }}>
          <div className="muted" style={{ fontSize: 13 }}>Managing transport for</div>
          <select value={schoolId} onChange={(e) => setSchoolId(e.target.value)} style={{ width: "auto" }}>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}
      {body()}
    </AppShell>
  );
}
