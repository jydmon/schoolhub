import { prisma } from "./db";
import { recordAudit } from "./audit";
import { AUDIT, ROLE_LABELS } from "./constants";
import type { Sheet } from "./xls";
import { inflateSync, deflateSync } from "zlib";

// Download governance: every PDF / Excel / CSV export runs through here so it
// carries standardised metadata (who/when/where/what + a system audit reference)
// and is recorded in an audit trail. Also provides the shared branded PDF
// template so exports look consistent across the platform.

export type DownloadFormat = "pdf" | "xls" | "csv";
export type DownloadMeta = {
  reference: string;
  downloadedDate: string; // DD/MM/YYYY
  downloadedTime: string; // HH:MM:SS
  downloadedAt: string;   // combined
  userName: string;
  userRole: string;
  schoolName: string | null;
  trustName: string | null;
  logoUrl: string | null;
  section: string;
  reportName: string;
  format: DownloadFormat;
};

export type DownloadCtx = { userId?: string | null; email?: string | null; isPlatformAdmin?: boolean; memberships?: { schoolId: string; role: string }[] };

/** Resolve download metadata, persist a DownloadAudit row + audit-log entry, and
 *  return the metadata to stamp onto the file. Never throws on the audit write. */
export async function recordDownload(ctx: DownloadCtx, opts: { section: string; reportName: string; format: DownloadFormat; schoolId?: string | null }): Promise<DownloadMeta> {
  const now = new Date();
  let userName = ctx.email || "User";
  let userRole = ctx.isPlatformAdmin ? "Platform administrator" : "User";
  if (ctx.userId) {
    const u = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { fullName: true, email: true } }).catch(() => null);
    if (u) userName = u.fullName || u.email;
  }
  if (!ctx.isPlatformAdmin && ctx.memberships?.length) {
    const m = (opts.schoolId ? ctx.memberships.find((x) => x.schoolId === opts.schoolId) : null) || ctx.memberships[0];
    if (m) userRole = ROLE_LABELS[m.role] || m.role;
  }
  let schoolName: string | null = null, trustName: string | null = null, logoUrl: string | null = null;
  if (opts.schoolId) {
    const s = await prisma.school.findUnique({ where: { id: opts.schoolId }, select: { name: true, logoUrl: true, group: { select: { name: true } } } }).catch(() => null);
    if (s) { schoolName = s.name; logoUrl = s.logoUrl || null; trustName = s.group?.name || null; }
  }
  // If the logo is stored as a URL, fetch it so it can be embedded in PDFs.
  logoUrl = await resolveLogoSource(logoUrl);
  const year = now.getFullYear();
  let reference = `DL-${year}-0000`;
  try {
    const seq = (await prisma.downloadAudit.count({ where: { createdAt: { gte: new Date(year, 0, 1) } } })) + 1;
    reference = `DL-${year}-${String(seq).padStart(4, "0")}`;
    await prisma.downloadAudit.create({ data: { reference, schoolId: opts.schoolId ?? null, userId: ctx.userId ?? null, userEmail: ctx.email ?? null, userName, userRole, schoolName, trustName, section: opts.section, reportName: opts.reportName, format: opts.format } });
  } catch { /* non-fatal: still stamp the file with the reference */ }
  await recordAudit({ action: AUDIT.DOWNLOAD_RECORDED, actorUserId: ctx.userId, actorEmail: ctx.email, schoolId: opts.schoolId ?? undefined, targetType: "Download", targetId: reference, metadata: { section: opts.section, reportName: opts.reportName, format: opts.format } }).catch(() => {});
  return {
    reference,
    downloadedDate: now.toLocaleDateString("en-GB"),
    downloadedTime: now.toLocaleTimeString("en-GB"),
    downloadedAt: now.toLocaleString("en-GB"),
    userName, userRole, schoolName, trustName, logoUrl,
    section: opts.section, reportName: opts.reportName, format: opts.format,
  };
}

/** The standardised metadata key/value pairs stamped onto every export. */
export function metadataPairs(meta: DownloadMeta): [string, string][] {
  const p: [string, string][] = [
    ["Report", meta.reportName],
    ["Section / module", meta.section],
    ["Date downloaded", meta.downloadedDate],
    ["Time downloaded", meta.downloadedTime],
    ["Downloaded by", meta.userName],
    ["User role", meta.userRole],
  ];
  if (meta.schoolName) p.push(["School", meta.schoolName]);
  if (meta.trustName) p.push(["Trust", meta.trustName]);
  p.push(["Audit reference", meta.reference]);
  return p;
}
export function metadataLines(meta: DownloadMeta): string[] { return metadataPairs(meta).map(([k, v]) => `${k}: ${v}`); }

/** Prepend the metadata block to a CSV string (as quoted key,value rows). */
export function csvWithMetadata(meta: DownloadMeta, csv: string): string {
  const q = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
  const head = metadataPairs(meta).map(([k, v]) => `${q(k)},${q(v)}`).join("\r\n");
  return `${head}\r\n\r\n${csv}`;
}

/** A leading "Download info" sheet for Excel exports. */
export function xlsMetaSheet(meta: DownloadMeta): Sheet {
  return { name: "Download info", headers: ["Field", "Value"], rows: metadataPairs(meta) as unknown as (string | number)[][], title: meta.reportName };
}

// ---------------------------------------------------------------------------
// Branded PDF template (dependency-free). Letterhead (school/trust) + optional
// JPEG logo, report title, metadata block, body, and a footer with page
// numbering on every page. Consistent styling across all PDF exports.
// ---------------------------------------------------------------------------

const escT = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    if (raw.trim() === "") { out.push(""); continue; }
    let line = "";
    for (const word of raw.split(/\s+/)) {
      if ((line + " " + word).trim().length > width) { if (line) out.push(line); line = word.length > width ? word.slice(0, width) : word; }
      else line = line ? `${line} ${word}` : word;
    }
    if (line) out.push(line);
  }
  return out;
}

// Parse JPEG width/height from SOF markers (for embedding as a DCTDecode image).
function jpegSize(bytes: Uint8Array): { w: number; h: number } | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) { i++; continue; }
    const marker = bytes[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const h = (bytes[i + 5] << 8) | bytes[i + 6];
      const w = (bytes[i + 7] << 8) | bytes[i + 8];
      return { w, h };
    }
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (len <= 0) return null;
    i += 2 + len;
  }
  return null;
}

// Decode an 8-bit, non-interlaced PNG to raw RGB bytes (alpha composited over
// white), using the built-in zlib. Handles colour types 0/2/3/4/6. Returns null
// for anything it can't handle so the logo is simply skipped, never crashes.
function decodePngToRgb(raw: Buffer): { w: number; h: number; rgb: Buffer } | null {
  if (raw.length < 8 || raw[0] !== 0x89 || raw[1] !== 0x50) return null;
  let pos = 8, width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  let palette: Buffer | null = null, trns: Buffer | null = null;
  const idat: Buffer[] = [];
  while (pos + 8 <= raw.length) {
    const len = raw.readUInt32BE(pos);
    const type = raw.toString("latin1", pos + 4, pos + 8);
    const data = raw.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; interlace = data[12]; }
    else if (type === "PLTE") palette = Buffer.from(data);
    else if (type === "tRNS") trns = Buffer.from(data);
    else if (type === "IDAT") idat.push(Buffer.from(data));
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (!width || !height || bitDepth !== 8 || interlace !== 0) return null;
  const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : colorType === 0 ? 1 : colorType === 4 ? 2 : colorType === 3 ? 1 : 0;
  if (!channels) return null;
  let data: Buffer;
  try { data = inflateSync(Buffer.concat(idat)); } catch { return null; }
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const ft = data[p++];
    for (let x = 0; x < stride; x++) {
      const rb = data[p++] ?? 0;
      const a = x >= channels ? out[y * stride + x - channels] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = (x >= channels && y > 0) ? out[(y - 1) * stride + x - channels] : 0;
      let v = rb;
      if (ft === 1) v = rb + a;
      else if (ft === 2) v = rb + b;
      else if (ft === 3) v = rb + ((a + b) >> 1);
      else if (ft === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v = rb + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      out[y * stride + x] = v & 0xff;
    }
  }
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0, o = 0; i < width * height; i++) {
    let r = 0, g = 0, bl = 0, al = 255;
    if (colorType === 2) { r = out[i * 3]; g = out[i * 3 + 1]; bl = out[i * 3 + 2]; }
    else if (colorType === 6) { r = out[i * 4]; g = out[i * 4 + 1]; bl = out[i * 4 + 2]; al = out[i * 4 + 3]; }
    else if (colorType === 0) { r = g = bl = out[i]; }
    else if (colorType === 4) { r = g = bl = out[i * 2]; al = out[i * 2 + 1]; }
    else if (colorType === 3 && palette) { const idx = out[i]; r = palette[idx * 3]; g = palette[idx * 3 + 1]; bl = palette[idx * 3 + 2]; if (trns && idx < trns.length) al = trns[idx]; }
    if (al < 255) { const k = al / 255; r = Math.round(r * k + 255 * (1 - k)); g = Math.round(g * k + 255 * (1 - k)); bl = Math.round(bl * k + 255 * (1 - k)); }
    rgb[o++] = r; rgb[o++] = g; rgb[o++] = bl;
  }
  return { w: width, h: height, rgb };
}

// Resolve a school logo (data-URL, JPEG or PNG) into an embeddable PDF image.
// JPEG embeds directly (DCTDecode); PNG is decoded to RGB and re-compressed
// (FlateDecode). Returns null when the logo can't be embedded.
type PdfImage = { data: string; w: number; h: number; filter: "DCTDecode" | "FlateDecode" };
function resolveLogo(logoUrl: string | null): PdfImage | null {
  try {
    if (!logoUrl) return null;
    const m = /^data:image\/(png|jpe?g);base64,/i.exec(logoUrl);
    if (!m) return null;
    const raw = Buffer.from(logoUrl.slice(logoUrl.indexOf(",") + 1), "base64");
    if (/png/i.test(m[1])) {
      const d = decodePngToRgb(raw);
      if (!d) return null;
      const comp = deflateSync(d.rgb);
      return { data: comp.toString("latin1"), w: d.w, h: d.h, filter: "FlateDecode" };
    }
    const size = jpegSize(new Uint8Array(raw));
    if (size && size.w > 0 && size.h > 0) return { data: raw.toString("latin1"), w: size.w, h: size.h, filter: "DCTDecode" };
    return null;
  } catch { return null; }
}

/** Fetch a logo stored as an http(s) URL and return it as a data-URL so it can
 *  be embedded. Data-URLs pass through unchanged. Non-fatal on any failure. */
async function resolveLogoSource(logoUrl: string | null): Promise<string | null> {
  if (!logoUrl) return null;
  if (/^data:/i.test(logoUrl)) return logoUrl;
  if (!/^https?:\/\//i.test(logoUrl)) return logoUrl;
  try {
    const resp = await fetch(logoUrl);
    if (!resp.ok) return logoUrl;
    const ct = (resp.headers.get("content-type") || "").toLowerCase();
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length > 3_000_000) return logoUrl; // guard against huge files
    const mime = ct.includes("png") ? "image/png" : /jpe?g/.test(ct) ? "image/jpeg"
      : (buf[0] === 0x89 && buf[1] === 0x50) ? "image/png" : (buf[0] === 0xff && buf[1] === 0xd8) ? "image/jpeg" : null;
    if (!mime) return logoUrl;
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch { return logoUrl; }
}

/** Build a branded, paginated PDF from a title + body paragraphs. */
export function brandedPdf(meta: DownloadMeta, title: string, paragraphs: string[]): Buffer {
  const LEAD = 12, BODY_W = 88, BOTTOM = 64;
  const PN_TOP = 795; // body start y on later pages
  // Page-1 body starts below the letterhead + metadata block (which grows with
  // the number of metadata rows), so the two never overlap.
  const metaCount = metadataPairs(meta).length;
  const P1_TOP = 742 - metaCount * 11 - 20;

  // Optional logo (JPEG or PNG).
  const logo = resolveLogo(meta.logoUrl);

  // Body lines carry a heading flag so section titles render bold (rich text).
  // A paragraph prefixed with "## " becomes a bold heading; everything else is
  // wrapped normal body text.
  type BLine = { t: string; h: boolean };
  const body: BLine[] = [];
  for (const p of paragraphs) {
    if (typeof p === "string" && p.startsWith("## ")) body.push({ t: p.slice(3), h: true });
    else for (const w of wrap(p, BODY_W)) body.push({ t: w, h: false });
  }
  const p1Cap = Math.max(1, Math.floor((P1_TOP - BOTTOM) / LEAD));
  const pnCap = Math.max(1, Math.floor((PN_TOP - BOTTOM) / LEAD));
  const pages: BLine[][] = [];
  pages.push(body.slice(0, p1Cap));
  let idx = p1Cap;
  while (idx < body.length) { pages.push(body.slice(idx, idx + pnCap)); idx += pnCap; }
  const totalPages = pages.length;

  const footer = (n: number) => {
    const left = `SIPlat${meta.schoolName ? " · " + meta.schoolName : ""} · Ref ${meta.reference}`;
    const right = `Page ${n} of ${totalPages} · Generated ${meta.downloadedAt}`;
    return ["BT", "/F1 8 Tf", `1 0 0 1 40 44 Tm`, `(${escT(left).slice(0, 70)}) Tj`, "ET",
      "BT", "/F1 8 Tf", `1 0 0 1 300 44 Tm`, `(${escT(right).slice(0, 60)}) Tj`, "ET"].join("\n");
  };

  const contents: string[] = pages.map((lines, pi) => {
    const parts: string[] = [];
    if (pi === 0) {
      // Letterhead
      const school = meta.schoolName || "SIPlat";
      parts.push("BT", "/F2 16 Tf", "1 0 0 1 40 800 Tm", `(${escT(school).slice(0, 60)}) Tj`, "ET");
      if (meta.trustName) parts.push("BT", "/F1 9 Tf", "1 0 0 1 40 785 Tm", `(${escT(meta.trustName).slice(0, 70)}) Tj`, "ET");
      // Logo (JPEG) top-right, scaled into a 120×70 box.
      if (logo) {
        const scale = Math.min(130 / logo.w, 44 / logo.h, 1);
        const dw = Math.round(logo.w * scale), dh = Math.round(logo.h * scale);
        parts.push("q", `${dw} 0 0 ${dh} ${555 - dw} ${838 - dh} cm`, "/Im0 Do", "Q");
      }
      parts.push("0.6 0.6 0.6 RG", "0.5 w", "40 775 m", "555 775 l", "S");
      // Title
      parts.push("BT", "/F2 13 Tf", "1 0 0 1 40 760 Tm", `(${escT(title).slice(0, 80)}) Tj`, "ET");
      // Metadata block
      let my = 742;
      for (const [k, v] of metadataPairs(meta)) {
        parts.push("BT", "/F1 8 Tf", `1 0 0 1 40 ${my} Tm`, `(${escT(`${k}: ${v}`).slice(0, 110)}) Tj`, "ET");
        my -= 11;
      }
      parts.push("0.85 0.85 0.85 RG", "0.5 w", `40 ${my - 2} m`, `555 ${my - 2} l`, "S");
    }
    // Body text — headings in bold (F2), normal body in Courier (F1), with the
    // font switched per line inside the text object.
    const top = pi === 0 ? P1_TOP : PN_TOP;
    parts.push("BT", `${LEAD} TL`, `1 0 0 1 40 ${top} Tm`, "/F1 9 Tf");
    let cur = "/F1 9 Tf";
    for (const l of lines) {
      const f = l.h ? "/F2 10.5 Tf" : "/F1 9 Tf";
      if (f !== cur) { parts.push(f); cur = f; }
      parts.push(`(${escT(l.t).slice(0, 120)}) Tj`, "T*");
    }
    parts.push("ET");
    parts.push(footer(pi + 1));
    return parts.join("\n");
  });

  // Assemble objects. 1=Catalog 2=Pages; then content+page per page; then fonts; then optional image.
  const objs: string[] = [];
  let next = 3;
  const contentNums: number[] = [], pageNums: number[] = [];
  for (let i = 0; i < pages.length; i++) { contentNums.push(next++); pageNums.push(next++); }
  const f1 = next++, f2 = next++;
  const imgNum = logo ? next++ : 0;

  objs[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[1] = `<< /Type /Pages /Kids [${pageNums.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageNums.length} >>`;
  for (let i = 0; i < pages.length; i++) {
    objs[contentNums[i] - 1] = `<< /Length ${contents[i].length} >>\nstream\n${contents[i]}\nendstream`;
    const res = `<< /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >>${logo && i === 0 ? ` /XObject << /Im0 ${imgNum} 0 R >>` : ""} >>`;
    objs[pageNums[i] - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources ${res} /Contents ${contentNums[i]} 0 R >>`;
  }
  objs[f1 - 1] = "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>";
  objs[f2 - 1] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  if (logo) objs[imgNum - 1] = `<< /Type /XObject /Subtype /Image /Width ${logo.w} /Height ${logo.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /${logo.filter} /Length ${logo.data.length} >>\nstream\n${logo.data}\nendstream`;

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((off) => { pdf += `${String(off).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

// ---------------------------------------------------------------------------
// Structured branded PDF (dependency-free) — renders a document made of blocks:
// bold headings, paragraphs, bullet lists, and real bordered tables (bold header
// row, ruled grid, aligned columns, page-break with header repeat). Shares the
// same letterhead / metadata block / footer / logo as brandedPdf.
// ---------------------------------------------------------------------------
export type DocBlock =
  | { kind: "heading"; text: string }
  | { kind: "text"; text: string; underline?: boolean }
  | { kind: "bullets"; items: string[] }
  | { kind: "table"; headers: string[]; rows: (string | number)[][] };

export function brandedDocPdf(meta: DownloadMeta, title: string, blocks: DocBlock[]): Buffer {
  const LEFT = 40, RIGHT = 555, BOTTOM = 64, W = RIGHT - LEFT;
  const metaCount = metadataPairs(meta).length;
  const P1_TOP = 742 - metaCount * 11 - 20;
  const PN_TOP = 795;
  const CW8 = 8 * 0.6, CW9 = 9 * 0.6; // Courier char width by size

  // Optional logo (JPEG or PNG).
  const logo = resolveLogo(meta.logoUrl);

  const pageBufs: string[][] = [];
  let buf: string[] = [];
  let y = 0;

  function drawText(s: string, x: number, size: number, font: string) {
    buf.push("BT", `${font} ${size} Tf`, `1 0 0 1 ${x} ${y} Tm`, `(${escT(s)}) Tj`, "ET");
  }
  function pageBreak() { pageBufs.push(buf); buf = []; y = PN_TOP; }
  function ensure(space: number) { if (y - space < BOTTOM) pageBreak(); }

  // Page 1 letterhead + metadata block.
  {
    const school = meta.schoolName || "SIPlat";
    buf.push("BT", "/F2 16 Tf", "1 0 0 1 40 800 Tm", `(${escT(school).slice(0, 60)}) Tj`, "ET");
    if (meta.trustName) buf.push("BT", "/F1 9 Tf", "1 0 0 1 40 785 Tm", `(${escT(meta.trustName).slice(0, 70)}) Tj`, "ET");
    if (logo) {
      const scale = Math.min(130 / logo.w, 44 / logo.h, 1);
      const dw = Math.round(logo.w * scale), dh = Math.round(logo.h * scale);
      buf.push("q", `${dw} 0 0 ${dh} ${555 - dw} ${838 - dh} cm`, "/Im0 Do", "Q");
    }
    buf.push("0.6 0.6 0.6 RG", "0.5 w", "40 775 m", "555 775 l", "S");
    buf.push("BT", "/F2 13 Tf", "1 0 0 1 40 760 Tm", `(${escT(title).slice(0, 80)}) Tj`, "ET");
    let my = 742;
    for (const [k, v] of metadataPairs(meta)) { buf.push("BT", "/F1 8 Tf", `1 0 0 1 40 ${my} Tm`, `(${escT(`${k}: ${v}`).slice(0, 110)}) Tj`, "ET"); my -= 11; }
    buf.push("0.85 0.85 0.85 RG", "0.5 w", `40 ${my - 2} m`, `555 ${my - 2} l`, "S");
    y = P1_TOP;
  }

  function heading(text: string) { ensure(30); y -= 18; drawText(text, LEFT, 11, "/F2"); buf.push("0.8 0.8 0.8 RG", "0.5 w", `${LEFT} ${y - 3} m ${RIGHT} ${y - 3} l S`); y -= 14; }
  function para(text: string, underline?: boolean) {
    for (const ln of wrap(text, Math.floor(W / CW9))) {
      ensure(12); y -= 12; drawText(ln, LEFT, 9, "/F1");
      if (underline) buf.push("0.2 0.2 0.2 RG", "0.4 w", `${LEFT} ${y - 2} m ${LEFT + Math.min(W, ln.length * CW9)} ${y - 2} l S`);
    }
  }
  function bullets(items: string[]) {
    for (const it of items) {
      const lines = wrap(it, Math.floor((W - 18) / CW9));
      lines.forEach((ln, i) => { ensure(12); y -= 12; if (i === 0) drawText("•", LEFT + 3, 9, "/F1"); drawText(ln, LEFT + 18, 9, "/F1"); });
    }
  }
  function table(headers: string[], rows: (string | number)[][]) {
    const ncols = Math.max(1, headers.length);
    const colW = W / ncols;
    const maxChars = Math.max(3, Math.floor((colW - 8) / CW8));
    const rowH = 16;
    const trunc = (v: any) => { const s = String(v ?? ""); return s.length > maxChars ? s.slice(0, maxChars - 1) + "…" : s; };
    const drawRow = (cells: (string | number)[], isHeader: boolean) => {
      ensure(rowH);
      const top = y, bottom = y - rowH;
      buf.push("0.72 0.72 0.72 RG", "0.5 w", `${LEFT} ${bottom} ${W.toFixed(2)} ${rowH} re S`);
      for (let c = 1; c < ncols; c++) { const x = (LEFT + c * colW).toFixed(2); buf.push(`${x} ${top} m ${x} ${bottom} l S`); }
      const ty = top - 11;
      for (let c = 0; c < ncols; c++) { const x = (LEFT + c * colW + 4).toFixed(2); buf.push("BT", `${isHeader ? "/F2" : "/F1"} 8 Tf`, `1 0 0 1 ${x} ${ty} Tm`, `(${escT(trunc(cells[c]))}) Tj`, "ET"); }
      y = bottom;
    };
    ensure(rowH * 2); // keep header with at least one row
    drawRow(headers, true);
    for (const r of rows) { if (y - rowH < BOTTOM) { pageBreak(); drawRow(headers, true); } drawRow(r, false); }
    y -= 8;
  }

  for (const b of blocks) {
    if (b.kind === "heading") heading(b.text);
    else if (b.kind === "bullets") bullets(b.items);
    else if (b.kind === "table") table(b.headers, b.rows);
    else para(b.text, b.underline);
  }
  pageBufs.push(buf);

  const totalPages = pageBufs.length;
  const footer = (n: number) => {
    const left = `SIPlat${meta.schoolName ? " · " + meta.schoolName : ""} · Ref ${meta.reference}`;
    const right = `Page ${n} of ${totalPages} · Generated ${meta.downloadedAt}`;
    return ["BT", "/F1 8 Tf", "1 0 0 1 40 44 Tm", `(${escT(left).slice(0, 70)}) Tj`, "ET",
      "BT", "/F1 8 Tf", "1 0 0 1 300 44 Tm", `(${escT(right).slice(0, 60)}) Tj`, "ET"].join("\n");
  };
  const contents = pageBufs.map((p, i) => p.join("\n") + "\n" + footer(i + 1));

  const objs: string[] = [];
  let next = 3;
  const contentNums: number[] = [], pageNums: number[] = [];
  for (let i = 0; i < contents.length; i++) { contentNums.push(next++); pageNums.push(next++); }
  const f1 = next++, f2 = next++;
  const imgNum = logo ? next++ : 0;

  objs[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[1] = `<< /Type /Pages /Kids [${pageNums.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageNums.length} >>`;
  for (let i = 0; i < contents.length; i++) {
    objs[contentNums[i] - 1] = `<< /Length ${contents[i].length} >>\nstream\n${contents[i]}\nendstream`;
    const res = `<< /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >>${logo && i === 0 ? ` /XObject << /Im0 ${imgNum} 0 R >>` : ""} >>`;
    objs[pageNums[i] - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources ${res} /Contents ${contentNums[i]} 0 R >>`;
  }
  objs[f1 - 1] = "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>";
  objs[f2 - 1] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  if (logo) objs[imgNum - 1] = `<< /Type /XObject /Subtype /Image /Width ${logo.w} /Height ${logo.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /${logo.filter} /Length ${logo.data.length} >>\nstream\n${logo.data}\nendstream`;

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((off) => { pdf += `${String(off).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}
