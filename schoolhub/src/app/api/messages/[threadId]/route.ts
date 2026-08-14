import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { groupReactions, type ReactionRow } from "@/lib/messaging-logic";
import { handleError, ok, AppError } from "@/lib/http";

type Params = { params: { threadId: string } };
const PAGE = 100;

// The message history for one conversation, newest page first with pagination
// (?before=<messageId> loads older). Includes attachments, emoji reactions and
// per-member read state for read receipts. Marks the thread read for the caller.
export async function GET(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const member = await prisma.directThreadMember.findFirst({ where: { threadId: params.threadId, userId: ctx.userId } });
    if (!member) throw new AppError("You're not part of this conversation.", 403);

    const before = new URL(req.url).searchParams.get("before") || "";
    let createdBefore: Date | null = null;
    if (before) {
      const anchor = await prisma.directMessageItem.findFirst({ where: { id: before, threadId: params.threadId }, select: { createdAt: true } });
      if (anchor) createdBefore = anchor.createdAt;
    }

    const where = { threadId: params.threadId, ...(createdBefore ? { createdAt: { lt: createdBefore } } : {}) };
    const [thread, page, members] = await Promise.all([
      prisma.directThread.findUnique({ where: { id: params.threadId } }),
      prisma.directMessageItem.findMany({ where, orderBy: { createdAt: "desc" }, take: PAGE + 1, include: { reactions: { select: { emoji: true, userId: true } } } }),
      prisma.directThreadMember.findMany({ where: { threadId: params.threadId }, select: { userId: true, lastReadAt: true } }),
    ]);
    const hasMore = page.length > PAGE;
    const slice = page.slice(0, PAGE).reverse(); // ascending for display

    const ids = members.map((m) => m.userId);
    const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, email: true } });
    const uName = new Map(users.map((u) => [u.id, u.fullName || u.email]));

    // Mark read (only meaningful on the first/newest page).
    if (!before) await prisma.directThreadMember.update({ where: { threadId_userId: { threadId: params.threadId, userId: ctx.userId } }, data: { lastReadAt: new Date() } }).catch(() => {});

    return ok({
      thread: {
        id: params.threadId,
        subject: thread?.subject || null,
        isGroup: members.length > 2,
        participants: ids.filter((id) => id !== ctx.userId).map((id) => uName.get(id) || "User"),
      },
      members: members.map((m) => ({ userId: m.userId, name: uName.get(m.userId) || "User", lastReadAt: m.lastReadAt, mine: m.userId === ctx.userId })),
      hasMore, oldestId: slice[0]?.id || null,
      messages: slice.map((m) => ({
        id: m.id,
        body: m.body,
        bodyHtml: m.bodyHtml,
        attachments: parseAttachments(m.attachmentsJson),
        reactions: groupReactions(m.reactions as ReactionRow[], ctx.userId),
        createdAt: m.createdAt,
        editedAt: m.editedAt,
        mine: m.senderUserId === ctx.userId,
        senderId: m.senderUserId,
        senderName: uName.get(m.senderUserId) || "User",
      })),
    });
  } catch (err) { return handleError(err); }
}

function parseAttachments(json: string | null | undefined): any[] {
  if (!json) return [];
  try { const v = JSON.parse(json); return Array.isArray(v) ? v : []; } catch { return []; }
}
