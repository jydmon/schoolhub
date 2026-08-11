import * as SecureStore from "expo-secure-store";
import { API_URL } from "@/config";

// Thin API client over the SchoolHub REST endpoints. The web app authenticates
// with an httpOnly session cookie; on mobile we capture that cookie at login and
// attach it to subsequent requests, persisted in the OS secure keystore.
//
// Production hardening: expose a token endpoint that returns a short-lived bearer
// + refresh token and use those here instead of the raw cookie.

const COOKIE_KEY = "schoolhub.session";
let sessionCookie: string | null = null;

export async function loadSession() {
  sessionCookie = await SecureStore.getItemAsync(COOKIE_KEY);
  return sessionCookie;
}
export async function setSession(cookie: string | null) {
  sessionCookie = cookie;
  if (cookie) await SecureStore.setItemAsync(COOKIE_KEY, cookie);
  else await SecureStore.deleteItemAsync(COOKIE_KEY);
}
export function hasSession() {
  return !!sessionCookie;
}

async function request<T = any>(method: string, path: string, body?: any): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (sessionCookie) headers["Cookie"] = sessionCookie;
  const res = await fetch(`${API_URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });

  // Capture/refresh the session cookie on auth responses.
  const setCookie = (res.headers as any).get?.("set-cookie");
  if (setCookie && /schoolhub_session=/.test(setCookie)) {
    const cookie = setCookie.split(";")[0];
    await setSession(cookie);
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw Object.assign(new Error(data?.error || `HTTP ${res.status}`), { status: res.status, data });
  return data as T;
}

export const api = {
  get: <T = any>(p: string) => request<T>("GET", p),
  post: <T = any>(p: string, b?: any) => request<T>("POST", p, b),
  put: <T = any>(p: string, b?: any) => request<T>("PUT", p, b),
  patch: <T = any>(p: string, b?: any) => request<T>("PATCH", p, b),
  del: <T = any>(p: string) => request<T>("DELETE", p),
};
