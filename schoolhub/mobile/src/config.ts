import Constants from "expo-constants";

// The SchoolHub cloud API base URL. Set EXPO_PUBLIC_API_URL for device/prod
// builds (e.g. https://api.schoolhub.example). Defaults to the dev web server;
// on a physical device use your machine's LAN IP, not localhost.
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig?.extra as any)?.apiUrl ||
  "http://localhost:3000";
