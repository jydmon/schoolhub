"use client";

// ---------------------------------------------------------------------------
// Global "operation in progress" tracker for long-running imports and exports.
//
// A running import or client-side download registers itself here; while the
// count is above zero a single window `beforeunload` handler warns the user
// that leaving or refreshing may interrupt the operation and require it to be
// restarted. The listener is installed lazily on first use, so no app-wide
// provider or layout wiring is required — any caller, in any portal, is covered.
//
// Browsers deliberately ignore custom `beforeunload` text and show their own
// generic "Leave site?" prompt; the message below is still set so that prompt
// is triggered, and is reused verbatim by any in-app confirmation we add.
// ---------------------------------------------------------------------------
import { useSyncExternalStore } from "react";

export const NAV_WARNING =
  "A process is still running. Leaving or refreshing this page may interrupt it and require it to be restarted.";

let count = 0;
let installed = false;
const subscribers = new Set<() => void>();

function emit() { subscribers.forEach((fn) => fn()); }

function onBeforeUnload(e: BeforeUnloadEvent) {
  if (count <= 0) return;
  e.preventDefault();
  e.returnValue = NAV_WARNING; // required to trigger the browser's own prompt
  return NAV_WARNING;
}

function ensureInstalled() {
  if (installed || typeof window === "undefined") return;
  window.addEventListener("beforeunload", onBeforeUnload);
  installed = true;
}

/** Mark a long operation (import/download) as in progress.
 *  Returns an idempotent function that clears it — always call it (e.g. in a
 *  `finally`) so the guard is released even if the operation throws. */
export function beginBusy(): () => void {
  ensureInstalled();
  count++; emit();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    count = Math.max(0, count - 1);
    emit();
  };
}

/** Run an async operation with the navigation guard active for its duration. */
export async function runGuarded<T>(op: () => Promise<T>): Promise<T> {
  const end = beginBusy();
  try { return await op(); } finally { end(); }
}

/** Non-reactive read of whether any guarded operation is currently running. */
export function isBusy(): boolean { return count > 0; }

function subscribe(cb: () => void) { subscribers.add(cb); return () => { subscribers.delete(cb); }; }

/** React hook: `true` while any guarded import/download is running. */
export function useBusy(): boolean {
  return useSyncExternalStore(subscribe, () => count > 0, () => false);
}
