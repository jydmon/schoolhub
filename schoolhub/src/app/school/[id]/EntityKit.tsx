"use client";

import { useState } from "react";

// Shared list/detail toolkit reused across module tabs (Meals, Trips, …):
// multi-select, a 3-dot action menu, a source badge, and a detail modal.

export function useSel() {
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const ids = Object.keys(sel).filter((k) => sel[k]);
  return {
    ids, on: (id: string) => !!sel[id],
    toggle: (id: string) => setSel((p) => ({ ...p, [id]: !p[id] })),
    setMany: (list: string[], v: boolean) => setSel(v ? Object.fromEntries(list.map((i) => [i, true])) : {}),
    clear: () => setSel({}),
  };
}

export function Kebab({ items }: { items: ({ label: string; onClick: () => void; danger?: boolean } | null | false)[] }) {
  const [open, setOpen] = useState(false);
  const list = items.filter(Boolean) as { label: string; onClick: () => void; danger?: boolean }[];
  return (
    <span className="kebab-wrap">
      <button className="kebab-btn" aria-label="Actions" onClick={() => setOpen((o) => !o)}>⋯</button>
      {open && (
        <>
          <div className="kebab-backdrop" onClick={() => setOpen(false)} />
          <div className="kebab-menu">
            {list.map((it, i) => <button key={i} className={it.danger ? "danger" : ""} onClick={() => { setOpen(false); it.onClick(); }}>{it.label}</button>)}
          </div>
        </>
      )}
    </span>
  );
}

export const SourceBadge = ({ src }: { src?: string }) =>
  src === "api" ? <span className="badge role" title="From an integration — read-only">API</span>
  : src === "import" ? <span className="badge trial" title="Imported from CSV">imported</span>
  : <span className="muted" style={{ fontSize: 12 }}>manual</span>;

export function DetailModal({ title, subtitle, onClose, tabs, active, onTab, children }: {
  title: React.ReactNode; subtitle?: React.ReactNode; onClose: () => void;
  tabs?: string[]; active?: string; onTab?: (t: string) => void; children: React.ReactNode;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 820, width: "94%" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex-between" style={{ alignItems: "flex-start" }}>
          <div><h2 style={{ margin: 0 }}>{title}</h2>{subtitle ? <div className="muted" style={{ fontSize: 13 }}>{subtitle}</div> : null}</div>
          <button className="secondary small" onClick={onClose}>Close</button>
        </div>
        {tabs && (
          <div className="tabs" style={{ margin: "14px 0 6px" }}>
            {tabs.map((t) => <button key={t} className={active === t ? "active" : ""} onClick={() => onTab?.(t)}>{t}</button>)}
          </div>
        )}
        <div style={{ maxHeight: "68vh", overflow: "auto", paddingRight: 4 }}>{children}</div>
      </div>
    </div>
  );
}
