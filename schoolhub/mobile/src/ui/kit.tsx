import React, { useEffect, useState } from "react";
import {
  View, Text, Pressable, ScrollView, TextInput, StyleSheet, Image, Modal,
} from "react-native";

/* ------------------------------------------------------------------ *
 * SIPlat mobile design tokens — matched to the web/demo design system  *
 * brand #4F46E5 · accent #0EA5E9                                        *
 * ------------------------------------------------------------------ */
export const T = {
  brand: "#4F46E5", accent: "#0EA5E9",
  ink: "#0F172A", muted: "#64748B", line: "#E9EDF4", bg: "#EEF2F8", panel: "#FFFFFF",
  ok: "#16A34A", okBg: "#E7F7EC",
  warn: "#B45309", warnBg: "#FEF3C7",
  danger: "#DC2626", dangerBg: "#FDEAEA",
  infoBg: "#DBEAFE", mutBg: "#EEF2F7",
};

type Tone = "ok" | "warn" | "danger" | "info" | "mut";
const BADGE: Record<Tone, { bg: string; fg: string }> = {
  ok: { bg: T.okBg, fg: T.ok },
  warn: { bg: T.warnBg, fg: T.warn },
  danger: { bg: T.dangerBg, fg: T.danger },
  info: { bg: T.infoBg, fg: T.brand },
  mut: { bg: T.mutBg, fg: T.muted },
};

/* ---------------- containers ---------------- */
export function Screen({ children }: any) {
  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: 12, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}
export function Card({ children, style }: any) {
  return <View style={[s.card, style]}>{children}</View>;
}

/* card header: 14px bold + optional right node (usually a Badge) */
export function CardTitle({ children, right }: any) {
  return (
    <View style={s.cardHead}>
      <Text style={s.cardTitle}>{children}</Text>
      {right ? <View>{right}</View> : null}
    </View>
  );
}
export function Title({ children }: any) { return <Text style={s.title}>{children}</Text>; }
export function Sub({ children, style }: any) { return <Text style={[s.sub, style]}>{children}</Text>; }
export function Muted({ children, style }: any) { return <Text style={[s.muted, style]}>{children}</Text>; }

/* generic separated row */
export function Row({ children, first, style }: any) {
  return <View style={[s.row, !first && s.rowBorder, style]}>{children}</View>;
}

/* the very common {title, meta, right} list item */
export function LineItem({ t, m, right, first, highlight }: any) {
  return (
    <View style={[s.row, !first && s.rowBorder, highlight && s.rowHi]}>
      <View style={{ flex: 1, paddingRight: 8 }}>
        {t != null ? <Text style={s.t}>{t}</Text> : null}
        {m != null ? <Text style={s.m}>{m}</Text> : null}
      </View>
      {right != null ? <View style={{ alignItems: "flex-end" }}>{right}</View> : null}
    </View>
  );
}

/* ---------------- badges ---------------- */
export function Badge({ children, tone = "mut" }: { children: any; tone?: Tone }) {
  const c = BADGE[tone];
  return <Text style={[s.badge, { backgroundColor: c.bg, color: c.fg }]}>{children}</Text>;
}

/* ---------------- KPIs ---------------- */
export function Kpis({ children }: any) { return <View style={s.kpis}>{children}</View>; }
export function Kpi({ k, v, h, warn, vColor, vSize }: any) {
  return (
    <View style={[s.kpi, warn && s.kpiWarn]}>
      <Text style={s.kpiK}>{k}</Text>
      <Text style={[s.kpiV, vColor && { color: vColor }, vSize && { fontSize: vSize }]}>{v}</Text>
      {h != null ? <Text style={s.kpiH}>{h}</Text> : null}
    </View>
  );
}

/* ---------------- buttons ---------------- */
export function Button({ title, onPress, tone = "brand", sm, disabled, style }: any) {
  const bg = tone === "danger" ? T.danger : tone === "secondary" ? T.mutBg : T.brand;
  const fg = tone === "secondary" ? T.ink : "#fff";
  return (
    <Pressable onPress={onPress} disabled={disabled}
      style={[sm ? s.btnSm : s.btn, { backgroundColor: bg, opacity: disabled ? 0.5 : 1 }, style]}>
      <Text style={{ color: fg, fontWeight: "700", fontSize: sm ? 12 : 14 }}>{title}</Text>
    </Pressable>
  );
}

/* ---------------- segmented control ---------------- */
export function Seg({ options }: { options: { label: string; active?: boolean; onPress?: () => void }[] }) {
  return (
    <View style={s.seg}>
      {options.map((o, i) => (
        <Pressable key={i} onPress={o.onPress} style={[s.segBtn, o.active && s.segBtnOn]}>
          <Text style={[s.segTxt, o.active && { color: "#fff" }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/* ---------------- fields ---------------- */
export function Field({ label, style, ...props }: any) {
  return (
    <View style={{ marginTop: 10 }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TextInput style={[s.input, style]} placeholderTextColor={T.muted} {...props} />
    </View>
  );
}

/* ---------------- note / notice ---------------- */
export function Note({ children }: any) { return <Text style={s.note}>{children}</Text>; }

/* ---------------- chat bubble ---------------- */
export function Bubble({ who, children }: { who: "me" | "ai"; children: any }) {
  const me = who === "me";
  return (
    <View style={[s.bub, me ? s.bubMe : s.bubAi]}>
      <Text style={{ color: me ? "#fff" : T.ink, fontSize: 13, lineHeight: 19 }}>{children}</Text>
    </View>
  );
}

/* ---------------- avatar (initials) ---------------- */
const AV_COLORS = ["#4F46E5", "#0EA5E9", "#16A34A", "#B45309", "#7C3AED", "#DB2777", "#0891B2", "#EA580C"];
export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const p = name.trim().split(/\s+/);
  const ini = ((p[0]?.[0] || "") + (p[1]?.[0] || "")).toUpperCase();
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const bg = AV_COLORS[h % AV_COLORS.length];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontWeight: "700", fontSize: Math.round(size * 0.36) }}>{ini}</Text>
    </View>
  );
}

/* ---------------- logo (uses the baked-in gradient icon) ---------------- */
export function Logo({ size = 30, radius }: { size?: number; radius?: number }) {
  return (
    <Image source={require("../../assets/icon.png")}
      style={{ width: size, height: size, borderRadius: radius ?? Math.round(size * 0.26) }} />
  );
}

/* ---------------- map placeholder (route depiction, no map dep) ---------------- */
export function RouteMap() {
  return (
    <View style={s.map}>
      <View style={[s.mapLine, { top: 118, left: 18, width: 150, transform: [{ rotate: "-24deg" }] }]} />
      <View style={[s.mapLine, { top: 66, left: 150, width: 150, transform: [{ rotate: "-10deg" }] }]} />
      <Dot color={T.ok} top={126} left={14} label="School" />
      <Dot color="#2563EB" top={58} left={150} label="Bus (live)" />
      <Dot color={T.warn} top={26} left={300} label="Your stop" />
    </View>
  );
}
function Dot({ color, top, left, label }: any) {
  return (
    <View style={{ position: "absolute", top, left, alignItems: "center" }}>
      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color, borderWidth: 2, borderColor: "#fff" }} />
      <Text style={{ fontSize: 9, color: T.muted, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

/* ---------------- simple modal sheet ---------------- */
export function Sheet({ visible, title, onClose, children }: any) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.sheetWrap}>
        <View style={s.sheetCard}>
          <View style={s.sheetHead}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: T.ink }}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10}><Text style={{ fontSize: 20, color: T.muted }}>✕</Text></Pressable>
          </View>
          <ScrollView style={{ paddingHorizontal: 16 }} contentContainerStyle={{ paddingBottom: 20 }}>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/* toggle switch */
export function Toggle({ on, onPress }: any) {
  return (
    <Pressable onPress={onPress} style={[s.toggle, on && { backgroundColor: T.ok }]}>
      <View style={[s.toggleKnob, on && { left: 21 }]} />
    </Pressable>
  );
}

/* ---------------- toast ---------------- */
let toastFn: ((m: string) => void) | null = null;
export function toast(msg: string) { toastFn?.(msg); }
export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let timer: any;
    toastFn = (m: string) => { setMsg(m); clearTimeout(timer); timer = setTimeout(() => setMsg(null), 1800); };
    return () => { toastFn = null; clearTimeout(timer); };
  }, []);
  if (!msg) return null;
  return (
    <View pointerEvents="none" style={s.toastWrap}>
      <Text style={s.toast}>{msg}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  card: { backgroundColor: T.panel, borderColor: T.line, borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 11 },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  cardTitle: { fontSize: 14, fontWeight: "700", color: T.ink, flex: 1 },
  title: { fontSize: 20, fontWeight: "800", color: T.ink, marginBottom: 8 },
  sub: { fontSize: 12, color: T.muted, marginBottom: 8 },
  muted: { color: T.muted, fontSize: 12 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 9, paddingVertical: 9 },
  rowBorder: { borderTopWidth: 1, borderTopColor: T.line },
  rowHi: { backgroundColor: "#EEF2FF", borderRadius: 10, paddingHorizontal: 8 },
  t: { fontWeight: "600", fontSize: 13, color: T.ink },
  m: { fontSize: 11, color: T.muted, marginTop: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, fontSize: 10, fontWeight: "700", overflow: "hidden" },
  kpis: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: 0 },
  kpi: { width: "48.5%", backgroundColor: T.panel, borderColor: T.line, borderWidth: 1, borderRadius: 14, padding: 11, marginBottom: 9 },
  kpiWarn: { backgroundColor: "#FFFBEB", borderColor: "#FCD9A8" },
  kpiK: { fontSize: 11, color: T.muted },
  kpiV: { fontSize: 22, fontWeight: "800", color: T.ink, marginTop: 1 },
  kpiH: { fontSize: 10, color: T.muted, marginTop: 1 },
  btn: { paddingVertical: 11, paddingHorizontal: 14, borderRadius: 11, alignItems: "center", marginTop: 8 },
  btnSm: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 9, alignItems: "center" },
  seg: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10, marginTop: 2 },
  segBtn: { borderWidth: 1, borderColor: T.line, backgroundColor: "#fff", borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 },
  segBtnOn: { backgroundColor: T.brand, borderColor: T.brand },
  segTxt: { fontSize: 12, color: T.ink },
  label: { fontSize: 12, color: T.muted, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: T.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: T.ink, backgroundColor: "#fff" },
  note: { backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: T.line, borderRadius: 10, padding: 10, fontSize: 11, color: "#475569", marginTop: 4 },
  bub: { maxWidth: "84%", paddingVertical: 9, paddingHorizontal: 11, borderRadius: 14, marginBottom: 8 },
  bubMe: { alignSelf: "flex-end", backgroundColor: T.brand, borderBottomRightRadius: 4 },
  bubAi: { alignSelf: "flex-start", backgroundColor: "#fff", borderWidth: 1, borderColor: T.line, borderBottomLeftRadius: 4 },
  map: { height: 170, borderRadius: 12, borderWidth: 1, borderColor: T.line, backgroundColor: "#EEF6FF", overflow: "hidden", marginBottom: 4 },
  mapLine: { position: "absolute", height: 5, borderRadius: 3, backgroundColor: "#93C5FD" },
  sheetWrap: { flex: 1, backgroundColor: "rgba(15,23,41,0.55)", justifyContent: "flex-end" },
  sheetCard: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "88%", paddingBottom: 8 },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16 },
  toggle: { width: 42, height: 24, borderRadius: 999, backgroundColor: "#CBD5E1", justifyContent: "center" },
  toggleKnob: { position: "absolute", top: 3, left: 3, width: 18, height: 18, borderRadius: 9, backgroundColor: "#fff" },
  toastWrap: { position: "absolute", bottom: 96, left: 0, right: 0, alignItems: "center", zIndex: 50 },
  toast: { backgroundColor: "#0B1220", color: "#fff", fontSize: 12, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, overflow: "hidden" },
});
