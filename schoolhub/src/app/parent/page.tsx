import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/session";
import ParentShell from "./ParentShell";

export default async function ParentPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  return <ParentShell email={ctx.email} />;
}
