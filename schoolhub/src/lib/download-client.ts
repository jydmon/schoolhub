"use client";

// Client-side export governance. Browser-built CSVs (Blob downloads) call this to
// record the download in the audit trail and prepend the same standardised
// metadata block that server-streamed exports carry. Falls back to the raw CSV if
// the audit call fails, so a download is never blocked.
export async function stampCsv(opts: { section: string; reportName: string; csv: string; schoolId?: string | null }): Promise<string> {
  try {
    const r = await fetch("/api/downloads/record", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: opts.section, reportName: opts.reportName, format: "csv", schoolId: opts.schoolId ?? null }),
    });
    const d = await r.json();
    if (Array.isArray(d?.pairs)) {
      const q = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
      const head = d.pairs.map(([k, v]: [string, string]) => `${q(k)},${q(v)}`).join("\r\n");
      return `${head}\r\n\r\n${opts.csv}`;
    }
  } catch { /* non-fatal — download the raw CSV */ }
  return opts.csv;
}

/** Record a client-side download in the audit trail WITHOUT altering the file.
 *  Use for blank import templates, where prepending metadata would corrupt the
 *  file when the user fills it in and re-uploads it. */
export async function recordClientDownload(opts: { section: string; reportName: string; schoolId?: string | null }): Promise<void> {
  try {
    await fetch("/api/downloads/record", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: opts.section, reportName: opts.reportName, format: "csv", schoolId: opts.schoolId ?? null }),
    });
  } catch { /* non-fatal */ }
}
