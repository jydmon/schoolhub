import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertCan } from "@/lib/rbac";
import { PERMISSIONS, AUDIT, POSITIVE_REWARD_TYPES, REWARD_TYPE_LABELS } from "@/lib/constants";
import { rewardSchema } from "@/lib/validation";
import { guardianUserIds, notify } from "@/lib/transport";
import { getPrefs } from "@/lib/notify";
import { recordAudit } from "@/lib/audit";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

// List reward/behaviour records (staff view).
export async function GET(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.VIEW_DASHBOARDS, params.id);
    const studentId = new URL(req.url).searchParams.get("studentId") || undefined;
    const rewards = await prisma.rewardRecord.findMany({
      where: { schoolId: params.id, ...(studentId ? { studentId } : {}) },
      include: { student: { select: { firstName: true, lastName: true, reference: true } } },
      orderBy: { at: "desc" }, take: 300,
    });
    return ok({ rewards });
  } catch (err) { return handleError(err); }
}

// Ingest a reward/behaviour record (from the behaviour system / manual).
// Notifies guardians according to each guardian's reward notification preferences.
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertCan(ctx, PERMISSIONS.VIEW_DASHBOARDS, params.id);
    const i = rewardSchema.parse(await req.json());
    const student = await prisma.student.findFirst({ where: { id: i.studentId, schoolId: params.id } });
    if (!student) return ok({ error: "Student not found" }, 404);

    const positive = POSITIVE_REWARD_TYPES.includes(i.type);
    const source = i.source && i.source !== "manual" ? i.source : "manual";
    const reward = await prisma.rewardRecord.create({
      data: { schoolId: params.id, studentId: i.studentId, type: i.type, points: i.points ?? (positive ? 1 : 0), category: i.category || null, note: i.note || null, teacherName: i.teacherName || null, source, positive, at: i.at ? new Date(i.at) : new Date() },
    });

    // Notify guardians per their reward preferences — unless the recorder opted
    // out of notifying for this entry (source rule: notify is on by default).
    let notified = 0;
    if (i.notifyGuardians !== false) {
      const guardians = await guardianUserIds(i.studentId);
      for (const g of guardians) {
        const prefs = await getPrefs(g);
        const rp = prefs.rewardPrefs || {};
        const wants = i.type === "detention" ? rp.detention : i.type === "incident" ? rp.incident : positive ? rp.immediatePositive : true;
        if (wants) {
          await notify([g], { kind: positive ? "reward_positive" : "reward_behaviour", title: `${student.firstName}: ${REWARD_TYPE_LABELS[i.type] || i.type}${i.points ? ` (+${i.points})` : ""}`, body: i.note || undefined, schoolId: params.id, studentId: i.studentId });
          notified++;
        }
      }
      if (notified) await prisma.rewardRecord.update({ where: { id: reward.id }, data: { notifiedCount: notified } });
    }
    await recordAudit({ action: AUDIT.REWARD_INGEST, schoolId: params.id, actorUserId: ctx.userId, actorEmail: ctx.email, targetType: "RewardRecord", targetId: reward.id, metadata: { type: i.type, source, notified } });
    return ok({ reward: { ...reward, notifiedCount: notified }, notified }, 201);
  } catch (err) { return handleError(err); }
}
