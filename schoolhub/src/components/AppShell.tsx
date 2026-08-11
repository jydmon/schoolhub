"use client";

import { SiplatMark } from "./TopBar";
import LogoutButton from "./LogoutButton";

export type NavItem = { key: string; label: string; icon: string };
export type NavGroup = { label: string; items: NavItem[] };

export default function AppShell({
  brandSub = "Platform", nav, active, onNavigate, title, email, role, children,
}: {
  brandSub?: string;
  nav: NavGroup[];
  active: string;
  onNavigate: (k: string) => void;
  title: string;
  email: string;
  role: string;
  children: React.ReactNode;
}) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="s-brand"><SiplatMark size={30} /><span className="wordmark">SIPlat</span></div>
        <div className="s-sub">{brandSub}</div>
        {nav.map((g) => (
          <div key={g.label}>
            <div className="nav-group-label">{g.label}</div>
            {g.items.map((it) => (
              <button key={it.key} className={`nav-item ${active === it.key ? "active" : ""}`} onClick={() => onNavigate(it.key)}>
                <span className="ic">{it.icon}</span> <span>{it.label}</span>
              </button>
            ))}
          </div>
        ))}
      </aside>
      <div className="main">
        <div className="pagehead">
          <h1>{title}</h1>
          <div className="flex-between" style={{ gap: 14 }}>
            <span className="role-pill">{role}</span>
            <span className="who">{email}</span>
            <LogoutButton />
          </div>
        </div>
        <div className="main-body">{children}</div>
      </div>
    </div>
  );
}
