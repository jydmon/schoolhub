import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getAuthContext } from "@/lib/session";
import { prisma } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/constants";
import { specialistPortalPath } from "@/lib/portal";
import TopBar from "@/components/TopBar";

export default async function SchoolIndex({ searchParams }: { searchParams?: { choose?: string } }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (ctx.isPlatformAdmin && ctx.memberships.length === 0) redirect("/admin");

  // A specialist (driver / teacher / transport manager / parent) doesn't belong
  // in the School portal — send them to their own portal instead of the school
  // "Member" view.
  const portal = specialistPortalPath(ctx.memberships.map((m) => m.role));
  if (portal) redirect(portal);

  const schoolIds = Array.from(new Set(ctx.memberships.map((m) => m.schoolId)));
  const schools = await prisma.school.findMany({ where: { id: { in: schoolIds } } });
  const openable = schools.filter((s) => s.status !== "suspended");

  // Auto-direct to the relevant school portal (unless the user explicitly asked
  // to choose). One school → straight in; several → the last one they opened.
  if (!searchParams?.choose) {
    const last = cookies().get("siplat_last_school")?.value;
    const remembered = last && openable.find((s) => s.id === last);
    if (remembered) redirect(`/school/${remembered.id}`);
    if (openable.length === 1) redirect(`/school/${openable[0].id}`);
  }

  const rolesBySchool = new Map<string, string[]>();
  for (const m of ctx.memberships) {
    rolesBySchool.set(m.schoolId, [...(rolesBySchool.get(m.schoolId) ?? []), m.role]);
  }

  return (
    <>
      <TopBar email={ctx.email} role="School user" />
      <div className="container">
        <h1>Your schools</h1>
        <p className="page-sub">Select a school to manage its configuration, users and audit trail.</p>
        {schools.map((s) => (
          <div className="panel flex-between" key={s.id}>
            <div>
              <h2 style={{ marginBottom: 6 }}>{s.name}</h2>
              <div className="chips">
                <span className={`badge ${s.status}`}>{s.status}</span>
                {(rolesBySchool.get(s.id) ?? []).map((r) => (
                  <span className="badge role" key={r}>{ROLE_LABELS[r] ?? r}</span>
                ))}
              </div>
            </div>
            {s.status === "suspended" ? (
              <span className="muted">Suspended — contact the platform administrator.</span>
            ) : (
              <Link href={`/school/${s.id}`}><button>Open</button></Link>
            )}
          </div>
        ))}
        {schools.length === 0 && (
          <div className="panel"><p className="muted">You are not a member of any school yet.</p></div>
        )}
      </div>
    </>
  );
}
