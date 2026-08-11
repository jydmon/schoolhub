import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

type Params = { params: { token: string } };

// Public secure location-sharing endpoint for a hired coach. Auto-expires: once
// coachExpiresAt has passed the link returns 410 Gone (temporary access ends).
export async function GET(_req: Request, { params }: Params) {
  const trip = await prisma.trip.findUnique({ where: { coachToken: params.token }, include: { updates: { orderBy: { at: "desc" }, take: 5 } } });
  if (!trip) return NextResponse.json({ error: "Unknown link" }, { status: 404 });
  if (trip.coachExpiresAt && trip.coachExpiresAt < new Date()) return NextResponse.json({ error: "This trip link has expired" }, { status: 410 });
  return NextResponse.json({
    trip: { title: trip.title, date: trip.date, destination: trip.destination, status: trip.status, driverName: trip.coachDriverName },
    updates: trip.updates.map((u) => ({ type: u.type, note: u.note, at: u.at })),
    expiresAt: trip.coachExpiresAt,
  });
}
