import React from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import LoginScreen from "@/auth/LoginScreen";
import ParentApp from "@/apps/parent";
import TeacherApp from "@/apps/teacher";
import DriverApp from "@/apps/driver";
import AdminApp from "@/apps/admin";
import { T } from "@/ui/kit";

/**
 * One shared codebase renders four role experiences. The active app is chosen
 * from the server-issued bootstrap (`boot.appRole`), so a single install adapts
 * to whoever signs in — parent, teacher, driver or school administrator.
 */
function Splash() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: T.bg }}>
      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: T.brand, marginBottom: 14 }} />
      <Text style={{ fontSize: 20, fontWeight: "800", color: T.ink, marginBottom: 12 }}>SchoolHub</Text>
      <ActivityIndicator color={T.brand} />
    </View>
  );
}

const APPS: Record<string, React.ComponentType> = {
  parent: ParentApp,
  teacher: TeacherApp,
  driver: DriverApp,
  admin: AdminApp,
};

export default function RootNavigator() {
  const { loading, boot } = useAuth();
  if (loading) return <Splash />;
  if (!boot) return <LoginScreen />;
  const App = APPS[boot.appRole] || ParentApp;
  return <App />;
}
