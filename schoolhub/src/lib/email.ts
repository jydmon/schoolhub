import { prisma } from "./db";
import { decryptSecret } from "./integration/crypto";

// Email transport. Reads the platform EmailConfig (super-admin → Email) and
// dispatches to the configured provider. Providers:
//   - console  : logs to the server console (default / dev)
//   - resend   : Resend HTTP API (secret = API key)
//   - postmark : Postmark HTTP API (secret = Server Token)
//   - smtp/ses : SMTP via nodemailer (host/port/username/secret). For Amazon SES,
//                use its SMTP endpoint + SMTP credentials with provider "ses".
// The secret is decrypted from the vault only in memory, never logged.

type Mail = { to: string; subject: string; body: string; text?: string };

type Cfg = {
  provider: string; fromName: string; fromEmail: string;
  host?: string | null; port?: number | null; username?: string | null; secret?: string | null;
};

let _cache: { at: number; cfg: Cfg } | null = null;

/** Drop the cached config (call after the config is changed). */
export function invalidateEmailCache(): void { _cache = null; }

async function loadConfig(): Promise<Cfg> {
  const now = Date.now();
  if (_cache && now - _cache.at < 30_000) return _cache.cfg;
  let cfg: Cfg;
  try {
    const c = await prisma.emailConfig.findUnique({ where: { id: "singleton" } });
    cfg = c
      ? { provider: c.provider, fromName: c.fromName, fromEmail: c.fromEmail, host: c.host, port: c.port, username: c.username, secret: c.secretEnc ? safeDecrypt(c.secretEnc) : null }
      : { provider: process.env.EMAIL_MODE ?? "console", fromName: "SIPlat", fromEmail: "hello@siplat.co" };
  } catch {
    cfg = { provider: process.env.EMAIL_MODE ?? "console", fromName: "SIPlat", fromEmail: "hello@siplat.co" };
  }
  _cache = { at: now, cfg };
  return cfg;
}

function safeDecrypt(v: string): string | null { try { return decryptSecret(v); } catch { return null; } }
function stripHtml(html: string): string {
  return (html || "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
}
function fromHeader(cfg: Cfg): string { return cfg.fromName ? `${cfg.fromName} <${cfg.fromEmail}>` : cfg.fromEmail; }

export async function sendEmail(mail: Mail): Promise<void> {
  const cfg = await loadConfig();
  const html = mail.body || "";
  const text = mail.text || stripHtml(html);
  switch (cfg.provider) {
    case "resend": return sendResend(cfg, mail, html, text);
    case "postmark": return sendPostmark(cfg, mail, html, text);
    case "smtp":
    case "ses": return sendSmtp(cfg, mail, html, text);
    case "console":
    default:
      // eslint-disable-next-line no-console
      console.log(`\n[email:console] TO: ${mail.to}\n  FROM: ${fromHeader(cfg)}\n  SUBJECT: ${mail.subject}\n  ${text}\n`);
      return;
  }
}

async function sendResend(cfg: Cfg, mail: Mail, html: string, text: string): Promise<void> {
  if (!cfg.secret) throw new Error("Resend API key is not configured");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: fromHeader(cfg), to: [mail.to], subject: mail.subject, html, text }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
}

async function sendPostmark(cfg: Cfg, mail: Mail, html: string, text: string): Promise<void> {
  if (!cfg.secret) throw new Error("Postmark server token is not configured");
  const res = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: { "X-Postmark-Server-Token": cfg.secret, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ From: fromHeader(cfg), To: mail.to, Subject: mail.subject, HtmlBody: html, TextBody: text, MessageStream: "outbound" }),
  });
  if (!res.ok) throw new Error(`Postmark error ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
}

async function sendSmtp(cfg: Cfg, mail: Mail, html: string, text: string): Promise<void> {
  if (!cfg.host) throw new Error("SMTP host is not configured");
  let nodemailer: any;
  try {
    const mod: any = await import("nodemailer");
    nodemailer = mod.default ?? mod;
  } catch {
    throw new Error("SMTP transport unavailable — the 'nodemailer' package is not installed");
  }
  const port = cfg.port ?? 587;
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port,
    secure: port === 465, // implicit TLS on 465; STARTTLS otherwise
    auth: cfg.username ? { user: cfg.username, pass: cfg.secret ?? "" } : undefined,
  });
  await transport.sendMail({ from: fromHeader(cfg), to: mail.to, subject: mail.subject, html, text });
}
