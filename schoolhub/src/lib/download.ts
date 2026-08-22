import { prisma } from "./db";
import { recordAudit } from "./audit";
import { AUDIT, ROLE_LABELS } from "./constants";
import type { Sheet } from "./xls";

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

/** Build a branded, paginated PDF from a title + body paragraphs. */
export function brandedPdf(meta: DownloadMeta, title: string, paragraphs: string[]): Buffer {
  const LEAD = 12, BODY_W = 88, BOTTOM = 64;
  const PN_TOP = 795; // body start y on later pages
  // Page-1 body starts below the letterhead + metadata block (which grows with
  // the number of metadata rows), so the two never overlap.
  const metaCount = metadataPairs(meta).length;
  const P1_TOP = 742 - metaCount * 11 - 20;

  // Optional JPEG logo.
  let logo: { data: string; w: number; h: number } | null = null;
  try {
    if (meta.logoUrl && /^data:image\/jpe?g;base64,/i.test(meta.logoUrl)) {
      const b64 = meta.logoUrl.split(",")[1] || "";
      const raw = Buffer.from(b64, "base64");
      const size = jpegSize(new Uint8Array(raw));
      if (size && size.w > 0 && size.h > 0) logo = { data: raw.toString("latin1"), w: size.w, h: size.h };
    }
  } catch { logo = null; }

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
        const scale = Math.min(120 / logo.w, 70 / logo.h, 1);
        const dw = Math.round(logo.w * scale), dh = Math.round(logo.h * scale);
        parts.push("q", `${dw} 0 0 ${dh} ${555 - dw} ${812 - dh} cm`, "/Im0 Do", "Q");
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
  if (logo) objs[imgNum - 1] = `<< /Type /XObject /Subtype /Image /Width ${logo.w} /Height ${logo.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.data.length} >>\nstream\n${logo.data}\nendstream`;

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((off) => { pdf += `${String(off).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}
