"use client";

import { useState } from "react";

// Shared list/detail toolkit reused across module tabs (Meals, Trips, …):
// multi-select, a 3-dot action menu, a source badge, and a detail modal.

// Reusable column sorting for list tables. `sort(rows, get)` returns a sorted
// copy; `SortTh` renders a clickable header showing the active direction.
export function useSort(initialKey: string, initialDir: 1 | -1 = 1) {
  const [key, setKey] = useState(initialKey);
  const [dir, setDir] = useState<1 | -1>(initialDir);
  const toggle = (k: string) => { if (k === key) setDir((d) => (d === 1 ? -1 : 1)); else { setKey(k); setDir(1); } };
  const arrow = (k: string) => (key === k ? (dir === 1 ? " ▲" : " ▼") : "");
  function sort<T>(rows: T[], get: (r: T, k: string) => any): T[] {
    return [...rows].sort((a, b) => {
      const av = get(a, key), bv = get(b, key);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }
  return { key, dir, toggle, arrow, sort };
}

export function SortTh({ k, label, sort, className }: { k: string; label: string; sort: { toggle: (k: string) => void; arrow: (k: string) => string }; className?: string }) {
  return <th className={className} style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }} onClick={() => sort.toggle(k)}>{label}{sort.arrow(k)}</th>;
}

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
