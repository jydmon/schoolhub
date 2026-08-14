"use client";

import { useState } from "react";

// Shared table/list standard used across every portal (school, platform/super-
// admin, help & support, …) so tables behave identically: a three-dot (ellipsis)
// action menu, sortable column headers, and multi-select. The school-portal
// EntityKit exposes the same components for its module tabs; this module is the
// neutral home so admin/platform tables can adopt the identical standard.
//
// Uses the global .kebab-* styles (globals.css) so the menu looks the same
// everywhere.

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

export type KebabItem = { label: string; onClick: () => void; danger?: boolean } | null | false | undefined;

/** Standard three-dot (ellipsis) action menu. Pass an array of items; falsy
 *  entries are skipped so callers can inline conditionals. */
export function Kebab({ items, align = "right" }: { items: KebabItem[]; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const list = items.filter(Boolean) as { label: string; onClick: () => void; danger?: boolean }[];
  if (list.length === 0) return null;
  return (
    <span className="kebab-wrap">
      <button className="kebab-btn" aria-label="Actions" onClick={() => setOpen((o) => !o)}>⋯</button>
      {open && (
        <>
          <div className="kebab-backdrop" onClick={() => setOpen(false)} />
          <div className="kebab-menu" style={align === "left" ? { right: "auto", left: 0 } : undefined}>
            {list.map((it, i) => <button key={i} className={it.danger ? "danger" : ""} onClick={() => { setOpen(false); it.onClick(); }}>{it.label}</button>)}
          </div>
        </>
      )}
    </span>
  );
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
