"use client";

import { useEffect, useMemo, useState } from "react";
import type { NavGroup } from "@/components/AppShell";

// Item 12 — client-side page gating. Fetches the caller's effective access for a
// school and returns a `gate()` that hides nav items the admin has removed.
//
// Safety rules (must match the server contract in lib/roles.ts):
//   • Only gate when `customized` is true. An untouched school resolves to
//     platform defaults, so we never hide anything there.
//   • Only ever hide items whose key is a catalog page (`catalogPages`). Core
//     nav — dashboard, search, help, profile, notifications, history — is not in
//     the catalog and is therefore always visible.
//   • Fail open: any fetch/parse error leaves navigation untouched.

export type Access = { pages: string[]; catalogPages: string[]; customized: boolean };

export function useAccessGate(schoolId?: string) {
  const [access, setAccess] = useState<Access | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = schoolId ? `/api/me/access?schoolId=${encodeURIComponent(schoolId)}` : `/api/me/access`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setAccess({ pages: d.pages || [], catalogPages: d.catalogPages || [], customized: !!d.customized }); })
      .catch(() => { if (!cancelled) setAccess(null); });
    return () => { cancelled = true; };
  }, [schoolId]);

  const gate = useMemo(() => {
    return (nav: NavGroup[]): NavGroup[] => {
      if (!access || !access.customized) return nav; // no customization → show everything
      const allowed = new Set(access.pages);
      const catalog = new Set(access.catalogPages);
      return nav
        .map((g) => ({ ...g, items: g.items.filter((it) => !catalog.has(it.key) || allowed.has(it.key)) }))
        .filter((g) => g.items.length > 0);
    };
  }, [access]);

  const allows = useMemo(() => {
    return (key: string): boolean => {
      if (!access || !access.customized) return true;
      if (!access.catalogPages.includes(key)) return true; // non-catalog keys always allowed
      return access.pages.includes(key);
    };
  }, [access]);

  return { access, gate, allows, ready: access !== null };
}
