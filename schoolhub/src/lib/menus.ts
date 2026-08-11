import { prisma } from "./db";
import { recordAudit } from "./audit";
import { AUDIT } from "./constants";

// Canteen / catering menu items for schools with no upstream catering system.

export const MENU_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const MENU_MEALS = ["breakfast", "lunch", "snack", "tea"] as const;
export const MENU_COURSES = ["main", "vegetarian", "dessert", "side", "drink"] as const;

const dayOrder: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
const mealOrder: Record<string, number> = { breakfast: 0, lunch: 1, snack: 2, tea: 3 };

export async function listMenuItems(schoolId: string) {
  const items = await prisma.menuItem.findMany({ where: { schoolId } });
  return items.sort((a, b) =>
    (dayOrder[a.day] ?? 9) - (dayOrder[b.day] ?? 9) ||
    (mealOrder[a.meal] ?? 9) - (mealOrder[b.meal] ?? 9) ||
    a.name.localeCompare(b.name),
  );
}

export async function createMenuItem(input: {
  schoolId: string; day?: string; meal?: string; course?: string; name: string;
  description?: string; allergens?: string; price?: number; active?: boolean; actorUserId?: string | null;
}): Promise<{ id: string }> {
  const name = (input.name || "").trim();
  if (!name) throw new Error("name is required");
  const item = await prisma.menuItem.create({
    data: {
      schoolId: input.schoolId,
      day: input.day?.trim() || "Mon",
      meal: input.meal?.trim() || "lunch",
      course: input.course?.trim() || "main",
      name,
      description: input.description?.trim() || null,
      allergens: input.allergens?.trim() || null,
      price: Number.isFinite(input.price) ? Math.max(0, Math.round(input.price as number)) : 0,
      active: input.active ?? true,
    },
  });
  await recordAudit({ action: AUDIT.DATA_IMPORT ?? "MENU_ITEM_CREATED", schoolId: input.schoolId, actorUserId: input.actorUserId, targetType: "MenuItem", targetId: item.id, metadata: { name, day: item.day, meal: item.meal } });
  return { id: item.id };
}

export async function setMenuItemActive(schoolId: string, id: string, active: boolean): Promise<void> {
  const item = await prisma.menuItem.findUnique({ where: { id } });
  if (!item || item.schoolId !== schoolId) throw new Error("Menu item not found");
  await prisma.menuItem.update({ where: { id }, data: { active } });
}
