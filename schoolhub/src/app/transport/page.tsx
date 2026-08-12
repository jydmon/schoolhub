import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/session";
import TransportShell from "./TransportShell";

export default async function TransportPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  return <TransportShell email={ctx.email} />;
}
