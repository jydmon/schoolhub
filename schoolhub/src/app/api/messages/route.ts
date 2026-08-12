import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { messagingContacts, assertCanMessage, findOrCreateDirectThread } from "@/lib/messaging";
import { notify } from "@/lib/transport";
import { handleError, ok, AppError } from "@/lib/http";

// GET: the user's conversations (with last message + unread) and the people
// they're allowed to message. POST: send a message (starts a thread if needed).
export async function GET() {
  try {
    const ctx = await requireAuth();
    const memberships = await prisma.directThreadMember.findMany({
      where: { userId: ctx.userId },
      include: { thread: { include: { members: true, messages: { orderBy: { createdAt: "desc" }, take: 1 } } } },
    });
    const otherIds = Array.from(new Set(memberships.flatMap((m) => m.thread.members.map((x) => x.userId)).filter((id) => id !== ctx.userId)));
    const users = otherIds.length ? await prisma.user.findMany({ where: { id: { in: otherIds } }, select: { id: true, fullName: true, email: true } }) : [];
    const uName = new Map(users.map((u) => [u.id, u.fullName || u.email]));

    const threads = await Promise.all(memberships.map(async (m) => {
      const others = m.thread.members.filter((x) => x.userId !== ctx.userId).map((x) => uName.get(x.userId) || "User");
      const last = m.thread.messages[0] || null;
      const unread = await prisma.directMessageItem.count({ where: { threadId: m.threadId, senderUserId: { not: ctx.userId }, ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}) } });
      return { threadId: m.threadId, title: m.thread.subject || others.join(", ") || "Conversation", participants: others, last: last ? { body: last.body, at: last.createdAt, mine: last.senderUserId === ctx.userId } : null, lastAt: m.thread.lastAt, unread };
    }));
    threads.sort((a, b) => +new Date(b.lastAt) - +new Date(a.lastAt));
    const totalUnread = threads.reduce((s, t) => s + t.unread, 0);
    return ok({ threads, totalUnread, contacts: await messagingContacts(ctx.userId) });
  } catch (err) { return handleError(err); }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const b = await req.json().catch(() => ({}));
    const body = String(b.body || "").trim();
    if (!body) throw new AppError("Message body required", 400);

    let threadId = b.threadId as string | undefined;
    let schoolId: string | null = null;
    if (!threadId) {
      if (!b.toUserId) throw new AppError("Choose someone to message.", 400);
      schoolId = await assertCanMessage(ctx.userId, String(b.toUserId));
      threadId = await findOrCreateDirectThread(schoolId, ctx.userId, String(b.toUserId));
    } else {
      const member = await prisma.directThreadMember.findFirst({ where: { threadId, userId: ctx.userId } });
      if (!member) throw new AppError("You're not part of this conversation.", 403);
    }

    const msg = await prisma.directMessageItem.create({ data: { threadId, senderUserId: ctx.userId, body } });
    await prisma.directThread.update({ where: { id: threadId }, data: { lastAt: new Date() } });
    await prisma.directThreadMember.update({ where: { threadId_userId: { threadId, userId: ctx.userId } }, data: { lastReadAt: new Date() } }).catch(() => {});

    // Notify the other participants (in-app; email follows their prefs).
    const members = await prisma.directThreadMember.findMany({ where: { threadId, userId: { not: ctx.userId } }, select: { userId: true } });
    const me = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { fullName: true } });
    const thread = await prisma.directThread.findUnique({ where: { id: threadId }, select: { schoolId: true } });
    if (members.length) await notify(members.map((m) => m.userId), { kind: "message", title: `New message from ${me?.fullName || ctx.email}`, body: body.slice(0, 120), schoolId: thread?.schoolId }).catch(() => {});

    return ok({ threadId, message: { id: msg.id, body: msg.body, createdAt: msg.createdAt, mine: true } }, 201);
  } catch (err) { return handleError(err); }
}
