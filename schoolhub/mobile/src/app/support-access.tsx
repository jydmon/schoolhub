import React, { useEffect, useState, useCallback } from "react";
import { View, Text } from "react-native";
import { Button, T } from "@/ui/kit";
import { api } from "@/api/client";

// Mobile support-access prompt: shows any pending Super-Admin access requests
// (approve / reject) and active sessions (revoke) for the signed-in user.
// Mounted in the app shell so it appears in every role's app. Fails silent.
export default function SupportAccessNotice() {
  const [pending, setPending] = useState<any[]>([]);
  const [active, setActive] = useState<any[]>([]);

  const load = useCallback(async () => {
    try { const d = await api.get<any>("/api/me/support-access"); setPending(d.pending || []); setActive(d.active || []); }
    catch { /* ignore */ }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);

  async function respond(id: string, action: string) {
    try { await api.post("/api/me/support-access", { id, action }); } catch { /* ignore */ }
    load();
  }

  if (!pending.length && !active.length) return null;
  return (
    <View style={{ marginHorizontal: 12, marginTop: 10, gap: 8 }}>
      {pending.map((r) => (
        <View key={r.id} style={{ backgroundColor: "#EEF2FF", borderWidth: 1, borderColor: "#C7D2FE", borderRadius: 12, padding: 12 }}>
          <Text style={{ fontSize: 13, color: T.ink, fontWeight: "700" }}>🔐 Support access request</Text>
          <Text style={{ fontSize: 12, color: "#334155", marginTop: 3 }}>{r.requesterName || r.requesterEmail} is requesting {r.durationMins} min access to your portal. Reason: {r.reason}</Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            <View style={{ flex: 1 }}><Button sm title="Approve" onPress={() => respond(r.id, "approve")} /></View>
            <View style={{ flex: 1 }}><Button sm tone="secondary" title="Reject" onPress={() => respond(r.id, "reject")} /></View>
          </View>
        </View>
      ))}
      {active.map((r) => (
        <View key={r.id} style={{ backgroundColor: "#FFF7ED", borderWidth: 1, borderColor: "#FDBA74", borderRadius: 12, padding: 12 }}>
          <Text style={{ fontSize: 12, color: "#9A3412" }}>🛟 {r.requesterName || r.requesterEmail} has an active support session on your account{r.minutesLeft != null ? ` · ${r.minutesLeft} min left` : ""}.</Text>
          <View style={{ marginTop: 8 }}><Button sm tone="danger" title="Revoke access" onPress={() => respond(r.id, "revoke")} /></View>
        </View>
      ))}
    </View>
  );
}
