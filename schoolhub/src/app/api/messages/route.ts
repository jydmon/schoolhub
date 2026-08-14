import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { messagingContacts, assertCanMessage, findOrCreateDirectThread, createGroupThread } from "@/lib/messaging";
import { sanitizeRichText, htmlToText } from "@/lib/sanitize-html";
import { validateAttachments, messagePreview } from "@/lib/messaging-logic";
import { dmSendSchema } from "@/lib/validation";
import { notify } from "@/lib/transport";
import { handleError, ok, AppError } from "@/lib/http";

// GET: the user's conversations (with last message + unread) and the people they
// may message. Optional ?q= searches thread titles, participants and message
// content. POST: send a message (rich text + attachments); starts a thread if
// needed.
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const q = new URL(req.url).searchParams.get("q")?.trim().toLowerCase() || "";

    const memberships = await prisma.directThreadMember.findMany({
      where: { userId: ctx.userId },
      include: { thread: { include: { members: true, messages: { orderBy: { createdAt: "desc" }, take: 1 } } } },
    });
    const otherIds = Array.from(new Set(memberships.flatMap((m) => m.thread.members.map((x) => x.userId)).filter((id) => id !== ctx.userId)));
    const users = otherIds.length ? await prisma.user.findMany({ where: { id: { in: otherIds } }, select: { id: true, fullName: true, email: true } }) : [];
    const uName = new Map(users.map((u) => [u.id, u.fullName || u.email]));

    // When searching, find threads whose message CONTENT matches (title/participant
    // matching is applied below in JS).
    let contentMatch: Set<string> | null = null;
    if (q) {
      const hits = await prisma.directMessageItem.findMany({
        where: { thread: { members: { some: { userId: ctx.userId } } }, body: { contains: q, mode: "insensitive" } },
        select: { threadId: true }, take: 500,
      });
      contentMatch = new Set(hits.map((h) => h.threadId));
    }

    let threads = await Promise.all(memberships.map(async (m) => {
      const others = m.thread.members.filter((x) => x.userId !== ctx.userId).map((x) => uName.get(x.userId) || "User");
      const last = m.thread.messages[0] || null;
      const attachCount = last ? (safeCount(last.attachmentsJson)) : 0;
      const unread = await prisma.directMessageItem.count({ where: { threadId: m.threadId, senderUserId: { not: ctx.userId }, ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}) } });
      const isGroup = m.thread.members.length > 2;
      return {
        threadId: m.threadId,
        title: m.thread.subject || others.join(", ") || "Conversation",
        participants: others, isGroup,
        last: last ? { body: messagePreview(last.body, attachCount), at: last.createdAt, mine: last.senderUserId === ctx.userId, hasAttachment: attachCount > 0 } : null,
        lastAt: m.thread.lastAt, unread,
      };
    }));

    if (q) {
      threads = threads.filter((t) =>
        (contentMatch?.has(t.threadId)) ||
        t.title.toLowerCase().includes(q) ||
        t.participants.some((p) => p.toLowerCase().includes(q)),
      );
    }
    threads.sort((a, b) => +new Date(b.lastAt) - +new Date(a.lastAt));
    const totalUnread = threads.reduce((s, t) => s + t.unread, 0);
    return ok({ threads, totalUnread, contacts: await messagingContacts(ctx.userId) });
  } catch (err) { return handleError(err); }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const b = dmSendSchema.parse(await req.json().catch(() => ({})));

    const attachments = validateAttachments(b.attachments);
    const safeHtml = sanitizeRichText(b.bodyHtml);
    // Plain-text form: prefer explicit body, else derive from the sanitised HTML.
    const plain = (b.body?.trim() || htmlToText(safeHtml)).slice(0, 20000).trim();
    if (!plain && !safeHtml && attachments.length === 0) throw new AppError("Message can't be empty", 400);

    let threadId = b.threadId;
    if (!threadId) {
      // Group creation when multiple recipients (or an explicit subject) are given.
      const group = (b.toUserIds && b.toUserIds.length > 1) || (b.toUserIds && b.toUserIds.length && b.subject);
      if (group) {
        threadId = await createGroupThread(ctx.userId, b.toUserIds!, b.subject);
      } else {
        const target = b.toUserId || (b.toUserIds && b.toUserIds[0]);
        if (!target) throw new AppError("Choose someone to message.", 400);
        const schoolId = await assertCanMessage(ctx.userId, target);
        threadId = await findOrCreateDirectThread(schoolId, ctx.userId, target);
      }
    } else {
      const member = await prisma.directThreadMember.findFirst({ where: { threadId, userId: ctx.userId } });
      if (!member) throw new AppError("You're not part of this conversation.", 403);
    }

    // Members of the (now-resolved) thread — used for mention validation + notify.
    const allMembers = await prisma.directThreadMember.findMany({ where: { threadId }, select: { userId: true } });
    const memberIds = new Set(allMembers.map((m) => m.userId));

    // Threaded reply: parent must belong to this thread.
    let parentId: string | null = null;
    if (b.parentId) {
      const parent = await prisma.directMessageItem.findFirst({ where: { id: b.parentId, threadId }, select: { id: true } });
      if (!parent) throw new AppError("The message you're replying to no longer exists.", 400);
      parentId = parent.id;
    }

    // @mentions: keep only real members other than the sender.
    const mentions = Array.from(new Set((b.mentions || []).filter((id) => memberIds.has(id) && id !== ctx.userId)));

    const msg = await prisma.directMessageItem.create({
      data: { threadId, senderUserId: ctx.userId, body: plain, bodyHtml: safeHtml || null, attachmentsJson: JSON.stringify(attachments), mentionsJson: JSON.stringify(mentions), parentId },
    });
    await prisma.directThread.update({ where: { id: threadId }, data: { lastAt: new Date() } });
    await prisma.directThreadMember.update({ where: { threadId_userId: { threadId, userId: ctx.userId } }, data: { lastReadAt: new Date() } }).catch(() => {});

    // Notify participants: mentioned people get a distinct "mentioned you"; the
    // rest of the thread get a normal "new message".
    const me = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { fullName: true } });
    const thread = await prisma.directThread.findUnique({ where: { id: threadId }, select: { schoolId: true, subject: true } });
    const preview = messagePreview(plain, attachments.length);
    const others = allMembers.map((m) => m.userId).filter((id) => id !== ctx.userId);
    const mentionSet = new Set(mentions);
    const plainOthers = others.filter((id) => !mentionSet.has(id));
    const senderName = me?.fullName || ctx.email;
    const where = thread?.subject ? ` in ${thread.subject}` : "";
    if (mentions.length) await notify(mentions, { kind: "message", title: `${senderName} mentioned you${where}`, body: preview.slice(0, 120), schoolId: thread?.schoolId }).catch(() => {});
    if (plainOthers.length) await notify(plainOthers, { kind: "message", title: `New message from ${senderName}${where}`, body: preview.slice(0, 120), schoolId: thread?.schoolId }).catch(() => {});

    return ok({ threadId, message: { id: msg.id, body: msg.body, bodyHtml: msg.bodyHtml, attachments, mentions, parentId, reactions: [], createdAt: msg.createdAt, mine: true } }, 201);
  } catch (err) { return handleError(err); }
}

function safeCount(json: string | null | undefined): number {
  if (!json) return 0;
  try { const v = JSON.parse(json); return Array.isArray(v) ? v.length : 0; } catch { return 0; }
}
