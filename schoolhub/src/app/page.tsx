import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/session";
import { ROLES } from "@/lib/constants";

// Broad school-management roles land in the full School Admin portal.
const MANAGE_ROLES: string[] = [
  ROLES.SCHOOL_ADMIN, ROLES.SCHOOL_LEADER, ROLES.SUPPORT_STAFF,
];

export default async function Home() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (ctx.isPlatformAdmin) redirect("/admin");
  const roles = ctx.memberships.map((m) => m.role);
  const canManage = roles.some((r) => MANAGE_ROLES.includes(r));
  const isTeacher = roles.includes(ROLES.TEACHER);
  const isTransportManager = roles.includes(ROLES.TRANSPORT_MANAGER);
  const isParent = roles.includes(ROLES.PARENT);
  const isDriver = roles.includes(ROLES.DRIVER);

  // Broad admins → School portal. Otherwise each specialist role gets its own
  // dedicated, school-connected portal.
  if (canManage) redirect("/school");
  if (isTeacher) redirect("/teacher");
  if (isTransportManager) redirect("/transport");
  if (isDriver) redirect("/driver");
  if (isParent) redirect("/parent");
  redirect("/school");
}
