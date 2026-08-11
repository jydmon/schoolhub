import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/session";
import { ROLES } from "@/lib/constants";

const MANAGE_ROLES: string[] = [
  ROLES.SCHOOL_ADMIN, ROLES.SCHOOL_LEADER, ROLES.TEACHER, ROLES.TRANSPORT_MANAGER, ROLES.SUPPORT_STAFF,
];

export default async function Home() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (ctx.isPlatformAdmin) redirect("/admin");
  const roles = ctx.memberships.map((m) => m.role);
  const canManage = roles.some((r) => MANAGE_ROLES.includes(r));
  const isParent = roles.includes(ROLES.PARENT);
  const isDriver = roles.includes(ROLES.DRIVER);
  if (canManage) redirect("/school");
  if (isParent) redirect("/parent");
  if (isDriver) redirect("/driver");
  redirect("/school");
}
