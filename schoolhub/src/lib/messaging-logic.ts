// Pure, DB-free helpers for the direct-messaging (Teams-style) surface:
// emoji-reaction grouping, per-message read receipts, and attachment validation.
// Kept separate from messaging.ts (which touches Prisma) so it can be unit-tested
// in isolation. Tested in tests/messaging.test.ts.

// A curated emoji palette used for the quick-reaction bar and the composer
// picker. Reactions are restricted to this set server-side.
export const REACTION_EMOJIS = ["👍", "❤️", "😄", "🎉", "👏", "😮", "😢", "🙏", "✅", "👀"] as const;
export const EMOJI_PALETTE = [
  "😀", "😄", "😁", "😊", "🙂", "😉", "😍", "😘", "😎", "🤔",
  "😅", "😂", "🙃", "😴", "😢", "😭", "😡", "👍", "👎", "👏",
  "🙏", "💪", "🎉", "🥳", "❤️", "🔥", "⭐", "✅", "❌", "👀",
  "📎", "📌", "📅", "⏰", "✏️", "📣", "💡", "🚌", "🏫", "🎓",
];

const REACTION_SET = new Set<string>(REACTION_EMOJIS as unknown as string[]);
/** Is this emoji allowed as a reaction? (Guards against arbitrary long strings.) */
export function isAllowedReaction(emoji: string): boolean {
  return REACTION_SET.has(emoji);
}

export type ReactionRow = { emoji: string; userId: string };
export type GroupedReaction = { emoji: string; count: number; mine: boolean; userIds: string[] };

/** Group raw reaction rows for one message into per-emoji summaries, flagging
 *  which the current user has applied. Order follows REACTION_EMOJIS, then any
 *  extras by first appearance. */
export function groupReactions(rows: ReactionRow[], meId: string): GroupedReaction[] {
  const map = new Map<string, GroupedReaction>();
  for (const r of rows) {
    let g = map.get(r.emoji);
    if (!g) { g = { emoji: r.emoji, count: 0, mine: false, userIds: [] }; map.set(r.emoji, g); }
    g.count++; g.userIds.push(r.userId);
    if (r.userId === meId) g.mine = true;
  }
  const order = (e: string) => { const i = (REACTION_EMOJIS as readonly string[]).indexOf(e); return i === -1 ? 999 : i; };
  return Array.from(map.values()).sort((a, b) => order(a.emoji) - order(b.emoji) || b.count - a.count);
}

export type MemberRead = { userId: string; name: string; lastReadAt: string | Date | null };

/** For a message sent by `senderId` at `createdAt`, which other members have
 *  read it (their lastReadAt >= createdAt). Used to render "Seen" receipts. */
export function readersOf(createdAt: string | Date, senderId: string, members: MemberRead[]): { userId: string; name: string }[] {
  const t = new Date(createdAt).getTime();
  const out: { userId: string; name: string }[] = [];
  for (const m of members) {
    if (m.userId === senderId) continue;
    if (!m.lastReadAt) continue;
    if (new Date(m.lastReadAt).getTime() >= t) out.push({ userId: m.userId, name: m.name });
  }
  return out;
}

export type Attachment = { name: string; type: string; size?: number; dataUrl: string };
export const MAX_ATTACHMENTS = 6;
export const MAX_ATTACH_BYTES = 2_000_000;        // ~2MB per file (decoded-ish, by data-URL length)
export const MAX_TOTAL_ATTACH_BYTES = 6_000_000;  // ~6MB per message

/** Validate + normalise an incoming attachments array. Throws Error on any
 *  violation (too many, too large, wrong shape, or an unsafe data URL). */
export function validateAttachments(input: unknown): Attachment[] {
  if (input == null) return [];
  if (!Array.isArray(input)) throw new Error("Attachments must be a list");
  if (input.length > MAX_ATTACHMENTS) throw new Error(`Up to ${MAX_ATTACHMENTS} attachments per message`);
  let total = 0;
  const out: Attachment[] = [];
  for (const raw of input) {
    const a = raw as Record<string, unknown>;
    const name = String(a?.name ?? "file").slice(0, 200);
    const type = String(a?.type ?? "application/octet-stream").slice(0, 120);
    const dataUrl = String(a?.dataUrl ?? "");
    if (!/^data:[^;,]+(;[^,]+)?,/i.test(dataUrl)) throw new Error("Each attachment must be an inline data URL");
    if (dataUrl.length > MAX_ATTACH_BYTES) throw new Error(`"${name}" is too large (max ${Math.round(MAX_ATTACH_BYTES / 1e6)}MB)`);
    total += dataUrl.length;
    out.push({ name, type, size: typeof a?.size === "number" ? a.size : dataUrl.length, dataUrl });
  }
  if (total > MAX_TOTAL_ATTACH_BYTES) throw new Error("Attachments are too large in total");
  return out;
}

/** A short preview string for a thread's last message (handles attachment-only). */
export function messagePreview(body: string | null | undefined, attachmentCount: number): string {
  const b = (body ?? "").trim();
  if (b) return b;
  if (attachmentCount > 0) return attachmentCount === 1 ? "📎 Attachment" : `📎 ${attachmentCount} attachments`;
  return "";
}
