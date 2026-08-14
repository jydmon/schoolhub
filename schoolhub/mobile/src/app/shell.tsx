import React, { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { T, Avatar, Sheet } from "@/ui/kit";
import { APPS, RoleKey } from "@/data/mock";
import { SCREENS } from "@/app/registry";
import { RoleContext } from "@/app/ctx";
import { useAuth } from "@/auth/AuthContext";
import AnnouncementsBanner from "@/app/announcements";
import SupportAccessNotice from "@/app/support-access";
import PoliciesGate from "@/app/policies-gate";

export default function AppShell({ roleKey }: { roleKey: RoleKey }) {
  const insets = useSafeAreaInsets();
  const { boot, logout } = useAuth();
  const meta = APPS[roleKey];
  const [tab, setTab] = useState(meta.tabs[0].key);
  const [moreOpen, setMoreOpen] = useState(false);

  const userName = boot?.user?.name || meta.who;
  const unread = boot?.unread || 0;
  const ctx = useMemo(() => ({ setTab }), []);
  const ScreenComp = SCREENS[roleKey][tab];

  // Simplified bottom bar: up to 5 primary tabs, the rest behind a "More" menu.
  const MAX_PRIMARY = 5;
  const primary = meta.tabs.slice(0, MAX_PRIMARY);
  const overflow = meta.tabs.slice(MAX_PRIMARY);
  const activeInOverflow = overflow.some((t) => t.key === tab);
  const overflowUnread = overflow.some((t) => t.key === "alerts") && unread > 0;
  const go = (k: string) => { setTab(k); setMoreOpen(false); };

  return (
    <RoleContext.Provider value={ctx}>
      <View style={{ flex: 1, backgroundColor: T.bg }}>
        {/* app bar */}
        <View style={[s.appbar, { paddingTop: insets.top + 6 }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{meta.title} app</Text>
            <Text style={s.school}>{userName}</Text>
          </View>
          <Pressable onLongPress={logout} hitSlop={8}><Avatar name={userName} size={32} /></Pressable>
        </View>

        {/* announcement banner (login banner, all roles) */}
        <AnnouncementsBanner />
        <SupportAccessNotice />
        <PoliciesGate />

        {/* body */}
        <View style={{ flex: 1 }}>{ScreenComp ? <ScreenComp /> : <View />}</View>

        {/* tab bar — primary tabs + a More menu for everything else */}
        <View style={[s.tabbar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          {primary.map((tb) => {
            const active = tb.key === tab;
            const showBadge = tb.key === "alerts" && unread > 0;
            return (
              <Pressable key={tb.key} style={s.tabBtn} onPress={() => setTab(tb.key)}>
                <View>
                  <Text style={{ fontSize: 18 }}>{tb.icon}</Text>
                  {showBadge ? (<View style={s.tabBadge}><Text style={s.tabBadgeTxt}>{unread > 9 ? "9+" : unread}</Text></View>) : null}
                </View>
                <Text style={[s.tabLabel, active && { color: T.brand, fontWeight: "700" }]}>{tb.label}</Text>
              </Pressable>
            );
          })}
          {overflow.length > 0 && (
            <Pressable style={s.tabBtn} onPress={() => setMoreOpen(true)}>
              <View>
                <Text style={{ fontSize: 18 }}>⋯</Text>
                {overflowUnread ? (<View style={s.tabBadge}><Text style={s.tabBadgeTxt}>{unread > 9 ? "9+" : unread}</Text></View>) : null}
              </View>
              <Text style={[s.tabLabel, activeInOverflow && { color: T.brand, fontWeight: "700" }]}>More</Text>
            </Pressable>
          )}
        </View>

        <Sheet visible={moreOpen} title="More" onClose={() => setMoreOpen(false)}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", paddingVertical: 6 }}>
            {overflow.map((tb) => {
              const active = tb.key === tab;
              const badge = tb.key === "alerts" && unread > 0;
              return (
                <Pressable key={tb.key} onPress={() => go(tb.key)} style={s.moreItem}>
                  <View style={[s.moreIcon, active && { backgroundColor: "#EEF2FF" }]}>
                    <Text style={{ fontSize: 24 }}>{tb.icon}</Text>
                    {badge ? (<View style={s.tabBadge}><Text style={s.tabBadgeTxt}>{unread > 9 ? "9+" : unread}</Text></View>) : null}
                  </View>
                  <Text style={{ fontSize: 12, color: active ? T.brand : T.ink, fontWeight: active ? "700" : "500", marginTop: 4 }}>{tb.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </Sheet>
      </View>
    </RoleContext.Provider>
  );
}

const s = StyleSheet.create({
  appbar: { backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: T.line, paddingHorizontal: 16, paddingBottom: 10, flexDirection: "row", alignItems: "center" },
  title: { fontWeight: "700", fontSize: 16, color: T.ink },
  school: { fontSize: 11, color: T.muted, marginTop: 1 },
  tabbar: { flexDirection: "row", backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: T.line, paddingTop: 6, paddingHorizontal: 4 },
  tabBtn: { flex: 1, alignItems: "center", gap: 2, paddingVertical: 2 },
  tabLabel: { fontSize: 10, color: T.muted },
  tabBadge: { position: "absolute", top: -4, right: -10, minWidth: 15, height: 15, paddingHorizontal: 3, borderRadius: 8, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center" },
  tabBadgeTxt: { color: "#fff", fontSize: 9, fontWeight: "700" },
  moreItem: { width: "25%", alignItems: "center", paddingVertical: 12 },
  moreIcon: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#F5F7FB" },
});
