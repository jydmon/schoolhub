"use client";

import AppShell, { NavGroup } from "@/components/AppShell";
import DriverApp from "./DriverApp";

const DRIVER_NAV: NavGroup[] = [
  { label: "Today", items: [{ key: "journeys", label: "My journeys", icon: "🚌" }] },
];

export default function DriverShell({ email = "" }: { email?: string }) {
  return (
    <AppShell brandSub="Driver" nav={DRIVER_NAV} active="journeys" onNavigate={() => {}} title="Today's journeys" email={email} role="Driver">
      <DriverApp />
    </AppShell>
  );
}
