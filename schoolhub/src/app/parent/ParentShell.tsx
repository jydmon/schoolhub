"use client";

import { useEffect, useState, useCallback } from "react";
import AppShell, { NavGroup } from "@/components/AppShell";
import ParentPages from "./ParentPages";

const TITLES: Record<string, string> = {
  assistant: "Ask AI Assistant", overview: "Family dashboard", children: "My children",
  calendar: "Calendar", timetable: "Timetable", notifications: "Notifications", menu: "Menu",
  transport: "Transport", trips: "Trips", rewards: "Rewards", reports: "Reports centre",
  messaging: "Messaging", profile: "My profile", preferences: "Preferences",
};

export default function ParentShell({ email = "" }: { email?: string }) {
  const [active, setActive] = useState("overview");
  const [unread, setUnread] = useState(0);

  const loadUnread = useCallback(() => {
    fetch(`/api/parent/notifications`).then((r) => r.json()).then((d) => setUnread(d.unread ?? 0)).catch(() => {});
  }, []);
  useEffect(() => { loadUnread(); }, [loadUnread]);
  // Refresh the badge when leaving the notifications page (items may have been read).
  useEffect(() => { if (active !== "notifications") loadUnread(); }, [active, loadUnread]);

  function nav(k: string) {
    setActive(k);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const PARENT_NAV: NavGroup[] = [
    { label: "Assistant", items: [
      { key: "assistant", label: "Ask AI Assistant", icon: "🤖" },
    ] },
    { label: "Family", items: [
      { key: "overview", label: "Overview", icon: "🏠" },
      { key: "children", label: "My children", icon: "👧" },
      { key: "calendar", label: "Calendar", icon: "📅" },
      { key: "timetable", label: "Timetable", icon: "🗓️" },
      { key: "notifications", label: "Notifications", icon: "🔔", badge: unread },
      { key: "menu", label: "Menu", icon: "🍽️" },
      { key: "transport", label: "Transport", icon: "🚌" },
      { key: "trips", label: "Trips", icon: "🧳" },
      { key: "rewards", label: "Rewards", icon: "⭐" },
      { key: "reports", label: "Reports centre", icon: "📄" },
      { key: "messaging", label: "Messaging", icon: "✉️" },
      { key: "profile", label: "My profile", icon: "🙂" },
      { key: "preferences", label: "Preferences", icon: "⚙️" },
    ] },
  ];

  return (
    <AppShell brandSub="Family" nav={PARENT_NAV} active={active} onNavigate={nav} title={TITLES[active] || "Family dashboard"} email={email} role="Parent / Guardian">
      <ParentPages active={active} onNavigate={nav} />
    </AppShell>
  );
}
