import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/session";
import AdminPortal from "./AdminPortal";

export default async function AdminPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!ctx.isPlatformAdmin) redirect("/school");

  return <AdminPortal email={ctx.email} />;
}
