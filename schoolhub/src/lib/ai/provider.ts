import { prisma } from "../db";
import { recordAudit } from "../audit";
import { AUDIT } from "../constants";
import { encryptSecret, decryptSecret } from "../integration/crypto";

// ----------------------------------------------------------------------------
// LLM provider layer for the AI Assistant.
//
// The assistant ALWAYS works without a provider (deterministic grounded answers
// from retrieval). A provider only adds nicer phrasing and translation. This
// module resolves the active provider from the saved AiConfig (secret encrypted
// at rest) or, as a fallback, from environment variables — so an OPENAI_API_KEY
// set on the host keeps working with no config change.
//
// Secrets are NEVER returned to a client; only a "secretSet" flag and a masked
// provider/model are ever exposed. This is the single choke-point for the LLM
// key, mirroring the email + integration credential vaults.
// ----------------------------------------------------------------------------

export type ProviderMeta = {
  key: string; label: string; kind: "openai" | "gemini" | "anthropic"; baseUrl?: string;
  defaultModel: string; free?: boolean; hint: string;
};

// OpenAI-compatible providers share one code path (chat/completions); Gemini and
// Anthropic have their own request shapes.
export const PROVIDERS: ProviderMeta[] = [
  { key: "console", label: "Off (grounded answers only)", kind: "openai", defaultModel: "", hint: "No AI model. The assistant still answers from your school's records, just without AI phrasing or translation." },
  { key: "groq", label: "Groq (free tier)", kind: "openai", baseUrl: "https://api.groq.com/openai/v1", defaultModel: "llama-3.3-70b-versatile", free: true, hint: "Free, fast. Create a key at console.groq.com → API Keys, then paste it below." },
  { key: "gemini", label: "Google Gemini (free tier)", kind: "gemini", defaultModel: "gemini-1.5-flash", free: true, hint: "Free tier. Create a key at aistudio.google.com/apikey, then paste it below." },
  { key: "openrouter", label: "OpenRouter (has free models)", kind: "openai", baseUrl: "https://openrouter.ai/api/v1", defaultModel: "meta-llama/llama-3.1-8b-instruct:free", free: true, hint: "Create a key at openrouter.ai/keys. Free models end in ':free'." },
  { key: "openai", label: "OpenAI", kind: "openai", baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4o-mini", hint: "Secret = your OpenAI API key (platform.openai.com/api-keys)." },
  { key: "anthropic", label: "Anthropic (Claude)", kind: "anthropic", defaultModel: "claude-3-5-haiku-latest", hint: "Secret = your Anthropic API key (console.anthropic.com)." },
  { key: "together", label: "Together AI", kind: "openai", baseUrl: "https://api.together.xyz/v1", defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo", hint: "Secret = your Together API key." },
  { key: "mistral", label: "Mistral", kind: "openai", baseUrl: "https://api.mistral.ai/v1", defaultModel: "mistral-small-latest", hint: "Secret = your Mistral API key." },
  { key: "deepseek", label: "DeepSeek", kind: "openai", baseUrl: "https://api.deepseek.com/v1", defaultModel: "deepseek-chat", hint: "Secret = your DeepSeek API key." },
  { key: "custom", label: "Custom (OpenAI-compatible)", kind: "openai", defaultModel: "", hint: "Any OpenAI-compatible endpoint. Set the base URL and model explicitly." },
];
export const providerMeta = (key: string) => PROVIDERS.find((p) => p.key === key) || PROVIDERS[0];

type Runtime = { provider: string; kind: "openai" | "gemini" | "anthropic"; model: string; baseUrl: string; key: string };

let cache: { at: number; rt: Runtime | null } | null = null;
const TTL = 30_000;
export function invalidateAiCache() { cache = null; }

function fromEnv(): Runtime | null {
  const provider = (process.env.AI_PROVIDER || (process.env.OPENAI_API_KEY ? "openai" : "")).toLowerCase();
  if (!provider || provider === "console") return null;
  const meta = providerMeta(provider);
  const key = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "";
  if (!key) return null;
  return {
    provider, kind: meta.kind,
    model: process.env.AI_MODEL || process.env.OPENAI_MODEL || meta.defaultModel,
    baseUrl: process.env.AI_BASE_URL || meta.baseUrl || "",
    key,
  };
}

async function resolveRuntime(): Promise<Runtime | null> {
  if (cache && Date.now() - cache.at < TTL) return cache.rt;
  let rt: Runtime | null = null;
  try {
    const c = await prisma.aiConfig.findUnique({ where: { id: "singleton" } });
    if (c && c.provider !== "console" && c.secretEnc) {
      const meta = providerMeta(c.provider);
      rt = { provider: c.provider, kind: meta.kind, model: c.model || meta.defaultModel, baseUrl: c.baseUrl || meta.baseUrl || "", key: decryptSecret(c.secretEnc) };
    }
  } catch { rt = null; }
  if (!rt) rt = fromEnv();
  cache = { at: Date.now(), rt };
  return rt;
}

// ---- config surface (admin) ----

export async function getAiConfig() {
  const c = await prisma.aiConfig.findUnique({ where: { id: "singleton" } });
  const env = fromEnv();
  if (!c) return { provider: "console", model: "", baseUrl: "", verified: false, secretSet: false, envFallback: !!env, envProvider: env?.provider || null };
  const { secretEnc, ...rest } = c as any;
  return { ...rest, secretSet: !!secretEnc, envFallback: !secretEnc && !!env, envProvider: env?.provider || null };
}

export async function setAiConfig(input: { provider: string; model?: string; baseUrl?: string; secret?: string; actorUserId?: string | null }) {
  const meta = providerMeta(input.provider);
  const data: any = {
    provider: input.provider,
    model: input.model || meta.defaultModel || "",
    baseUrl: input.baseUrl || null,
    configuredById: input.actorUserId ?? null,
    verified: false,
  };
  if (input.secret) data.secretEnc = encryptSecret(input.secret);
  if (input.provider === "console") data.secretEnc = null;
  const c = await prisma.aiConfig.upsert({ where: { id: "singleton" }, update: data, create: { id: "singleton", ...data } });
  invalidateAiCache();
  await recordAudit({ action: AUDIT.AI_CONFIG_CHANGED, actorUserId: input.actorUserId, targetType: "AiConfig", targetId: c.id, metadata: { provider: input.provider, model: data.model } });
  return { ok: true };
}

export async function aiStatus() {
  const rt = await resolveRuntime();
  return { configured: !!rt, provider: rt?.provider || "console", model: rt?.model || "" };
}

// ---- completion ----

/** Run a single grounded completion. Returns null on any failure or if no
 *  provider is configured (caller falls back to the deterministic composer). */
export async function llmComplete(system: string, user: string, opts: { temperature?: number; maxTokens?: number } = {}): Promise<string | null> {
  const rt = await resolveRuntime();
  if (!rt) return null;
  const temperature = opts.temperature ?? 0.2;
  const maxTokens = opts.maxTokens ?? 700;
  try {
    if (rt.kind === "gemini") {
      const base = rt.baseUrl || "https://generativelanguage.googleapis.com/v1beta";
      const res = await fetch(`${base}/models/${encodeURIComponent(rt.model)}:generateContent?key=${encodeURIComponent(rt.key)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { temperature, maxOutputTokens: maxTokens },
        }),
      });
      if (!res.ok) return null;
      const d = await res.json();
      const text = d?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? null;
      return text || null;
    }
    if (rt.kind === "anthropic") {
      const base = rt.baseUrl || "https://api.anthropic.com/v1";
      const res = await fetch(`${base}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": rt.key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: rt.model, max_tokens: maxTokens, temperature, system, messages: [{ role: "user", content: user }] }),
      });
      if (!res.ok) return null;
      const d = await res.json();
      const text = Array.isArray(d?.content) ? d.content.map((b: any) => b.text || "").join("") : null;
      return text || null;
    }
    // OpenAI-compatible
    const base = rt.baseUrl || "https://api.openai.com/v1";
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${rt.key}` },
      body: JSON.stringify({
        model: rt.model, temperature, max_tokens: maxTokens,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
    });
    if (!res.ok) return null;
    const d = await res.json();
    return d?.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}
