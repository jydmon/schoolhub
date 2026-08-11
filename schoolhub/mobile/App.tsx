import React from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import * as Linking from "expo-linking";
import { AuthProvider } from "@/auth/AuthContext";
import RootNavigator from "@/navigation/RootNavigator";
import { T } from "@/ui/kit";

/**
 * Deep-linking configuration. The custom scheme "schoolhub://" and the
 * app's universal-link prefix let push notifications and emails open a
 * specific screen (e.g. a trip, a journey, an alert). Tab names below match
 * the role navigators so links resolve regardless of which role is active.
 */
const linking = {
  prefixes: [Linking.createURL("/"), "schoolhub://", "https://app.schoolhub.example"],
  config: {
    screens: {
      Home: "home",
      Operations: "ops",
      Transport: "transport",
      Journeys: "journeys",
      Trips: "trips",
      Assistant: "assistant",
      Alerts: "alerts",
      Emergency: "emergency",
      Account: "account",
    },
  },
};

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: T.bg, primary: T.brand, card: T.panel, text: T.ink, border: T.line },
};

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer linking={linking} theme={navTheme}>
        <AuthProvider>
          <StatusBar style="dark" />
          <RootNavigator />
        </AuthProvider>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
