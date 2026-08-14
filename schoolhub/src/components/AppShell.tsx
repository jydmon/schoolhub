"use client";

import { useEffect, useState } from "react";
import { SiplatMark } from "./TopBar";
import LogoutButton from "./LogoutButton";
import Onboarding from "./Onboarding";
import AnnouncementBanner from "./AnnouncementBanner";
import SupportAccessBar from "./SupportAccessBar";
import PoliciesGate from "./PoliciesGate";
import Avatar from "./Avatar";

export type NavItem = { key: string; label: string; icon: string; badge?: number };
export type NavGroup = { label: string; items: NavItem[] };

export default function AppShell({
  brandSub = "Platform", nav, active, onNavigate, title, email, role, brandLogo, children,
}: {
  brandSub?: string;
  nav: NavGroup[];
  active: string;
  onNavigate: (k: string) => void;
  title: string;
  email: string;
  role: string;
  brandLogo?: string | null; // school logo shown in the sidebar brand when set
  children: React.ReactNode;
}) {
  // Load the signed-in user's photo/name once so the header avatar is shown
  // consistently across every portal.
  const [me, setMe] = useState<{ photoUrl?: string | null; fullName?: string | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/profile").then((r) => r.json()).then((d) => { if (!cancelled) setMe(d.profile || null); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="s-brand">{brandLogo ? <img src={brandLogo} alt="" style={{ height: 30, maxWidth: 116, objectFit: "contain", borderRadius: 6 }} /> : <SiplatMark size={30} />}<span className="wordmark">SIPlat</span></div>
        <div className="s-sub">{brandSub}</div>
        {nav.map((g) => (
          <div key={g.label}>
            <div className="nav-group-label">{g.label}</div>
            {g.items.map((it) => (
              <button key={it.key} className={`nav-item ${active === it.key ? "active" : ""}`} onClick={() => onNavigate(it.key)}>
                <span className="ic">{it.icon}</span> <span>{it.label}</span>
                {it.badge && it.badge > 0 ? <span className="nav-badge">{it.badge > 99 ? "99+" : it.badge}</span> : null}
              </button>
            ))}
          </div>
        ))}
      </aside>
      <div className="main">
        <div className="pagehead">
          <h1>{title}</h1>
          <div className="flex-between" style={{ gap: 12 }}>
            <span className="role-pill">{role}</span>
            <Avatar name={me?.fullName || email} src={me?.photoUrl} size={30} title={me?.fullName || email} />
            <span className="who">{email}</span>
            <LogoutButton />
          </div>
        </div>
        <div className="main-body">
          <SupportAccessBar />
          <PoliciesGate />
          <AnnouncementBanner />
          {children}
        </div>
      </div>
      <Onboarding />
    </div>
  );
}
