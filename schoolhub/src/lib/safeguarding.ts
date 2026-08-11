import { ROLES } from "./constants";

// Safeguarding redaction. Medical, SEND and precise-location fields are only
// shown to authorised roles when the school has the corresponding restriction
// enabled. Non-authorised staff views are redacted at the API boundary.

export function isAuthorisedForSensitive(roles: string[]): boolean {
  return roles.some((r) => r === ROLES.SCHOOL_ADMIN || r === ROLES.SCHOOL_LEADER);
}

type Cfg = { restrictMedical?: boolean; restrictSend?: boolean; restrictLocation?: boolean } | null | undefined;

export function redactStudent<T extends Record<string, any>>(student: T, opts: { authorised: boolean; config: Cfg }): T {
  if (opts.authorised) return student;
  const s: any = { ...student };
  if (opts.config?.restrictMedical) s.medicalAlert = false;
  if (opts.config?.restrictSend) s.sendIndicator = false;
  if (opts.config?.restrictLocation) { s.homeAddress = undefined; s.homeLat = undefined; s.homeLng = undefined; }
  return s;
}
