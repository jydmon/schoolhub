import React from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import LoginScreen from "@/auth/LoginScreen";
import AppShell from "@/app/shell";
import { Logo, T } from "@/ui/kit";

/**
 * One shared codebase renders five role experiences (parent, teacher, driver,
 * school admin, student). The active app is chosen from the sign-in role; a
 * single install adapts to whoever signs in.
 */
function Splash() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: T.bg }}>
      <Logo size={56} radius={16} />
      <Text style={{ fontSize: 22, fontWeight: "800", color: T.ink, marginTop: 14, marginBottom: 12 }}>SIPlat</Text>
      <ActivityIndicator color={T.brand} />
    </View>
  );
}

export default function RootNavigator() {
  const { loading, boot } = useAuth();
  if (loading) return <Splash />;
  if (!boot) return <LoginScreen />;
  return <AppShell roleKey={boot.role} />;
}
