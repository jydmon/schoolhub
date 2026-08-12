import { requireAuth } from "@/lib/session";
import { getChildren } from "@/lib/parent";
import { listMenuItems } from "@/lib/menus";
import { handleError, ok } from "@/lib/http";

// Meal menus for all schools a parent's children attend. Each item is tagged
// with which of the parent's children it applies to (whole-school items apply
// to all children at that school; year/class items only to matching children).
export async function GET() {
  try {
    const ctx = await requireAuth();
    const children = await getChildren(ctx.userId);

    const childrenOut = children.map((c) => ({
      id: c.student.id, name: `${c.student.firstName} ${c.student.lastName}`.trim(),
      firstName: c.student.firstName, yearGroup: c.student.yearGroup,
      className: (c.student as any).class?.name || null, schoolId: c.school.id, schoolName: c.school.name,
    }));

    const schoolIds = Array.from(new Set(children.map((c) => c.school.id)));
    const bySchool: Record<string, any[]> = {};
    for (const sid of schoolIds) bySchool[sid] = (await listMenuItems(sid).catch(() => [])) as any[];

    const applies = (item: any, kid: any) => {
      if (item.className && item.className !== kid.className) return false;
      if (item.yearGroup && item.yearGroup !== kid.yearGroup) return false;
      return true;
    };

    const items: any[] = [];
    const schools = new Map<string, string>();
    for (const sid of schoolIds) {
      const kids = childrenOut.filter((c) => c.schoolId === sid);
      const sname = kids[0]?.schoolName || "";
      schools.set(sid, sname);
      for (const m of bySchool[sid]) {
        if (m.active === false) continue;
        const childIds = kids.filter((k) => applies(m, k)).map((k) => k.id);
        if (childIds.length === 0 && (m.className || m.yearGroup)) continue; // targeted but not to my child
        items.push({
          id: m.id, schoolId: sid, schoolName: sname,
          day: m.day, weekOf: m.weekOf, meal: m.meal, course: m.course,
          name: m.name, description: m.description, allergens: m.allergens,
          vegetarian: m.vegetarian, vegan: m.vegan,
          price: m.price, yearGroup: m.yearGroup, className: m.className,
          childIds, childNames: childrenOut.filter((c) => childIds.includes(c.id)).map((c) => c.firstName),
        });
      }
    }

    // Distinct week-commencing labels present, for the week filter.
    const weeks = Array.from(new Set(items.map((i) => i.weekOf).filter(Boolean))).sort();
    const allAllergens = Array.from(new Set(items.flatMap((i) => (i.allergens || "").split(",").map((s: string) => s.trim()).filter(Boolean)))).sort();

    return ok({
      children: childrenOut,
      schools: Array.from(schools.entries()).map(([id, name]) => ({ id, name })),
      items, weeks, allergens: allAllergens,
    });
  } catch (err) { return handleError(err); }
}
