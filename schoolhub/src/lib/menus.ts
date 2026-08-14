import { prisma } from "./db";
import { recordAudit } from "./audit";
import { AUDIT } from "./constants";

// Canteen / catering menu items for schools with no upstream catering system.

export const MENU_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const MENU_MEALS = ["breakfast", "lunch", "snack", "tea"] as const;
export const MENU_COURSES = ["main", "vegetarian", "dessert", "side", "drink"] as const;
export const MENU_FREQUENCIES = ["one-off", "weekly", "monthly", "yearly"] as const;

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
  schoolId: string; day?: string; frequency?: string; weekOf?: string; yearGroup?: string; className?: string;
  meal?: string; course?: string; name: string; description?: string; allergens?: string;
  vegetarian?: boolean; vegan?: boolean; price?: number; active?: boolean; source?: string; actorUserId?: string | null;
}): Promise<{ id: string }> {
  const name = (input.name || "").trim();
  if (!name) throw new Error("name is required");
  const freq = (MENU_FREQUENCIES as readonly string[]).includes(input.frequency || "") ? input.frequency! : "weekly";
  const item = await prisma.menuItem.create({
    data: {
      schoolId: input.schoolId,
      day: input.day?.trim() || "Mon",
      frequency: freq,
      weekOf: input.weekOf?.trim() || null,
      yearGroup: input.yearGroup?.trim() || null,
      className: input.className?.trim() || null,
      meal: input.meal?.trim() || "lunch",
      course: input.course?.trim() || "main",
      name,
      description: input.description?.trim() || null,
      allergens: input.allergens?.trim() || null,
      vegetarian: input.vegetarian ?? false,
      vegan: input.vegan ?? false,
      price: Number.isFinite(input.price) ? Math.max(0, Math.round(input.price as number)) : 0,
      active: input.active ?? true,
      source: input.source || "manual",
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

/** Edit a menu item (manual/imported only — API-fed items are read-only). */
export async function updateMenuItem(schoolId: string, id: string, patch: any): Promise<void> {
  const item = await prisma.menuItem.findUnique({ where: { id } });
  if (!item || item.schoolId !== schoolId) throw new Error("Menu item not found");
  if (((item as any).source ?? "manual") === "api") throw new Error("This menu is fed from an integration and is read-only.");
  const data: any = {};
  if (typeof patch.frequency === "string" && (MENU_FREQUENCIES as readonly string[]).includes(patch.frequency)) data.frequency = patch.frequency;
  for (const k of ["day", "weekOf", "yearGroup", "className", "meal", "course", "name", "description", "allergens"] as const) {
    if (typeof patch[k] === "string") data[k] = patch[k].trim() || (k === "name" || k === "day" || k === "meal" || k === "course" ? item[k] : null);
  }
  for (const k of ["vegetarian", "vegan", "active"] as const) if (typeof patch[k] === "boolean") data[k] = patch[k];
  if (patch.price !== undefined) { const p = typeof patch.price === "number" ? patch.price : Math.round(parseFloat(String(patch.price).replace(/[£,\s]/g, "")) * 100); if (Number.isFinite(p) && p >= 0) data.price = p; }
  await prisma.menuItem.update({ where: { id }, data });
}

export async function deleteMenuItem(schoolId: string, id: string): Promise<void> {
  const item = await prisma.menuItem.findUnique({ where: { id } });
  if (!item || item.schoolId !== schoolId) throw new Error("Menu item not found");
  if (((item as any).source ?? "manual") === "api") throw new Error("This menu is fed from an integration and is read-only.");
  await prisma.menuItem.delete({ where: { id } });
}
