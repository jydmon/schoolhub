import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { api } from "@/api/client";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: true, shouldShowBanner: true, shouldShowList: true }),
});

// Request permission, obtain the FCM/APNs token via Expo, and register it with
// the backend (POST /api/mobile/devices) so push delivery can target this device.
export async function registerForPush(appRole: string): Promise<string | null> {
  if (!Device.isDevice) return null; // no push on simulators
  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return null;

  const token = (await Notifications.getDevicePushTokenAsync()).data; // native FCM/APNs token
  try {
    await api.post("/api/mobile/devices", { platform: Platform.OS, pushToken: token, appRole, appVersion: "0.1.0" });
  } catch { /* will retry next launch */ }
  return token;
}

export async function unregisterPush(token: string | null) {
  if (!token) return;
  try { await api.del(`/api/mobile/devices?pushToken=${encodeURIComponent(token)}`); } catch { /* ignore */ }
}
