import React, { useEffect, useMemo, useState, useCallback } from "react";
import { View, Text, Pressable } from "react-native";
import { Screen, Card, CardTitle, Badge, Seg, Loading, Note, Sheet, LineItem, T } from "@/ui/kit";
import { api } from "@/api/client";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (d: Date, n: number) => { const x = new Date(d); x.setDate(1); x.setMonth(x.getMonth() + n); return x; };
const startOfWeek = (d: Date) => { const x = new Date(d); const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); x.setHours(0, 0, 0, 0); return x; };
const sameDay = (a: Date, b: Date) => ymd(a) === ymd(b);
const DOW = ["M", "T", "W", "T", "F", "S", "S"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TYPE_COLOR: Record<string, string> = { event: "#4338CA", trip: "#0891B2", homework: "#0F766E", timetable: "#7C3AED" };
const TYPE_ICON: Record<string, string> = { event: "📌", trip: "🧳", homework: "📚", timetable: "🗓️" };
const color = (it: any) => TYPE_COLOR[it.type] || "#4338CA";
const timeOf = (it: any) => it.allDay ? "All day" : new Date(it.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

type View = "month" | "week" | "day";

export default function ParentCalendarScreen() {
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<any>(null);

  const win = useMemo(() => {
    if (view === "day") { const s = new Date(cursor); s.setHours(0, 0, 0, 0); return { from: addDays(s, -1), to: addDays(s, 2) }; }
    if (view === "week") { const s = startOfWeek(cursor); return { from: addDays(s, -1), to: addDays(s, 8) }; }
    const m0 = new Date(cursor.getFullYear(), cursor.getMonth(), 1); return { from: addDays(startOfWeek(m0), -1), to: addMonths(m0, 1) };
  }, [view, cursor]);

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await api.get<any>(`/api/parent/calendar/items?from=${win.from.toISOString()}&to=${win.to.toISOString()}`); setItems(d.items || []); }
    catch { setItems([]); }
    finally { setLoading(false); }
  }, [win.from, win.to]);
  useEffect(() => { load(); }, [load]);

  const onDay = (day: Date) => items.filter((it) => {
    const s = new Date(it.startsAt); const e = it.endsAt ? new Date(it.endsAt) : s;
    return ymd(s) <= ymd(day) && ymd(day) <= ymd(e);
  }).sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const nav = (dir: number) => setCursor((c) => view === "day" ? addDays(c, dir) : view === "week" ? addDays(c, dir * 7) : addMonths(c, dir));
  const label = view === "day" ? cursor.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })
    : view === "week" ? `Week of ${startOfWeek(cursor).toLocaleDateString([], { day: "numeric", month: "short" })}`
    : `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;

  const today = new Date();
  const monthCells = useMemo(() => { const start = startOfWeek(new Date(cursor.getFullYear(), cursor.getMonth(), 1)); return Array.from({ length: 42 }, (_, i) => addDays(start, i)); }, [cursor]);
  const homework = useMemo(() => items.filter((it) => it.type === "homework" && new Date(it.startsAt) >= new Date(new Date().setHours(0, 0, 0, 0))).sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 6), [items]);

  const Item = ({ it }: any) => (
    <Pressable onPress={() => setDetail(it)} style={{ flexDirection: "row", gap: 8, borderLeftWidth: 3, borderLeftColor: color(it), backgroundColor: "#fff", borderWidth: 1, borderColor: T.line, borderRadius: 8, padding: 8, marginBottom: 6 }}>
      <Text style={{ fontSize: 11, color: T.muted, minWidth: 58 }}>{timeOf(it)}</Text>
      <Text style={{ flex: 1, fontSize: 13, color: T.ink, fontWeight: "600" }} numberOfLines={1}>{TYPE_ICON[it.type] || "📌"} {it.title}</Text>
    </Pressable>
  );

  return (
    <Screen>
      {homework.length > 0 ? (
        <Card>
          <CardTitle>📚 Upcoming homework</CardTitle>
          {homework.map((it, i) => (
            <Pressable key={it.id} onPress={() => setDetail(it)}>
              <LineItem first={i === 0} t={it.title} m={new Date(it.startsAt).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })} right={<Badge tone="info">open</Badge>} />
            </Pressable>
          ))}
        </Card>
      ) : null}

      <Card>
        <Seg options={(["month", "week", "day"] as View[]).map((v) => ({ label: v[0].toUpperCase() + v.slice(1), active: view === v, onPress: () => setView(v) }))} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Pressable onPress={() => nav(-1)} hitSlop={8}><Text style={{ fontSize: 20, color: T.brand }}>‹</Text></Pressable>
          <Pressable onPress={() => setCursor(new Date())}><Text style={{ fontWeight: "700", color: T.ink }}>{label}</Text></Pressable>
          <Pressable onPress={() => nav(1)} hitSlop={8}><Text style={{ fontSize: 20, color: T.brand }}>›</Text></Pressable>
        </View>
      </Card>

      {loading && items.length === 0 ? <Loading /> : view === "month" ? (
        <Card>
          <View style={{ flexDirection: "row" }}>{DOW.map((d, i) => <Text key={i} style={{ flex: 1, textAlign: "center", fontSize: 10, color: T.muted, fontWeight: "700" }}>{d}</Text>)}</View>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {monthCells.map((day, i) => {
              const de = onDay(day); const other = day.getMonth() !== cursor.getMonth(); const isToday = sameDay(day, today);
              return (
                <Pressable key={i} onPress={() => { setCursor(day); setView("day"); }} style={{ width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: isToday ? T.brand : de.length ? "#EEF2FF" : "transparent" }}>
                  <Text style={{ fontSize: 12, color: isToday ? "#fff" : other ? "#CBD5E1" : T.ink }}>{day.getDate()}</Text>
                  {de.length && !isToday ? <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: color(de[0]), marginTop: 1 }} /> : null}
                </Pressable>
              );
            })}
          </View>
        </Card>
      ) : view === "week" ? (
        Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i)).map((day, i) => {
          const de = onDay(day);
          return (
            <Card key={i}>
              <CardTitle right={sameDay(day, today) ? <Badge tone="info">today</Badge> : undefined}>{day.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" })}</CardTitle>
              {de.length === 0 ? <Text style={{ color: T.muted, fontSize: 12 }}>—</Text> : de.map((it) => <Item key={it.id} it={it} />)}
            </Card>
          );
        })
      ) : (
        <Card>
          <CardTitle>{cursor.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}</CardTitle>
          {onDay(cursor).length === 0 ? <Text style={{ color: T.muted, fontSize: 13, paddingVertical: 6 }}>Nothing scheduled.</Text> : onDay(cursor).map((it) => <Item key={it.id} it={it} />)}
        </Card>
      )}

      <Note>Tap any entry for full details. Events, trips, homework and timetable across your children.</Note>

      <Sheet visible={!!detail} title="Event details" onClose={() => setDetail(null)}>
        {detail ? (
          <Card style={{ marginTop: 6 }}>
            <CardTitle right={<Badge tone="info">{detail.type}</Badge>}>{TYPE_ICON[detail.type] || "📌"} {detail.title}</CardTitle>
            <LineItem first t="When" m={`${detail.allDay ? "All day · " : ""}${new Date(detail.startsAt).toLocaleString()}`} />
            {detail.location ? <LineItem t="Location" m={detail.location} /> : null}
            <LineItem t="For" m={Array.from(new Set(detail.childNames || [])).join(", ")} />
            {detail.schoolName ? <LineItem t="School" m={detail.schoolName} /> : null}
            {detail.description ? <LineItem t="Details" m={detail.description} /> : null}
          </Card>
        ) : null}
      </Sheet>
    </Screen>
  );
}
