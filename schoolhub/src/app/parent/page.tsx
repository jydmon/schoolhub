import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/session";
import TopBar from "@/components/TopBar";
import ParentDashboard from "./ParentDashboard";

export default async function ParentPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  return (
    <>
      <TopBar email={ctx.email} role="Parent / Guardian" />
      <div className="container">
        <h1>Family dashboard</h1>
        <p className="page-sub">Everything happening at school — today, this week and this month.</p>
        <ParentDashboard />
      </div>
    </>
  );
}
