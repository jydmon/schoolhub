import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/session";
import { ROLES } from "@/lib/constants";

// Broad school-management roles land in the full School Admin portal.
const MANAGE_ROLES: string[] = [
  ROLES.SCHOOL_ADMIN, ROLES.SCHOOL_LEADER, ROLES.TEACHER, ROLES.SUPPORT_STAFF,
];

export default async function Home() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (ctx.isPlatformAdmin) redirect("/admin");
  const roles = ctx.memberships.map((m) => m.role);
  const canManage = roles.some((r) => MANAGE_ROLES.includes(r));
  const isTransportManager = roles.includes(ROLES.TRANSPORT_MANAGER);
  const isParent = roles.includes(ROLES.PARENT);
  const isDriver = roles.includes(ROLES.DRIVER);

  // A dedicated transport manager (not also a broader school admin) gets the
  // Transport portal. Drivers get the Driver portal. Both are school-connected.
  if (canManage) redirect("/school");
  if (isTransportManager) redirect("/transport");
  if (isDriver) redirect("/driver");
  if (isParent) redirect("/parent");
  redirect("/school");
}
