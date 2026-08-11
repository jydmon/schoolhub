import { createCipheriv, createDecipheriv, randomBytes, scryptSync, createHmac, timingSafeEqual } from "crypto";

// Encrypted credential vault for the Integration Hub.
//
// Every external-system secret (API key, bearer token, client secret, SFTP
// password, webhook secret) is encrypted at rest with AES-256-GCM before it
// touches the database, and is NEVER returned to a client after saving — only a
// masked hint (last 4 chars) is ever shown. This is the single choke-point for
// secret handling; API layers store `encryptSecret(...)` output and read it back
// only inside the sync engine via `decryptSecret(...)`.
//
// Key: 32 bytes from INTEGRATION_ENC_KEY (hex or base64). If unset (dev only), a
// key is derived from JWT_SECRET via scrypt so the app still runs — production
// MUST set a dedicated key. `keySource()` reports which path was used so a
// health check can flag the insecure dev fallback.

const VERSION = "v1";

function rawKeyMaterial(): { key: Buffer; source: "env" | "derived" } {
  const env = process.env.INTEGRATION_ENC_KEY;
  if (env && env.length > 0) {
    let buf: Buffer | null = null;
    if (/^[0-9a-fA-F]{64}$/.test(env)) buf = Buffer.from(env, "hex");
    else {
      try { const b = Buffer.from(env, "base64"); if (b.length === 32) buf = b; } catch { /* ignore */ }
    }
    if (buf && buf.length === 32) return { key: buf, source: "env" };
    // Any other non-empty value: stretch it to 32 bytes deterministically.
    return { key: scryptSync(env, "schoolhub-integration-enc", 32), source: "env" };
  }
  const fallback = process.env.JWT_SECRET || "dev-only-change-me";
  return { key: scryptSync(fallback, "schoolhub-integration-enc-dev", 32), source: "derived" };
}

export function keySource(): "env" | "derived" {
  return rawKeyMaterial().source;
}

/** Encrypt a secret. Returns "v1:<iv b64>:<tag b64>:<ciphertext b64>". */
export function encryptSecret(plaintext: string): string {
  const { key } = rawKeyMaterial();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

/** Decrypt a blob produced by encryptSecret. Throws on tamper / wrong key. */
export function decryptSecret(blob: string): string {
  const parts = blob.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error("Malformed ciphertext");
  const { key } = rawKeyMaterial();
  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const data = Buffer.from(parts[3], "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function isEncrypted(value: string | null | undefined): boolean {
  return !!value && value.startsWith(VERSION + ":") && value.split(":").length === 4;
}

/** A safe, display-only hint: reveals only the last `keep` characters. */
export function maskSecret(plaintext: string, keep = 4): string {
  if (!plaintext) return "";
  if (plaintext.length <= keep) return "•".repeat(plaintext.length);
  return "•".repeat(Math.max(4, plaintext.length - keep)) + plaintext.slice(-keep);
}

/** Recursively mask any object field whose key looks sensitive (for logs/audit). */
const SENSITIVE_KEY = /(secret|password|token|apikey|api_key|clientsecret|client_secret|privatekey|private_key|authorization|bearer|passphrase|credential)/i;
export function redact<T>(input: T): T {
  if (Array.isArray(input)) return input.map((v) => redact(v)) as unknown as T;
  if (input && typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (typeof v === "string" && SENSITIVE_KEY.test(k)) out[k] = v ? "••••redacted" : "";
      else out[k] = redact(v as unknown);
    }
    return out as unknown as T;
  }
  return input;
}

// ---- Webhook signature validation (HMAC-SHA256) ----------------------------
export function signPayload(secret: string, rawBody: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

/** Constant-time verification of an `sha256=<hex>` or bare-hex signature header. */
export function verifySignature(secret: string, rawBody: string, header: string | null | undefined): boolean {
  if (!header) return false;
  const provided = header.startsWith("sha256=") ? header.slice(7) : header;
  const expected = signPayload(secret, rawBody);
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}
