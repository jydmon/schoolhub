import React from "react";
import { View, Text, Pressable, ScrollView, TextInput, StyleSheet, ActivityIndicator } from "react-native";

export const T = {
  bg: "#f6f8fb", panel: "#ffffff", ink: "#0f172a", muted: "#64748b", line: "#e2e8f0",
  brand: "#2563eb", ok: "#16a34a", warn: "#d97706", danger: "#dc2626",
};

export function Screen({ children, scroll = true, refreshing, onRefresh }: any) {
  const Container: any = scroll ? ScrollView : View;
  return <Container style={s.screen} contentContainerStyle={scroll ? { padding: 16 } : undefined}>{children}</Container>;
}

export function Card({ children, style }: any) {
  return <View style={[s.card, style]}>{children}</View>;
}
export function Title({ children }: any) { return <Text style={s.title}>{children}</Text>; }
export function Sub({ children }: any) { return <Text style={s.sub}>{children}</Text>; }
export function Muted({ children, style }: any) { return <Text style={[s.muted, style]}>{children}</Text>; }
export function Row({ children, style }: any) { return <View style={[s.row, style]}>{children}</View>; }

export function Badge({ children, tone = "neutral" }: { children: any; tone?: "neutral" | "ok" | "warn" | "danger" }) {
  const bg = tone === "ok" ? "#dcfce7" : tone === "warn" ? "#fef3c7" : tone === "danger" ? "#fee2e2" : "#eef2ff";
  const fg = tone === "ok" ? "#166534" : tone === "warn" ? "#92400e" : tone === "danger" ? "#991b1b" : "#3730a3";
  return <Text style={[s.badge, { backgroundColor: bg, color: fg }]}>{children}</Text>;
}

export function Button({ title, onPress, tone = "brand", disabled }: any) {
  const bg = tone === "danger" ? T.danger : tone === "secondary" ? "#eef2f7" : T.brand;
  const fg = tone === "secondary" ? T.ink : "#fff";
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[s.btn, { backgroundColor: bg, opacity: disabled ? 0.5 : 1 }]}>
      <Text style={{ color: fg, fontWeight: "700" }}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, ...props }: any) {
  return (
    <View style={{ marginTop: 10 }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TextInput style={s.input} placeholderTextColor={T.muted} {...props} />
    </View>
  );
}

export function Loading() { return <View style={s.center}><ActivityIndicator color={T.brand} /></View>; }
export function Notice({ children, tone = "ok" }: any) {
  const bg = tone === "err" ? "#fef2f2" : tone === "info" ? "#eff6ff" : "#f0fdf4";
  const fg = tone === "err" ? "#991b1b" : tone === "info" ? "#1e40af" : "#166534";
  return <Text style={[s.notice, { backgroundColor: bg, color: fg }]}>{children}</Text>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  card: { backgroundColor: T.panel, borderColor: T.line, borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 14 },
  title: { fontSize: 17, fontWeight: "700", color: T.ink, marginBottom: 2 },
  sub: { fontSize: 13, color: T.muted, marginBottom: 8 },
  muted: { color: T.muted, fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  badge: { paddingHorizontal: 9, paddingVertical: 2, borderRadius: 999, fontSize: 12, fontWeight: "700", overflow: "hidden" },
  btn: { paddingVertical: 11, paddingHorizontal: 16, borderRadius: 10, alignItems: "center", marginTop: 10 },
  label: { fontSize: 12, color: T.muted, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: T.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: T.ink, backgroundColor: "#fff" },
  notice: { padding: 10, borderRadius: 8, fontSize: 13, marginTop: 8, overflow: "hidden" },
});
