import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/session";
import TeacherShell from "./TeacherShell";

export default async function TeacherPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  return <TeacherShell email={ctx.email} />;
}
