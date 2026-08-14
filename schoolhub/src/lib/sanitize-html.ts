// Minimal, dependency-free rich-text sanitiser for direct messages. The message
// composer produces simple formatted HTML (bold/italic/underline, lists, links,
// line breaks). We allow only a small tag/attribute allowlist and strip anything
// else — scripts, event handlers, styles, and dangerous URL schemes — so stored
// bodyHtml is always safe to render. Unit-tested in tests/messaging.test.ts.

const ALLOWED_TAGS = new Set(["b", "strong", "i", "em", "u", "a", "br", "p", "ul", "ol", "li", "span", "div"]);
// Tags we drop entirely *including their contents* (never just unwrap).
const DROP_WITH_CONTENT = new Set(["script", "style", "iframe", "object", "embed", "svg", "math", "template", "noscript"]);

function safeHref(raw: string): string | null {
  const v = raw.trim();
  // Allow only http(s), mailto and tel. Reject javascript:, data:, vbscript:, etc.
  if (/^(https?:\/\/|mailto:|tel:)/i.test(v)) return v.replace(/"/g, "%22");
  // Allow bare relative anchors and site-relative paths.
  if (/^(#|\/)[^\s]*$/.test(v)) return v.replace(/"/g, "%22");
  return null;
}

/** Sanitise composer HTML down to a safe allowlist. Returns "" for empty input. */
export function sanitizeRichText(input: string | null | undefined, maxLen = 20000): string {
  if (!input) return "";
  let html = String(input).slice(0, maxLen);

  // Remove drop-with-content tags and everything between them.
  for (const tag of DROP_WITH_CONTENT) {
    html = html.replace(new RegExp(`<${tag}[\\s\\S]*?<\\/${tag}>`, "gi"), "");
    html = html.replace(new RegExp(`<${tag}[^>]*\\/?>`, "gi"), "");
  }

  // Walk every tag; keep allowed ones (with a scrubbed attribute set), drop the
  // rest by removing just the tag delimiters (their text content is preserved).
  html = html.replace(/<(\/?)([a-zA-Z0-9]+)([^>]*)>/g, (_m, slash: string, nameRaw: string, attrs: string) => {
    const name = nameRaw.toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return "";
    if (slash === "/") return `</${name}>`;
    if (name === "a") {
      const hrefMatch = attrs.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const href = hrefMatch ? safeHref(hrefMatch[2] ?? hrefMatch[3] ?? hrefMatch[4] ?? "") : null;
      return href ? `<a href="${href}" target="_blank" rel="noopener noreferrer nofollow">` : "<span>";
    }
    // All other allowed tags: emit with NO attributes (drops style, class, on*, etc.).
    return `<${name}>`;
  });

  return html.trim();
}

/** Convert (possibly HTML) message content to a plain-text form for previews,
 *  notifications and search. Collapses tags and decodes a few common entities. */
export function htmlToText(input: string | null | undefined): string {
  if (!input) return "";
  let s = String(input);
  s = s.replace(/<\s*(br|\/p|\/div|\/li)\s*\/?>/gi, "\n"); // line-ish breaks
  s = s.replace(/<[^>]+>/g, ""); // strip remaining tags
  s = s.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
  return s.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n").trim();
}
