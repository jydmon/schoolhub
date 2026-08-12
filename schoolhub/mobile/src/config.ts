import Constants from "expo-constants";

// The SIPlat cloud API base URL. Resolution order:
//   1. EXPO_PUBLIC_API_URL   — set per EAS build profile in eas.json
//   2. expo.extra.apiUrl     — the default baked into app.json
//   3. https://dev.siplat.com — final fallback
// For local development against a machine on your LAN, set EXPO_PUBLIC_API_URL
// to that machine's IP (e.g. http://192.168.1.20:3000) — never "localhost".
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig?.extra as any)?.apiUrl ||
  "https://dev.siplat.com";
