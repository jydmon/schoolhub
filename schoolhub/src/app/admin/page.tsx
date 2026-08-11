import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/session";
import TopBar from "@/components/TopBar";
import AdminPortal from "./AdminPortal";

export default async function AdminPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!ctx.isPlatformAdmin) redirect("/school");

  return (
    <>
      <TopBar email={ctx.email} role="Platform Super Administrator" />
      <div className="container">
        <h1>Platform administration</h1>
        <p className="page-sub">Manage school tenants, academy trusts, subscriptions and the audit trail.</p>
        <AdminPortal />
      </div>
    </>
  );
}
