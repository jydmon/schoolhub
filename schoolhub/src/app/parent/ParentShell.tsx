"use client";

import { useEffect, useState, useCallback } from "react";
import AppShell, { NavGroup } from "@/components/AppShell";
import ParentPages from "./ParentPages";

const TITLES: Record<string, string> = {
  assistant: "Ask AI Assistant", overview: "Family dashboard", children: "My children",
  calendar: "Calendar", timetable: "Timetable", notifications: "Notifications", menu: "Menu", clubs: "Clubs & activities",
  transport: "Transport", trips: "Trips", rewards: "Rewards", reports: "Report Centre",
  dm: "Messages", messaging: "Contact preferences", profile: "My profile", compliance: "Terms & compliance", trust: "Trust & policies", preferences: "My preferences", subscription: "My subscription", help: "Help & support",
};

export default function ParentShell({ email = "" }: { email?: string }) {
  const [active, setActive] = useState("overview");
  const [unread, setUnread] = useState(0);

  const loadUnread = useCallback(() => {
    fetch(`/api/parent/notifications`).then((r) => r.json()).then((d) => setUnread(d.unread ?? 0)).catch(() => {});
  }, []);
  useEffect(() => { loadUnread(); }, [loadUnread]);
  useEffect(() => { if (active !== "notifications") loadUnread(); }, [active, loadUnread]);

  function nav(k: string) {
    setActive(k);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Standardised navigation (per spec): Assistant always at the top, then
  // Account, Family, School, Support and Reports.
  const PARENT_NAV: NavGroup[] = [
    { label: "Assistant", items: [
      { key: "assistant", label: "Ask AI Assistant", icon: "🤖" },
    ] },
    { label: "Account", items: [
      { key: "profile", label: "My profile", icon: "🙂" },
      { key: "compliance", label: "Terms & compliance", icon: "📋" },
      { key: "trust", label: "Trust & policies", icon: "🛡️" },
      { key: "preferences", label: "My preferences", icon: "⚙️" },
      { key: "messaging", label: "Contact preferences", icon: "✉️" },
      { key: "subscription", label: "My subscription", icon: "💳" },
    ] },
    { label: "Family", items: [
      { key: "overview", label: "Overview", icon: "🏠" },
      { key: "children", label: "My children", icon: "👧" },
      { key: "calendar", label: "Calendar", icon: "📅" },
    ] },
    { label: "School", items: [
      { key: "timetable", label: "Timetable", icon: "🗓️" },
      { key: "menu", label: "Menu", icon: "🍽️" },
      { key: "clubs", label: "Clubs & activities", icon: "⚽" },
      { key: "rewards", label: "Rewards", icon: "⭐" },
      { key: "transport", label: "Transport", icon: "🚌" },
      { key: "trips", label: "Trips", icon: "🧳" },
    ] },
    { label: "Support", items: [
      { key: "help", label: "Help & support", icon: "🆘" },
      { key: "dm", label: "Messaging", icon: "💬" },
      { key: "notifications", label: "Notifications", icon: "🔔", badge: unread },
    ] },
    { label: "Reports", items: [
      { key: "reports", label: "Report Centre", icon: "📄" },
    ] },
  ];

  return (
    <AppShell brandSub="Family" nav={PARENT_NAV} active={active} onNavigate={nav} title={TITLES[active] || "Family dashboard"} email={email} role="Parent / Guardian">
      <ParentPages active={active} onNavigate={nav} />
    </AppShell>
  );
}
