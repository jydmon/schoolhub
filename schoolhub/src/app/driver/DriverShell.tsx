"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell, { NavGroup } from "@/components/AppShell";
import AccountProfile from "@/components/AccountProfile";
import HelpSupport from "@/components/HelpSupport";
import Messaging from "@/components/Messaging";
import DriverApp from "./DriverApp";
import DriverHome from "./DriverHome";
import { DriverHistory, DriverChecks, DriverMessages } from "./DriverExtra";

const TITLES: Record<string, string> = {
  home: "Driver home", journeys: "Today's journeys", checks: "Vehicle checks", history: "My journey log", messages: "Transport office",
  profile: "My profile", dm: "Messages", help: "Help & support",
};

export default function DriverShell({ email = "" }: { email?: string }) {
  const [active, setActive] = useState("home");
  const [unread, setUnread] = useState(0);

  const loadUnread = useCallback(() => {
    fetch(`/api/driver/home`).then((r) => r.json()).then((d) => setUnread(d.unreadMessages ?? 0)).catch(() => {});
  }, []);
  useEffect(() => { loadUnread(); }, [loadUnread]);
  useEffect(() => { if (active !== "messages") loadUnread(); }, [active, loadUnread]);

  function nav(k: string) { setActive(k); if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" }); }

  const NAV: NavGroup[] = [
    { label: "Driving", items: [
      { key: "home", label: "Home", icon: "🏠" },
      { key: "journeys", label: "Today's journeys", icon: "🚌" },
      { key: "checks", label: "Vehicle checks", icon: "🛠️" },
      { key: "history", label: "Journey log", icon: "🗂️" },
      { key: "messages", label: "Office", icon: "✉️", badge: unread },
    ] },
    { label: "Account", items: [
      { key: "dm", label: "Messages", icon: "💬" },
      { key: "profile", label: "My profile", icon: "🙂" },
      { key: "help", label: "Help & support", icon: "🆘" },
    ] },
  ];

  function body() {
    switch (active) {
      case "home": return <DriverHome onNavigate={nav} />;
      case "journeys": return <DriverApp />;
      case "checks": return <DriverChecks />;
      case "history": return <DriverHistory />;
      case "messages": return <DriverMessages />;
      case "profile": return <AccountProfile />;
      case "dm": return <Messaging />;
      case "help": return <HelpSupport />;
      default: return <DriverHome onNavigate={nav} />;
    }
  }

  return (
    <AppShell brandSub="Driver" nav={NAV} active={active} onNavigate={nav} title={TITLES[active] || "Driver"} email={email} role="Driver">
      {body()}
    </AppShell>
  );
}
