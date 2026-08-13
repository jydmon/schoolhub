import React, { useEffect, useState, useCallback } from "react";
import { View, Text, Pressable } from "react-native";
import { Card, CardTitle, Sub, Badge, Button, Sheet, T } from "@/ui/kit";
import { api } from "@/api/client";

// Mobile policy gate (item A4/A5/A10): surfaces policies the user must read and
// accept, in every role's app. Fails silent.
export default function PoliciesGate() {
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [reading, setReading] = useState<any | null>(null);

  const load = useCallback(async () => {
    try { const d = await api.get<any>("/api/me/trust-acks"); setItems(d.items || []); } catch { /* ignore */ }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  async function accept(d: any) {
    try { await api.post("/api/me/trust-acks", { documentId: d.id }); } catch { /* ignore */ }
    setReading(null); load();
  }

  const outstanding = items.filter((d) => d.requireAck && (!d.acknowledged || d.updatedSinceAck));
  if (outstanding.length === 0) return null;

  return (
    <View style={{ marginHorizontal: 12, marginTop: 10 }}>
      <Pressable onPress={() => setOpen(true)} style={{ backgroundColor: "#EEF2FF", borderWidth: 1, borderColor: "#C7D2FE", borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Text style={{ flex: 1, fontSize: 13, color: T.ink }}>📋 {outstanding.length} {outstanding.length === 1 ? "policy" : "policies"} to review &amp; accept</Text>
        <Badge tone="info">Review</Badge>
      </Pressable>

      <Sheet visible={open} title={reading ? reading.title : "Policies to accept"} onClose={() => { setOpen(false); setReading(null); }}>
        {reading ? (
          <View style={{ marginTop: 6 }}>
            <Pressable onPress={() => setReading(null)}><Text style={{ color: T.brand, fontWeight: "700", marginBottom: 8 }}>← Back</Text></Pressable>
            <Sub>v{reading.version}{reading.updatedSinceAck ? " · updated since you last accepted" : ""}</Sub>
            <Text style={{ fontSize: 13, color: T.ink, lineHeight: 20, marginVertical: 8 }}>{(reading.bodyHtml || "").replace(/<[^>]+>/g, "").trim() || reading.summary || "Please confirm you have read this policy."}</Text>
            <Button title="I have read & understood" onPress={() => accept(reading)} />
          </View>
        ) : (
          <View style={{ marginTop: 6 }}>
            {outstanding.map((d, i) => (
              <Card key={d.id} style={{ marginTop: i === 0 ? 0 : 8 }}>
                <CardTitle right={d.updatedSinceAck ? <Badge tone="warn">updated</Badge> : undefined}>{d.title}</CardTitle>
                <Sub>{d.summary || d.category}</Sub>
                <Button sm title="Read & accept" onPress={() => setReading(d)} />
              </Card>
            ))}
          </View>
        )}
      </Sheet>
    </View>
  );
}
