import { useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";

/** Reactive connectivity state, used to gate live requests and trigger sync. */
export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => setOnline(!!s.isConnected && s.isInternetReachable !== false));
    return () => unsub();
  }, []);
  return online;
}
