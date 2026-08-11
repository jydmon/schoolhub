import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@/api/client";

// Offline write queue with retry. Teacher headcounts/welfare/incidents and driver
// boarding/drop-off are queued when offline and replayed in order once connectivity
// returns. The server endpoints are idempotent upserts (boarding, consent,
// headcount), so replaying a queued write resolves conflicts to last-write-wins.

export type QueuedOp = { id: string; method: "POST" | "PATCH" | "PUT"; path: string; body?: any; at: number; tries: number };

const KEY = "queue:ops";

async function read(): Promise<QueuedOp[]> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : [];
}
async function write(ops: QueuedOp[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(ops));
}

export async function enqueue(op: Omit<QueuedOp, "id" | "at" | "tries">) {
  const ops = await read();
  ops.push({ ...op, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, at: Date.now(), tries: 0 });
  await write(ops);
}

export async function pendingCount() {
  return (await read()).length;
}

/** Replay queued operations. Call on reconnect and on app foreground. */
export async function flushQueue(): Promise<{ sent: number; failed: number }> {
  let ops = await read();
  let sent = 0, failed = 0;
  const remaining: QueuedOp[] = [];
  for (const op of ops) {
    try {
      if (op.method === "POST") await api.post(op.path, op.body);
      else if (op.method === "PATCH") await api.patch(op.path, op.body);
      else await api.put(op.path, op.body);
      sent++;
    } catch (e: any) {
      // 4xx (except 429) are terminal — drop; network/5xx/429 → keep and retry.
      const status = e?.status;
      if (status && status >= 400 && status < 500 && status !== 429) { failed++; continue; }
      remaining.push({ ...op, tries: op.tries + 1 });
      failed++;
    }
  }
  await write(remaining);
  return { sent, failed };
}

/** Perform a write online, or queue it offline. */
export async function writeOrQueue(online: boolean, op: Omit<QueuedOp, "id" | "at" | "tries">) {
  if (online) {
    try {
      if (op.method === "POST") return await api.post(op.path, op.body);
      if (op.method === "PATCH") return await api.patch(op.path, op.body);
      return await api.put(op.path, op.body);
    } catch (e: any) {
      if (!e?.status) { await enqueue(op); return { queued: true }; } // network error → queue
      throw e;
    }
  }
  await enqueue(op);
  return { queued: true };
}
