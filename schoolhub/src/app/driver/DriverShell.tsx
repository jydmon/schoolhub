"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell, { NavGroup } from "@/components/AppShell";
import AccountProfile from "@/components/AccountProfile";
import HelpSupport from "@/components/HelpSupport";
import Messaging from "@/components/Messaging";
import ScopedSearch from "@/components/ScopedSearch";
import { useAccessGate } from "@/lib/useAccessGate";
import DriverApp from "./DriverApp";
import DriverHome from "./DriverHome";
import { DriverHistory, DriverChecks, DriverMessages, DriverIncidents, DriverFleet } from "./DriverExtra";

const TITLES: Record<string, string> = {
  home: "Driver home", journeys: "Today's journeys", checks: "Vehicle checks", history: "My journey log", messages: "Transport office",
  incidents: "Incident log", fleet: "Fleet", profile: "My profile", dm: "Messages", help: "Help & support", search: "Search",
};

export default function DriverShell({ email = "" }: { email?: string }) {
  const [active, setActive] = useState("home");
  const [unread, setUnread] = useState(0);
  const { gate } = useAccessGate();

  const loadUnread = useCallback(() => {
    fetch(`/api/driver/home`).then((r) => r.json()).then((d) => setUnread(d.unreadMessages ?? 0)).catch(() => {});
  }, []);
  useEffect(() => { loadUnread(); }, [loadUnread]);
  useEffect(() => { if (active !== "messages") loadUnread(); }, [active, loadUnread]);

  function nav(k: string) { setActive(k); if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" }); }

  // Standardised navigation: role content, then Support and Account.
  const NAV: NavGroup[] = [
    { label: "Driving", items: [
      { key: "home", label: "Home", icon: "🏠" },
      { key: "search", label: "Search", icon: "🔍" },
      { key: "journeys", label: "Today's journeys", icon: "🚌" },
      { key: "checks", label: "Vehicle checks", icon: "🛠️" },
      { key: "incidents", label: "Incident log", icon: "⚠️" },
      { key: "fleet", label: "Fleet", icon: "🚐" },
      { key: "history", label: "Journey log", icon: "🗂️" },
      { key: "messages", label: "Transport office", icon: "✉️", badge: unread },
    ] },
    { label: "Support", items: [
      { key: "dm", label: "Messaging", icon: "💬" },
      { key: "help", label: "Help & support", icon: "🆘" },
    ] },
    { label: "Account", items: [
      { key: "profile", label: "My profile", icon: "🙂" },
    ] },
  ];

  function body() {
    switch (active) {
      case "home": return <DriverHome onNavigate={nav} />;
      case "search": return <ScopedSearch endpoint="/api/driver/search" title="Search" blurb="Search across your assigned routes, passengers and journeys." onNavigate={(k) => nav(k === "roster" || k === "routes" || k === "journeys" ? "journeys" : k)} />;
      case "journeys": return <DriverApp />;
      case "checks": return <DriverChecks />;
      case "incidents": return <DriverIncidents />;
      case "fleet": return <DriverFleet />;
      case "history": return <DriverHistory />;
      case "messages": return <DriverMessages />;
      case "profile": return <AccountProfile />;
      case "dm": return <Messaging />;
      case "help": return <HelpSupport />;
      default: return <DriverHome onNavigate={nav} />;
    }
  }

  return (
    <AppShell brandSub="Driver" nav={gate(NAV)} active={active} onNavigate={nav} title={TITLES[active] || "Driver"} email={email} role="Driver">
      {body()}
    </AppShell>
  );
}
