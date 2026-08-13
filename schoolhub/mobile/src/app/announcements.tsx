import React, { useEffect, useState, useCallback } from "react";
import { View, Text, Pressable } from "react-native";
import { Card, CardTitle, Sub, Badge, Button, LineItem, Field, Seg, Note, Sheet, T, toast } from "@/ui/kit";
import { api } from "@/api/client";

const PRI: Record<string, { tone: "danger" | "warn" | "info" | "mut"; bg: string; fg: string; label: string }> = {
  critical: { tone: "danger", bg: "#FDEAEA", fg: "#B91C1C", label: "Critical" },
  high: { tone: "warn", bg: "#FEF3C7", fg: "#B45309", label: "High" },
  normal: { tone: "info", bg: "#E0E7FF", fg: "#4338CA", label: "Normal" },
  low: { tone: "mut", bg: "#EEF2F7", fg: "#64748B", label: "Low" },
};
const fmt = (d?: string | null) => { if (!d) return ""; try { return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short" }); } catch { return ""; } };

export default function AnnouncementsBanner() {
  const [data, setData] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const load = useCallback(() => { api.get("/api/me/notices").then(setData).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const act = useCallback(async (action: string, id?: string) => {
    try { await api.post("/api/me/notices", { action, id }); load(); } catch { toast("Couldn't update"); }
  }, [load]);

  if (!data) return null;
  const banner = data.banner && !data.banner.dismissed ? data.banner : null;

  return (
    <>
      {banner ? (
        <Pressable onPress={() => setOpen(true)} style={{ backgroundColor: (PRI[banner.priority] || PRI.normal).bg, marginHorizontal: 12, marginTop: 10, borderRadius: 12, padding: 12, flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
          <View style={{ backgroundColor: (PRI[banner.priority] || PRI.normal).fg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>{(PRI[banner.priority] || PRI.normal).label}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: "700", color: T.ink, fontSize: 13 }}>{banner.title}</Text>
            <Text numberOfLines={2} style={{ fontSize: 12, color: "#334155", marginTop: 2 }}>{banner.body}</Text>
            <Text style={{ fontSize: 10, color: T.muted, marginTop: 3 }}>{banner.scope === "global" ? "Platform" : "School"}{data.unread > 1 ? ` · ${data.unread} unread` : ""} · tap to open</Text>
          </View>
          <Pressable onPress={() => act("dismiss", banner.id)} hitSlop={8}>
            <Text style={{ fontSize: 18, color: (PRI[banner.priority] || PRI.normal).fg }}>×</Text>
          </Pressable>
        </Pressable>
      ) : data.unread > 0 ? (
        <Pressable onPress={() => setOpen(true)} style={{ marginHorizontal: 12, marginTop: 10 }}>
          <Text style={{ color: T.brand, fontWeight: "700", fontSize: 13 }}>📣 {data.unread} unread announcement{data.unread === 1 ? "" : "s"}</Text>
        </Pressable>
      ) : null}

      <Sheet visible={open} title="Announcement Centre" onClose={() => setOpen(false)}>
        {data.canAuthor ? <Composer data={data} reload={load} /> : null}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6, marginBottom: 4 }}>
          <Text style={{ fontSize: 12, color: T.muted }}>{(data.items || []).length} total · {(data.items || []).filter((i: any) => !i.read).length} unread</Text>
          {(data.items || []).some((i: any) => !i.read) ? <Button sm tone="secondary" title="Mark all read" onPress={() => act("read-all")} /> : null}
        </View>
        {(data.items || []).length === 0 ? <Note>No announcements.</Note> : (data.items || []).map((n: any) => {
          const p = PRI[n.priority] || PRI.normal;
          return (
            <Card key={n.id} style={{ borderLeftWidth: 4, borderLeftColor: p.fg, backgroundColor: n.read ? "#fff" : "#F8FAFF" }}>
              <CardTitle right={<Badge tone={p.tone}>{p.label}</Badge>}>{n.title}</CardTitle>
              <Text style={{ fontSize: 13, color: "#334155" }}>{n.body}</Text>
              <Text style={{ fontSize: 10, color: T.muted, marginTop: 6 }}>
                {n.scope === "global" ? "Platform" : "School"}{n.authorName ? ` · ${n.authorName}` : ""} · Published {fmt(n.publishedAt)}{n.expiresAt ? ` · Expires ${fmt(n.expiresAt)}` : ""}
              </Text>
              {!n.read ? <Button sm tone="secondary" title="Mark read" style={{ marginTop: 8 }} onPress={() => act("read", n.id)} /> : null}
            </Card>
          );
        })}
      </Sheet>
    </>
  );
}

function Composer({ data, reload }: any) {
  const canGlobal = !!data.isPlatformAdmin;
  const schools: string[] = data.authorSchools || [];
  const [scope, setScope] = useState<string>(canGlobal ? "global" : "school");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState("normal");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);

  async function publish() {
    setBusy(true);
    try {
      await api.post("/api/admin/notices", { scope, schoolId: scope === "school" ? schools[0] : undefined, title, body, priority });
      setTitle(""); setBody(""); setShow(false); toast("Published"); reload();
    } catch (e: any) { toast(e?.data?.error || "Couldn't publish"); }
    finally { setBusy(false); }
  }

  if (!show) return <Button tone="secondary" title="＋ New announcement" style={{ marginTop: 6 }} onPress={() => setShow(true)} />;
  return (
    <Card style={{ marginTop: 6 }}>
      <CardTitle>New announcement</CardTitle>
      {canGlobal ? <Seg options={[{ label: "Global", active: scope === "global", onPress: () => setScope("global") }, { label: "School", active: scope === "school", onPress: () => setScope("school") }]} /> : null}
      <Field label="Title" value={title} onChangeText={setTitle} />
      <Field label="Description" value={body} onChangeText={setBody} multiline style={{ minHeight: 60 }} />
      <Text style={{ fontSize: 12, color: T.muted, marginTop: 8, marginBottom: 4 }}>Priority</Text>
      <Seg options={["low", "normal", "high", "critical"].map((p) => ({ label: p, active: priority === p, onPress: () => setPriority(p) }))} />
      <Button title={busy ? "Publishing…" : "Publish"} disabled={busy || !title || !body} onPress={publish} />
    </Card>
  );
}
