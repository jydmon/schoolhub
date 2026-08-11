import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/session";
import DriverShell from "./DriverShell";

export default async function DriverPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  return <DriverShell email={ctx.email} />;
}
