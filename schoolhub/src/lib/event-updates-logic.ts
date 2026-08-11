// Pure logic for real-time EVENT / TRIP updates from the staff member leading a
// school trip — the parent-facing equivalent of driver journey tracking, but for
// an off-site event. The lead taps standard buttons (Journey started, Traffic,
// Delayed, Arrived, Event completed, Heading back, Back at school). A school can
// add or remove buttons. Every update notifies the parents of pupils on the trip
// and is recorded for the tenant-admin + super-admin reports. DB flows live in
// src/lib/event-updates.ts. Unit-tested in tests/phase17c.test.ts.

export type UpdateType = {
  key: string;
  label: string;
  icon?: string;
  notifies: boolean;   // does it push to parents?
  terminal?: boolean;  // marks the trip complete
};

// The standard notification buttons shipped with every school.
export const STANDARD_EVENT_UPDATES: UpdateType[] = [
  { key: "journey_started", label: "Journey started", icon: "🚌", notifies: true },
  { key: "traffic",         label: "Traffic / slow",  icon: "🐢", notifies: true },
  { key: "delayed",         label: "Delayed",         icon: "⏱️", notifies: true },
  { key: "arrived",         label: "Arrived at venue",icon: "📍", notifies: true },
  { key: "event_completed", label: "Event completed", icon: "✅", notifies: true },
  { key: "heading_back",    label: "Heading back",    icon: "↩️", notifies: true },
  { key: "back_at_school",  label: "Back at school",  icon: "🏫", notifies: true, terminal: true },
  { key: "note",            label: "Note to parents", icon: "✍️", notifies: true },
];

const STANDARD_KEYS = new Set(STANDARD_EVENT_UPDATES.map((u) => u.key));

/** The button set for a school: standards minus any removed, plus any custom. */
export function updateSet(opts: { removed?: string[]; custom?: UpdateType[] } = {}): UpdateType[] {
  const removed = new Set(opts.removed ?? []);
  const base = STANDARD_EVENT_UPDATES.filter((u) => !removed.has(u.key));
  const customClean = (opts.custom ?? []).filter((c) => c.key && !STANDARD_KEYS.has(c.key));
  return [...base, ...customClean];
}

export function isValidUpdate(key: string, set: UpdateType[]): boolean {
  return set.some((u) => u.key === key);
}

/** Slugify a custom label into a key. */
export function customKey(label: string): string {
  return "custom_" + String(label).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
}

export function makeCustomUpdate(label: string, icon = "🔔"): UpdateType {
  return { key: customKey(label), label: label.trim(), icon, notifies: true };
}

export type UpdateEvent = { type: string; at: Date | string };

/** Timeline progress for a trip's parent-facing tracker. */
export function tripProgress(events: UpdateEvent[], set: UpdateType[] = STANDARD_EVENT_UPDATES) {
  const seen = new Set(events.map((e) => e.type));
  const done = set.some((u) => u.terminal && seen.has(u.key));
  const last = events.length ? events.slice().sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())[events.length - 1] : null;
  const label = last ? (set.find((u) => u.key === last.type)?.label ?? last.type) : "Not started";
  return { updates: events.length, complete: done, currentStatus: label, notifiedTypes: Array.from(seen) };
}

/** Report rollup across many trips for the tenant-admin / super-admin reports. */
export function reportRollup(trips: { events: UpdateEvent[]; set?: UpdateType[] }[]) {
  let totalUpdates = 0, completed = 0;
  const byType: Record<string, number> = {};
  for (const t of trips) {
    totalUpdates += t.events.length;
    if (tripProgress(t.events, t.set).complete) completed++;
    for (const e of t.events) byType[e.type] = (byType[e.type] ?? 0) + 1;
  }
  return { trips: trips.length, totalUpdates, completed, byType };
}
