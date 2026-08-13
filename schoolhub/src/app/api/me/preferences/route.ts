import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { getPrefs } from "@/lib/notify";
import { prefsSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { AUDIT } from "@/lib/constants";
import { handleError, ok } from "@/lib/http";

// The signed-in user's own notification & contact preferences (role-agnostic):
// which channels they receive on, which categories they want, digest cadence and
// quiet hours. Synced identically to the mobile app.
export async function GET() {
  try {
    const ctx = await requireAuth();
    return ok({ prefs: await getPrefs(ctx.userId) });
  } catch (err) { return handleError(err); }
}

export async function PUT(req: Request) {
  try {
    const ctx = await requireAuth();
    const raw = await req.json();
    const i = prefsSchema.parse(raw); // validates the known fields (extras ignored)
    const cur = await getPrefs(ctx.userId);

    // Categories aren't in prefsSchema, so read them from the raw body. "security"
    // can never be switched off.
    const rawCats = raw && typeof raw.categories === "object" && raw.categories ? raw.categories : cur.categories;
    const categories = { ...cur.categories, ...rawCats, security: true };

    const data = {
      channelsJson: JSON.stringify(i.channels ?? cur.channels),
      categoriesJson: JSON.stringify(categories),
      digest: i.digest ?? cur.digest,
      quietStart: i.quietStart !== undefined ? i.quietStart : cur.quietStart,
      quietEnd: i.quietEnd !== undefined ? i.quietEnd : cur.quietEnd,
      preferredLanguage: i.preferredLanguage ?? cur.preferredLanguage,
      perChildJson: JSON.stringify(i.perChild ?? cur.perChild),
      rewardPrefsJson: JSON.stringify(i.rewardPrefs ?? cur.rewardPrefs),
    };
    await prisma.notificationPreference.upsert({ where: { userId: ctx.userId }, update: data, create: { userId: ctx.userId, ...data } });
    await recordAudit({ action: AUDIT.PREFS_CHANGED, actorUserId: ctx.userId, actorEmail: ctx.email });
    return ok({ ok: true, prefs: await getPrefs(ctx.userId) });
  } catch (err) { return handleError(err); }
}
