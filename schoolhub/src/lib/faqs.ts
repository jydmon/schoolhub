import { prisma } from "@/lib/db";

// FAQ management. FAQs are platform-wide, owned by the Super Administrator, and
// shown to every user in Help & Support. Statuses: draft | published | archived.
export type FaqInput = { question: string; answer: string; category?: string; status?: string; sortOrder?: number };

export async function listPublished() {
  return prisma.faq.findMany({ where: { status: "published" }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
}
export async function listAll() {
  return prisma.faq.findMany({ orderBy: [{ status: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }] });
}

export async function createFaq(authorId: string, i: FaqInput) {
  const status = i.status === "draft" ? "draft" : i.status === "archived" ? "archived" : "published";
  return prisma.faq.create({
    data: {
      question: i.question.trim(), answer: i.answer.trim(), category: i.category?.trim() || null,
      status, sortOrder: i.sortOrder ?? 0, authorId, publishedAt: status === "published" ? new Date() : null,
    },
  });
}

export async function updateFaq(id: string, i: any) {
  const data: any = {};
  if (i.question != null) data.question = String(i.question).trim();
  if (i.answer != null) data.answer = String(i.answer).trim();
  if (i.category !== undefined) data.category = i.category ? String(i.category).trim() : null;
  if (i.sortOrder != null) data.sortOrder = Number(i.sortOrder) || 0;
  if (i.status != null) {
    data.status = ["draft", "published", "archived"].includes(i.status) ? i.status : "published";
    if (data.status === "published") {
      const cur = await prisma.faq.findUnique({ where: { id }, select: { publishedAt: true } });
      data.publishedAt = cur?.publishedAt ?? new Date();
    }
  }
  return prisma.faq.update({ where: { id }, data });
}

export async function removeFaq(id: string) { return prisma.faq.delete({ where: { id } }); }

function normalize(r: any): FaqInput | null {
  const q = (r.question ?? r.Question ?? r.q ?? "").toString().trim();
  const a = (r.answer ?? r.Answer ?? r.a ?? "").toString().trim();
  if (!q || !a) return null;
  const status = (r.status ?? r.Status ?? "").toString().trim().toLowerCase();
  return {
    question: q, answer: a,
    category: (r.category ?? r.Category ?? "").toString().trim() || undefined,
    status: ["draft", "published", "archived"].includes(status) ? status : "published",
    sortOrder: r.sortOrder != null ? Number(r.sortOrder) || 0 : undefined,
  };
}

/** Accepts { items: [...] } (JSON) or { csv: "..." } (header row question,answer,category[,status]). */
export function parseFaqRows(input: { items?: any[]; csv?: string }): FaqInput[] {
  if (Array.isArray(input.items)) return input.items.map(normalize).filter(Boolean) as FaqInput[];
  if (typeof input.csv === "string" && input.csv.trim()) return parseCsv(input.csv).map(normalize).filter(Boolean) as FaqInput[];
  return [];
}

export async function bulkImport(authorId: string, rows: FaqInput[]) {
  let created = 0;
  for (const r of rows) { await createFaq(authorId, r); created++; }
  return { created };
}

// Minimal RFC4180-style CSV parser (handles quoted fields, embedded commas,
// escaped double-quotes and CRLF/LF). Returns objects keyed by the header row.
function parseCsv(text: string): any[] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQuotes = false;
  const s = text.replace(/\r\n?/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).filter((r) => r.some((c) => c.trim())).map((r) => {
    const o: any = {};
    header.forEach((h, idx) => { o[h] = (r[idx] ?? "").trim(); });
    return o;
  });
}
