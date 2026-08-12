import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { handleError, ok, AppError } from "@/lib/http";

type Params = { params: { threadId: string } };

// The full message history for one conversation. Marks it read for the caller.
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const member = await prisma.directThreadMember.findFirst({ where: { threadId: params.threadId, userId: ctx.userId } });
    if (!member) throw new AppError("You're not part of this conversation.", 403);

    const [thread, messages, members] = await Promise.all([
      prisma.directThread.findUnique({ where: { id: params.threadId } }),
      prisma.directMessageItem.findMany({ where: { threadId: params.threadId }, orderBy: { createdAt: "asc" }, take: 500 }),
      prisma.directThreadMember.findMany({ where: { threadId: params.threadId }, select: { userId: true } }),
    ]);
    const ids = members.map((m) => m.userId);
    const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, email: true } });
    const uName = new Map(users.map((u) => [u.id, u.fullName || u.email]));

    await prisma.directThreadMember.update({ where: { threadId_userId: { threadId: params.threadId, userId: ctx.userId } }, data: { lastReadAt: new Date() } }).catch(() => {});

    return ok({
      thread: { id: params.threadId, subject: thread?.subject || null, participants: ids.filter((id) => id !== ctx.userId).map((id) => uName.get(id) || "User") },
      messages: messages.map((m) => ({ id: m.id, body: m.body, createdAt: m.createdAt, mine: m.senderUserId === ctx.userId, senderName: uName.get(m.senderUserId) || "User" })),
    });
  } catch (err) { return handleError(err); }
}
