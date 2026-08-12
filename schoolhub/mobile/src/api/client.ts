import * as SecureStore from "expo-secure-store";
import { API_URL } from "@/config";

/**
 * SIPlat mobile API client. Authenticates with the same signed session JWT the
 * web app uses, sent as `Authorization: Bearer <token>` (React Native can't
 * persist the httpOnly cookie). The token is captured at login and kept in the
 * OS secure keystore.
 */
const TOKEN_KEY = "siplat.session.token";
let token: string | null = null;

export async function loadToken() {
  try { token = await SecureStore.getItemAsync(TOKEN_KEY); } catch { token = null; }
  return token;
}
export async function setToken(t: string | null) {
  token = t;
  try {
    if (t) await SecureStore.setItemAsync(TOKEN_KEY, t);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {}
}
export function hasToken() { return !!token; }

async function request<T = any>(method: string, path: string, body?: any): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw Object.assign(new Error(data?.error || `HTTP ${res.status}`), { status: res.status, data });
  return data as T;
}

export const api = {
  get: <T = any>(p: string) => request<T>("GET", p),
  post: <T = any>(p: string, b?: any) => request<T>("POST", p, b),
  patch: <T = any>(p: string, b?: any) => request<T>("PATCH", p, b),
  put: <T = any>(p: string, b?: any) => request<T>("PUT", p, b),
  del: <T = any>(p: string) => request<T>("DELETE", p),
};
