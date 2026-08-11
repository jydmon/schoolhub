// Pure logic for the reporting engine used by super admin (platform-wide usage,
// subscriptions, engagement, event tracking) and by parents (their own child's
// activity from connected systems). Turns raw rows into report sections with
// totals; the DB layer supplies the rows and the route renders CSV/PDF.
// Unit-tested in tests/phase17c.test.ts.

export const REPORT_TYPES = [
  "usage",         // logins + feature usage
  "subscription",  // plans, MRR, renewals, approvals
  "engagement",    // parent/teacher engagement
  "event_tracking",// trip/event updates
  "adoption",      // module adoption
  "parent_child",  // parent-facing: a child's activity from connected systems
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_LABELS: Record<string, string> = {
  usage: "System usage", subscription: "Subscriptions & billing", engagement: "Engagement",
  event_tracking: "Event & trip tracking", adoption: "Module adoption", parent_child: "My child's activity",
};

export function isValidReportType(t: string): t is ReportType {
  return (REPORT_TYPES as readonly string[]).includes(t);
}

export type Column = { key: string; label: string; kind?: "number" | "money" | "text" | "percent" };
export type Section = { title: string; columns: Column[]; rows: Record<string, any>[]; totals?: Record<string, any> };

/** Sum numeric columns across rows for a totals line. */
export function totalize(rows: Record<string, any>[], columns: Column[]): Record<string, any> {
  const totals: Record<string, any> = {};
  for (const c of columns) {
    if (c.kind === "number" || c.kind === "money") {
      totals[c.key] = rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0);
    }
  }
  return totals;
}

/** Assemble a report from typed inputs. Each branch is a pure transform. */
export function buildReport(type: ReportType, data: any): { type: ReportType; title: string; generatedFor?: string; sections: Section[] } {
  const sections: Section[] = [];
  if (type === "usage") {
    const cols: Column[] = [
      { key: "role", label: "Role", kind: "text" },
      { key: "users", label: "Users", kind: "number" },
      { key: "logins", label: "Logins", kind: "number" },
      { key: "volume", label: "Actions", kind: "number" },
    ];
    const rows = data?.roles ?? [];
    sections.push({ title: "Usage by role", columns: cols, rows, totals: totalize(rows, cols) });
  } else if (type === "subscription") {
    const cols: Column[] = [
      { key: "who", label: "Subscriber", kind: "text" },
      { key: "plan", label: "Plan", kind: "text" },
      { key: "amountMinor", label: "Amount", kind: "money" },
      { key: "status", label: "Status", kind: "text" },
      { key: "renews", label: "Renews", kind: "text" },
    ];
    const rows = data?.subs ?? [];
    sections.push({ title: "Subscriptions", columns: cols, rows, totals: totalize(rows, cols) });
  } else if (type === "event_tracking") {
    const cols: Column[] = [
      { key: "trip", label: "Trip / event", kind: "text" },
      { key: "updates", label: "Updates", kind: "number" },
      { key: "complete", label: "Completed", kind: "text" },
    ];
    const rows = data?.trips ?? [];
    sections.push({ title: "Event & trip updates", columns: cols, rows, totals: totalize(rows, cols) });
  } else if (type === "parent_child") {
    const cols: Column[] = [
      { key: "area", label: "Area", kind: "text" },
      { key: "source", label: "Source system", kind: "text" },
      { key: "items", label: "Items", kind: "number" },
    ];
    const rows = data?.areas ?? [];
    sections.push({ title: `Activity for ${data?.childName ?? "your child"}`, columns: cols, rows, totals: totalize(rows, cols) });
  } else {
    const cols: Column[] = [{ key: "metric", label: "Metric", kind: "text" }, { key: "value", label: "Value", kind: "number" }];
    sections.push({ title: REPORT_LABELS[type] ?? type, columns: cols, rows: data?.rows ?? [] });
  }
  return { type, title: REPORT_LABELS[type] ?? type, generatedFor: data?.generatedFor, sections };
}

/** Flatten a section to CSV (header + rows + totals). */
export function sectionToCsv(section: Section): string {
  const esc = (v: any) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const header = section.columns.map((c) => esc(c.label)).join(",");
  const body = section.rows.map((r) => section.columns.map((c) => esc(r[c.key])).join(",")).join("\n");
  const totals = section.totals ? "\n" + section.columns.map((c, i) => i === 0 ? "Total" : esc(section.totals![c.key] ?? "")).join(",") : "";
  return [header, body].filter(Boolean).join("\n") + totals;
}
