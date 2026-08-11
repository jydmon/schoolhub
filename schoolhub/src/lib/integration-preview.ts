// Pure logic for the "reference preview": when an admin is about to connect a
// new system, show what a SIMILAR system already integrated (same category)
// surfaces — the objects/fields it exposes and a representative sample row —
// so they can see what they'll get before wiring credentials. No DB here; the
// DB layer (src/lib/crm.ts / integration route) supplies the live integrations
// and a sample record. Unit-tested in tests/crm.test.ts.

export type IntegrationLike = {
  id: string;
  name: string;
  connectorKey: string;
  category: string;
  status: string;
  provider?: string | null;
  supportedObjects?: string;   // JSON array
  supportedOperations?: string; // JSON array
  lastSuccessAt?: Date | string | null;
};

function parseArr(s?: string | null): string[] {
  if (!s) return [];
  try { const v = JSON.parse(s); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
}

// Representative fields each category surfaces — used to describe the preview
// even when no sample record is available yet.
export const CATEGORY_OBJECTS: Record<string, string[]> = {
  behaviour: ["rewards", "consequences", "detentions", "praise_points"],
  mis: ["students", "guardians", "attendance", "classes", "timetable"],
  calendar: ["events", "terms", "holidays"],
  attendance: ["sessions", "marks", "absences"],
  catering: ["menus", "meal_choices", "balances"],
  payments: ["invoices", "payments", "trip_charges"],
  gps: ["vehicle_position", "journeys", "eta"],
  identity: ["users", "roles", "groups"],
  docs: ["documents", "letters", "consents"],
};

/** Pick the already-connected integrations in the same category (the "similar,
 *  already integrated" systems) — most-recently-successful first. */
export function similarIntegrations(all: IntegrationLike[], category: string, excludeConnectorKey?: string): IntegrationLike[] {
  return all
    .filter((i) => i.category === category)
    .filter((i) => i.connectorKey !== excludeConnectorKey)
    .filter((i) => i.status === "connected")
    .sort((a, b) => {
      const ta = a.lastSuccessAt ? new Date(a.lastSuccessAt).getTime() : 0;
      const tb = b.lastSuccessAt ? new Date(b.lastSuccessAt).getTime() : 0;
      return tb - ta;
    });
}

/** Build the preview payload: the objects/fields a similar system shows, which
 *  system it was drawn from, and (if provided) a sample record. */
export function buildPreview(args: {
  category: string;
  all: IntegrationLike[];
  excludeConnectorKey?: string;
  sample?: Record<string, unknown> | null;
}): {
  category: string;
  objects: string[];
  referenceSystem: string | null;
  referenceConnectorKey: string | null;
  operations: string[];
  sample: Record<string, unknown> | null;
  note: string;
} {
  const similar = similarIntegrations(args.all, args.category, args.excludeConnectorKey);
  const ref = similar[0] || null;
  const objects = ref ? parseArr(ref.supportedObjects) : [];
  const finalObjects = objects.length ? objects : (CATEGORY_OBJECTS[args.category] || []);
  const operations = ref ? parseArr(ref.supportedOperations) : ["read", "import", "webhook"];
  const note = ref
    ? `Preview based on “${ref.name}”, a ${args.category} system you already have connected.`
    : `No ${args.category} system is connected yet — showing the fields this category typically surfaces.`;
  return {
    category: args.category,
    objects: finalObjects,
    referenceSystem: ref?.name ?? null,
    referenceConnectorKey: ref?.connectorKey ?? null,
    operations,
    sample: args.sample ?? null,
    note,
  };
}
