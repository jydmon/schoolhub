import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { toICS } from "@/lib/calendar";
import { handleError } from "@/lib/http";
import { NextResponse } from "next/server";

type Params = { params: { id: string; eventId: string } };

// Download a single event as an .ics file (Apple Calendar / any client).
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    const e = await prisma.calendarEvent.findFirst({ where: { id: params.eventId, schoolId: params.id } });
    if (!e) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const ics = toICS([{ id: e.id, title: e.title, description: e.description, location: e.location, startsAt: e.startsAt, endsAt: e.endsAt, allDay: e.allDay, reminderOffsets: e.reminderOffsets }], { calName: e.title });
    return new NextResponse(ics, {
      status: 200,
      headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="event-${e.id}.ics"` },
    });
  } catch (err) {
    return handleError(err);
  }
}
