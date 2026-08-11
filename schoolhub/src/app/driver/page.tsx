import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/session";
import TopBar from "@/components/TopBar";
import DriverApp from "./DriverApp";

export default async function DriverPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  return (
    <>
      <TopBar email={ctx.email} role="Driver" />
      <div className="container" style={{ maxWidth: 640 }}>
        <h1>Driver</h1>
        <p className="page-sub">Your assigned journeys for today.</p>
        <DriverApp />
      </div>
    </>
  );
}
