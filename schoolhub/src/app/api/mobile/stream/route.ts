import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/session";

export const dynamic = "force-dynamic";

// Server-Sent Events stream for near-real-time notification badges. The app opens
// this and updates its badge as events arrive; it also falls back to /mobile/sync
// polling on networks that block SSE. (A production build may prefer WebSockets /
// a managed realtime service; SSE keeps the API dependency-free.)
export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return new Response("unauthorized", { status: 401 });

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | null = null;
  let ticks = 0;

  const stream = new ReadableStream({
    async start(controller) {
      const push = async () => {
        try {
          const unread = await prisma.notification.count({ where: { userId: ctx.userId, read: false } });
          controller.enqueue(encoder.encode(`event: unread\ndata: ${JSON.stringify({ unread, at: new Date().toISOString() })}\n\n`));
        } catch { /* ignore transient errors */ }
      };
      await push();
      timer = setInterval(async () => {
        ticks++;
        await push();
        if (ticks >= 30) { if (timer) clearInterval(timer); controller.close(); } // ~5 min, client reconnects
      }, 10_000);
    },
    cancel() { if (timer) clearInterval(timer); },
  });

  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
