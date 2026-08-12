import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/session";
import { specialistPortalPath } from "@/lib/portal";

export default async function Home() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (ctx.isPlatformAdmin) redirect("/admin");
  const roles = ctx.memberships.map((m) => m.role);
  // Specialist roles → their dedicated portal; everyone else → School portal.
  const portal = specialistPortalPath(roles);
  redirect(portal ?? "/school");
}
