import React, { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { T, Avatar } from "@/ui/kit";
import { APPS, RoleKey } from "@/data/mock";
import { SCREENS } from "@/app/registry";
import { RoleContext } from "@/app/ctx";
import { useAuth } from "@/auth/AuthContext";
import AnnouncementsBanner from "@/app/announcements";
import SupportAccessNotice from "@/app/support-access";

export default function AppShell({ roleKey }: { roleKey: RoleKey }) {
  const insets = useSafeAreaInsets();
  const { boot, logout } = useAuth();
  const meta = APPS[roleKey];
  const [tab, setTab] = useState(meta.tabs[0].key);

  const userName = boot?.user?.name || meta.who;
  const unread = boot?.unread || 0;
  const ctx = useMemo(() => ({ setTab }), []);
  const ScreenComp = SCREENS[roleKey][tab];

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

        {/* body */}
        <View style={{ flex: 1 }}>{ScreenComp ? <ScreenComp /> : <View />}</View>

        {/* tab bar */}
        <View style={[s.tabbar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          {meta.tabs.map((tb) => {
            const active = tb.key === tab;
            const showBadge = tb.key === "alerts" && unread > 0;
            return (
              <Pressable key={tb.key} style={s.tabBtn} onPress={() => setTab(tb.key)}>
                <View>
                  <Text style={{ fontSize: 18 }}>{tb.icon}</Text>
                  {showBadge ? (
                    <View style={s.tabBadge}><Text style={s.tabBadgeTxt}>{unread > 9 ? "9+" : unread}</Text></View>
                  ) : null}
                </View>
                <Text style={[s.tabLabel, active && { color: T.brand, fontWeight: "700" }]}>{tb.label}</Text>
              </Pressable>
            );
          })}
        </View>
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
});
