import { prisma } from "@/lib/db";
import { getFeedEvents } from "@/lib/parent";
import { toICS } from "@/lib/calendar";
import { NextResponse } from "next/server";

type Params = { params: { token: string } };

// Public, token-authenticated ICS feed of a parent's family calendar. Paste the
// URL into Google/Outlook/Apple Calendar as a subscription to keep it in sync.
export async function GET(_req: Request, { params }: Params) {
  const user = await prisma.user.findUnique({ where: { calendarToken: params.token }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "Unknown calendar" }, { status: 404 });

  const events = await getFeedEvents(user.id, new Date());
  const ics = toICS(
    events.map((e: any) => ({ id: e.id, title: e.title, description: e.description, location: e.location, startsAt: e.startsAt, endsAt: e.endsAt, allDay: e.allDay, reminderOffsets: e.reminderOffsets })),
    { calName: "SchoolHub — Family calendar" }
  );
  return new NextResponse(ics, {
    status: 200,
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `inline; filename="schoolhub-family.ics"` },
  });
}
