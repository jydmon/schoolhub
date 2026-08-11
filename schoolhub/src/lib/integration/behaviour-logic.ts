// Pure behaviour-event logic for Integration Hub ingestion. No DB imports, so it
// is unit-testable in isolation. Turns a raw external behaviour event (from a
// connected behaviour system such as ClassCharts) into a normalized reward
// record, classifies reward vs consequence, validates, and decides guardian
// visibility. The DB-facing ingestion lives in behaviour.ts.

import { POSITIVE_REWARD_TYPES } from "../constants";

export type BehaviourEvent = {
  externalId?: string;   // provider's unique event id (idempotency key)
  externalRef?: string;  // pupil reference / MIS id to match on
  type?: string;         // provider type e.g. "merit", "detention"
  kind?: string;         // alias for type
  points?: number | string;
  note?: string;
  teacherName?: string;
  at?: string;           // ISO timestamp
};

export type NormalizedRecord = {
  externalId: string;
  externalRef: string;
  type: string;
  points: number;    // magnitude, always >= 0 (sign carried by `positive`)
  positive: boolean; // true = reward, false = consequence
  note: string | null;
  teacherName: string | null;
  at: Date | null;
};

const KNOWN_TYPES = ["merit", "house_point", "badge", "praise", "certificate", "attendance_award", "incident", "detention", "sanction", "comment"];

/** Map an arbitrary provider type + points to a known SchoolHub type + reward/consequence flag. */
export function classify(type?: string, points?: number): { type: string; positive: boolean } {
  const t = (type || "").toLowerCase().trim().replace(/\s+/g, "_");
  let mapped: string;
  if (KNOWN_TYPES.includes(t)) mapped = t;
  else if (points != null && points < 0) mapped = "sanction";
  else if (points != null && points > 0) mapped = "merit";
  else mapped = "comment";
  const positive = POSITIVE_REWARD_TYPES.includes(mapped)
    ? true
    : mapped === "comment"
    ? points == null || points >= 0
    : false;
  return { type: mapped, positive };
}

export function validateEvent(ev: BehaviourEvent): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!ev.externalId || String(ev.externalId).trim() === "") issues.push("missing externalId (event id)");
  if (!ev.externalRef || String(ev.externalRef).trim() === "") issues.push("missing externalRef (pupil reference)");
  if (ev.points != null && ev.points !== "" && isNaN(Number(ev.points))) issues.push("points is not a number");
  if (ev.at && isNaN(new Date(ev.at).getTime())) issues.push("invalid date");
  return { ok: issues.length === 0, issues };
}

/** Normalize a valid event; returns null if it lacks the required identifiers. */
export function normalizeEvent(ev: BehaviourEvent): NormalizedRecord | null {
  const externalRef = String(ev.externalRef ?? "").trim();
  const externalId = String(ev.externalId ?? "").trim();
  if (!externalRef || !externalId) return null;
  const rawPts = ev.points == null || ev.points === "" ? undefined : Number(ev.points);
  const { type, positive } = classify(ev.type ?? ev.kind, rawPts);
  const points = rawPts == null || isNaN(rawPts) ? (positive ? 1 : 0) : Math.abs(Math.trunc(rawPts));
  const at = ev.at ? new Date(ev.at) : null;
  return {
    externalId, externalRef, type, points, positive,
    note: ev.note != null ? String(ev.note) : null,
    teacherName: ev.teacherName != null ? String(ev.teacherName) : null,
    at: at && !isNaN(at.getTime()) ? at : null,
  };
}

/** A guardian who has restricted "behaviour" must not receive/see behaviour data. */
export function guardianCanSeeBehaviour(infoRestrictions: string[]): boolean {
  return !infoRestrictions.map((s) => String(s).toLowerCase()).includes("behaviour");
}

/** Net points across records (rewards add, consequences subtract). */
export function netPoints(records: { points: number; positive: boolean }[]): number {
  return records.reduce((n, r) => n + (r.positive ? r.points : -r.points), 0);
}
