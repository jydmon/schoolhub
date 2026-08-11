// Field transformation library for data mapping. Each transform is a pure
// function (value, options) => value, so mappings are declarative and testable.
// A FieldMapping may carry a chain of these, applied in order during import.

export type TransformType =
  | "trim" | "upper" | "lower" | "title"
  | "date" | "time" | "boolean" | "number"
  | "concat" | "split" | "replace" | "lookup" | "default"
  | "phone" | "address";

export type TransformSpec = {
  type: TransformType;
  // per-type options (all optional; sensible defaults)
  format?: string;              // date/time output hint
  with?: string;               // concat separator / split delimiter / replace-to
  from?: string;               // replace-from
  index?: number;              // split: which piece to keep
  map?: Record<string, string>; // lookup table
  value?: string;              // default value / concat suffix
  trueValues?: string[];        // boolean truthy set
};

const TRUE_SET = ["1", "true", "yes", "y", "on"];

function toTitle(s: string): string {
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

/** Normalise a variety of date inputs to ISO yyyy-mm-dd (or full ISO if time present). */
function toIsoDate(v: string): string {
  const s = v.trim();
  if (!s) return "";
  // dd/mm/yyyy or dd-mm-yyyy (UK) → yyyy-mm-dd
  const uk = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (uk) {
    let [, d, m, y] = uk;
    if (y.length === 2) y = (Number(y) > 50 ? "19" : "20") + y;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // already ISO-ish
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return s.length > 10 ? s : `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return s; // leave untouched; validation will flag it
}

function toHHMM(v: string): string {
  const s = v.trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) return `${m[1].padStart(2, "0")}:${m[2]}`;
  // 9am / 3.30pm
  const ap = s.match(/^(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)$/i);
  if (ap) {
    let h = Number(ap[1]) % 12;
    if (/pm/i.test(ap[3])) h += 12;
    return `${String(h).padStart(2, "0")}:${ap[2] || "00"}`;
  }
  return s;
}

/** UK-friendly phone normaliser → E.164-ish (+44…) without inventing digits. */
function normalisePhone(v: string): string {
  let s = v.replace(/[^\d+]/g, "");
  if (!s) return "";
  if (s.startsWith("+")) return s;
  if (s.startsWith("0")) return "+44" + s.slice(1);
  if (s.startsWith("44")) return "+" + s;
  return s;
}

function squishAddress(v: string): string {
  return v.replace(/\s*,\s*/g, ", ").replace(/\s+/g, " ").trim();
}

/** Apply a single transform. Returns a string (mappings store strings). */
export function applyTransform(value: string, spec: TransformSpec): string {
  const v = value ?? "";
  switch (spec.type) {
    case "trim": return v.trim();
    case "upper": return v.toUpperCase();
    case "lower": return v.toLowerCase();
    case "title": return toTitle(v);
    case "date": return toIsoDate(v);
    case "time": return toHHMM(v);
    case "boolean": {
      const set = (spec.trueValues && spec.trueValues.length ? spec.trueValues : TRUE_SET).map((x) => x.toLowerCase());
      return set.includes(v.trim().toLowerCase()) ? "true" : "false";
    }
    case "number": {
      const n = Number(v.replace(/[^0-9.\-]/g, ""));
      return isNaN(n) ? "" : String(n);
    }
    case "concat": return [v, spec.value ?? ""].filter(Boolean).join(spec.with ?? " ");
    case "split": {
      const parts = v.split(spec.with ?? " ");
      const idx = spec.index ?? 0;
      return parts[idx] ?? "";
    }
    case "replace": return spec.from != null ? v.split(spec.from).join(spec.with ?? "") : v;
    case "lookup": return (spec.map && spec.map[v.trim()]) ?? v;
    case "default": return v.trim() === "" ? (spec.value ?? "") : v;
    case "phone": return normalisePhone(v);
    case "address": return squishAddress(v);
    default: return v;
  }
}

/** Apply an ordered chain of transforms. */
export function applyChain(value: string, chain: TransformSpec[] | undefined): string {
  if (!chain || chain.length === 0) return value;
  return chain.reduce((acc, spec) => applyTransform(acc, spec), value);
}

export const TRANSFORM_LABELS: Record<TransformType, string> = {
  trim: "Trim whitespace", upper: "UPPERCASE", lower: "lowercase", title: "Title Case",
  date: "Date → ISO", time: "Time → HH:MM", boolean: "Boolean", number: "Numeric",
  concat: "Concatenate", split: "Split", replace: "Find & replace", lookup: "Lookup table",
  default: "Default value", phone: "Telephone (E.164)", address: "Address tidy",
};
