import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { groupReactions, isAllowedReaction, type ReactionRow } from "@/lib/messaging-logic";
import { dmReactSchema } from "@/lib/validation";
import { handleError, ok, AppError } from "@/lib/http";

type Params = { params: { threadId: string } };

// Toggle an emoji reaction on a message in this thread. Adds the reaction if the
// caller hasn't reacted with it, removes it otherwise. Returns the updated,
// grouped reaction summary for that message.
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { messageId, emoji } = dmReactSchema.parse(await req.json().catch(() => ({})));
    if (!isAllowedReaction(emoji)) throw new AppError("That reaction isn't allowed.", 400);

    const member = await prisma.directThreadMember.findFirst({ where: { threadId: params.threadId, userId: ctx.userId } });
    if (!member) throw new AppError("You're not part of this conversation.", 403);

    const msg = await prisma.directMessageItem.findFirst({ where: { id: messageId, threadId: params.threadId }, select: { id: true } });
    if (!msg) throw new AppError("Message not found.", 404);

    const existing = await prisma.directMessageReaction.findUnique({ where: { messageId_userId_emoji: { messageId, userId: ctx.userId, emoji } } });
    if (existing) await prisma.directMessageReaction.delete({ where: { id: existing.id } });
    else await prisma.directMessageReaction.create({ data: { messageId, userId: ctx.userId, emoji } });

    const rows = await prisma.directMessageReaction.findMany({ where: { messageId }, select: { emoji: true, userId: true } });
    return ok({ messageId, reactions: groupReactions(rows as ReactionRow[], ctx.userId) });
  } catch (err) { return handleError(err); }
}
