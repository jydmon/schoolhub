"use client";

import { useState } from "react";
import AppShell, { NavGroup } from "@/components/AppShell";
import ParentPages from "./ParentPages";

const PARENT_NAV: NavGroup[] = [
  { label: "Assistant", items: [
    { key: "assistant", label: "Ask AI Assistant", icon: "🤖" },
  ] },
  { label: "Family", items: [
    { key: "overview", label: "Overview", icon: "🏠" },
    { key: "children", label: "My children", icon: "👧" },
    { key: "calendar", label: "Calendar", icon: "📅" },
    { key: "timetable", label: "Timetable", icon: "🗓️" },
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

const TITLES: Record<string, string> = {
  assistant: "Ask AI Assistant", overview: "Family dashboard", children: "My children",
  calendar: "Calendar", timetable: "Timetable", notifications: "Notifications",
  transport: "Transport", trips: "Trips", rewards: "Rewards", reports: "School reports",
  messaging: "Messaging", profile: "My profile", preferences: "Preferences",
};

export default function ParentShell({ email = "" }: { email?: string }) {
  const [active, setActive] = useState("overview");
  function nav(k: string) {
    setActive(k);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }
  return (
    <AppShell brandSub="Family" nav={PARENT_NAV} active={active} onNavigate={nav} title={TITLES[active] || "Family dashboard"} email={email} role="Parent / Guardian">
      <ParentPages active={active} onNavigate={nav} />
    </AppShell>
  );
}
