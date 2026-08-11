// Import data validation. Records are validated against field rules before any
// write; each record is classified Passed / Warning / Failed. Failed records are
// held in an error queue while valid rows may still import (partial import),
// where safe. Pure and deterministic — unit-tested without a database.

export type Severity = "error" | "warning";
export type FieldType = "string" | "email" | "phone" | "date" | "number" | "boolean" | "coordinate";

export type FieldRule = {
  field: string;
  required?: boolean;
  type?: FieldType;
  requiredRelation?: boolean; // non-empty value expected to resolve to an existing record
  allowed?: string[];         // enumerated allowed values
};

export type ValidationIssue = { field: string; code: string; message: string; severity: Severity };
export type RecordOutcome = { index: number; status: "passed" | "warning" | "failed"; issues: ValidationIssue[]; externalId?: string };
export type BatchValidation = {
  total: number; passed: number; warnings: number; failed: number;
  outcomes: RecordOutcome[];
};

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RE_PHONE = /^\+?[\d][\d\s().-]{5,}$/;
const RE_DATE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/;
const RE_NUMBER = /^-?\d+(\.\d+)?$/;
const RE_BOOL = /^(true|false|yes|no|y|n|0|1)$/i;

function checkType(value: string, type: FieldType): string | null {
  const v = value.trim();
  if (v === "") return null; // emptiness handled by `required`
  switch (type) {
    case "email": return RE_EMAIL.test(v) ? null : "not a valid email";
    case "phone": return RE_PHONE.test(v) ? null : "not a valid telephone number";
    case "date": return RE_DATE.test(v) ? null : "not a valid date (expected ISO yyyy-mm-dd)";
    case "number": return RE_NUMBER.test(v) ? null : "not a number";
    case "boolean": return RE_BOOL.test(v) ? null : "not a boolean";
    case "coordinate": {
      const n = Number(v);
      return !isNaN(n) && n >= -180 && n <= 180 ? null : "not a valid coordinate";
    }
    default: return null;
  }
}

/** Validate a single record against a rule set. `idField` names the external id. */
export function validateRecord(
  record: Record<string, string>,
  rules: FieldRule[],
  index: number,
  idField?: string
): RecordOutcome {
  const issues: ValidationIssue[] = [];
  for (const rule of rules) {
    const raw = record[rule.field];
    const value = raw == null ? "" : String(raw);
    if (rule.required && value.trim() === "") {
      issues.push({ field: rule.field, code: "required", message: `${rule.field} is required`, severity: "error" });
      continue;
    }
    if (rule.type) {
      const err = checkType(value, rule.type);
      if (err) issues.push({ field: rule.field, code: "type", message: `${rule.field} ${err}`, severity: "error" });
    }
    if (rule.allowed && value.trim() !== "" && !rule.allowed.includes(value.trim())) {
      issues.push({ field: rule.field, code: "unsupported_value", message: `${rule.field} "${value}" is not an allowed value`, severity: "error" });
    }
    // A missing relationship is a warning (row can import, link resolved later).
    if (rule.requiredRelation && value.trim() === "") {
      issues.push({ field: rule.field, code: "missing_relation", message: `${rule.field} is empty — relationship cannot be linked`, severity: "warning" });
    }
  }
  const hasError = issues.some((i) => i.severity === "error");
  const hasWarn = issues.some((i) => i.severity === "warning");
  return {
    index,
    status: hasError ? "failed" : hasWarn ? "warning" : "passed",
    issues,
    externalId: idField ? (record[idField] || undefined) : undefined,
  };
}

/** Validate a batch; also flags duplicate external ids within the file. */
export function validateBatch(records: Record<string, string>[], rules: FieldRule[], idField?: string): BatchValidation {
  const outcomes = records.map((r, i) => validateRecord(r, rules, i, idField));

  if (idField) {
    const seen = new Map<string, number>();
    for (const o of outcomes) {
      const id = o.externalId?.trim();
      if (!id) continue;
      if (seen.has(id)) {
        o.issues.push({ field: idField, code: "duplicate_external_id", message: `duplicate external id "${id}" (first seen at row ${seen.get(id)! + 1})`, severity: "error" });
        if (o.status !== "failed") o.status = "failed";
      } else {
        seen.set(id, o.index);
      }
    }
  }

  return {
    total: outcomes.length,
    passed: outcomes.filter((o) => o.status === "passed").length,
    warnings: outcomes.filter((o) => o.status === "warning").length,
    failed: outcomes.filter((o) => o.status === "failed").length,
    outcomes,
  };
}
