import React from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "@/auth/AuthContext";
import RootNavigator from "@/navigation/RootNavigator";
import { ToastHost } from "@/ui/kit";

/**
 * SIPlat mobile — one Expo / React Native codebase that renders the parent,
 * teacher, driver, school-admin and student apps. Deep links use the
 * `siplat://` scheme (see app.json) so push notifications and emails can open
 * a specific screen.
 */
export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <RootNavigator />
        <ToastHost />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
