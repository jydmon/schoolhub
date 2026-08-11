// Pure logic for the in-app notification inbox ("What's new"): the unread badge
// count, grouping for the list, and mark-as-read helpers. Operates on plain
// Notification-like records so it is unit-testable without a database. DB flows
// live in src/lib/inbox.ts. Unit-tested in tests/phase17e.test.ts.

export type NotificationLike = {
  id: string;
  kind: string;          // announcement | event_update | reward | report | transport | info | ...
  title: string;
  body?: string | null;
  channel?: string;      // inapp | push | email | ...
  read: boolean;
  createdAt: Date | string;
};

// Friendly labels + icons per kind for the list.
export const KIND_META: Record<string, { label: string; icon: string }> = {
  announcement: { label: "Announcement", icon: "📣" },
  event_update: { label: "Trip update", icon: "🧭" },
  reward:       { label: "Reward / behaviour", icon: "⭐" },
  report:       { label: "Report", icon: "🎓" },
  transport:    { label: "Transport", icon: "🚌" },
  message:      { label: "Message", icon: "💬" },
  info:         { label: "New information", icon: "🆕" },
  policy:       { label: "Policy", icon: "📜" },
  emergency:    { label: "Emergency", icon: "⚠️" },
};

export function kindMeta(kind: string) {
  return KIND_META[kind] ?? { label: "Update", icon: "🔔" };
}

/** Only the in-app copies count toward the inbox (external channels are separate
 *  delivery rows for the same event). */
function isInApp(n: NotificationLike): boolean {
  return !n.channel || n.channel === "inapp";
}

/** Unread badge count — the number shown on the red icon. */
export function unreadCount(items: NotificationLike[]): number {
  return items.filter((n) => isInApp(n) && !n.read).length;
}

/** True if there is anything new to surface (drives showing the red dot). */
export function hasUnread(items: NotificationLike[]): boolean {
  return unreadCount(items) > 0;
}

/** The inbox list (in-app only), newest first, de-duplicated by id. */
export function inboxList(items: NotificationLike[]): NotificationLike[] {
  const seen = new Set<string>();
  return items
    .filter(isInApp)
    .filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true)))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/** Count of unread per kind, for filter chips. */
export function summarizeByKind(items: NotificationLike[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const n of items) if (isInApp(n) && !n.read) out[n.kind] = (out[n.kind] ?? 0) + 1;
  return out;
}

/** Group the list into Today / Yesterday / Earlier buckets for display. */
export function groupByDay(items: NotificationLike[], now: Date): { label: string; items: NotificationLike[] }[] {
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOf(now);
  const yesterday = today - 24 * 60 * 60 * 1000;
  const buckets: Record<string, NotificationLike[]> = { Today: [], Yesterday: [], Earlier: [] };
  for (const n of inboxList(items)) {
    const t = startOf(new Date(n.createdAt));
    if (t === today) buckets.Today.push(n);
    else if (t === yesterday) buckets.Yesterday.push(n);
    else buckets.Earlier.push(n);
  }
  return ["Today", "Yesterday", "Earlier"].map((label) => ({ label, items: buckets[label] })).filter((g) => g.items.length);
}

/** Resolve which ids to mark read: an explicit list, or all unread if none given. */
export function idsToMark(items: NotificationLike[], ids?: string[]): string[] {
  if (ids && ids.length) return ids;
  return items.filter((n) => isInApp(n) && !n.read).map((n) => n.id);
}

/** Apply a mark-read to a local list (used by the UI to update optimistically). */
export function applyMarkRead(items: NotificationLike[], ids: string[]): NotificationLike[] {
  const set = new Set(ids);
  return items.map((n) => (set.has(n.id) ? { ...n, read: true } : n));
}
