"use client";

import { useState } from "react";
import AppShell, { NavGroup } from "@/components/AppShell";
import ParentDashboard from "./ParentDashboard";

const PARENT_NAV: NavGroup[] = [
  { label: "Family", items: [
    { key: "overview", label: "Overview", icon: "🏠" },
    { key: "notifications", label: "Notifications", icon: "🔔" },
    { key: "transport", label: "Transport", icon: "🚌" },
    { key: "trips", label: "Trips", icon: "🧳" },
    { key: "rewards", label: "Rewards", icon: "⭐" },
    { key: "reports", label: "School reports", icon: "📄" },
    { key: "messaging", label: "Messaging", icon: "✉️" },
    { key: "profile", label: "My profile", icon: "🙂" },
    { key: "preferences", label: "Preferences", icon: "⚙️" },
  ] },
];

export default function ParentShell({ email = "" }: { email?: string }) {
  const [active, setActive] = useState("overview");
  function nav(k: string) {
    setActive(k);
    if (typeof document !== "undefined") {
      const el = document.getElementById("p-" + k);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
  return (
    <AppShell brandSub="Family" nav={PARENT_NAV} active={active} onNavigate={nav} title="Family dashboard" email={email} role="Parent / Guardian">
      <ParentDashboard />
    </AppShell>
  );
}
