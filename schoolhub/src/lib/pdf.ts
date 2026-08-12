// Minimal, dependency-free multi-page PDF from title + text paragraphs. Wraps
// long lines and paginates. Courier (monospace) keeps layout math simple.

function wrap(text: string, width = 92): string[] {
  const out: string[] = [];
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    if (raw.trim() === "") { out.push(""); continue; }
    let line = "";
    for (const word of raw.split(/\s+/)) {
      if ((line + " " + word).trim().length > width) { out.push(line); line = word; }
      else line = line ? `${line} ${word}` : word;
    }
    if (line) out.push(line);
  }
  return out;
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

export function textPdf(title: string, paragraphs: string[]): Buffer {
  const all = [title, "", ...paragraphs.flatMap((p) => wrap(p))];
  const LINES_PER_PAGE = 58;
  const pages: string[][] = [];
  for (let i = 0; i < all.length; i += LINES_PER_PAGE) pages.push(all.slice(i, i + LINES_PER_PAGE));
  if (pages.length === 0) pages.push([title]);

  // Object layout: 1 Catalog, 2 Pages, then per page: content + page objects,
  // then a shared font. Build objects and cross-reference offsets.
  const font = { n: 0 };
  const objs: string[] = [];
  const pageObjNums: number[] = [];
  const contentObjNums: number[] = [];

  // Reserve: 1=Catalog, 2=Pages, font at the end.
  // Content + Page objects start at 3.
  let next = 3;
  const contents: string[] = [];
  for (const pageLines of pages) {
    const body = ["BT", "/F1 10 Tf", "13 TL", "1 0 0 1 40 800 Tm", ...pageLines.flatMap((l) => [`(${esc(l).slice(0, 110)}) Tj`, "T*"]), "ET"].join("\n");
    const contentNum = next++;
    const pageNum = next++;
    contentObjNums.push(contentNum);
    pageObjNums.push(pageNum);
    contents.push(body);
  }
  font.n = next++;

  // Now assemble object strings in numeric order.
  objs[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[1] = `<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageObjNums.length} >>`;
  for (let i = 0; i < pages.length; i++) {
    const contentNum = contentObjNums[i], pageNum = pageObjNums[i];
    objs[contentNum - 1] = `<< /Length ${contents[i].length} >>\nstream\n${contents[i]}\nendstream`;
    objs[pageNum - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font.n} 0 R >> >> /Contents ${contentNum} 0 R >>`;
  }
  objs[font.n - 1] = "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>";

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((off) => { pdf += `${String(off).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}
