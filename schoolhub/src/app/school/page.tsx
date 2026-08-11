import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/session";
import { prisma } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/constants";
import TopBar from "@/components/TopBar";

export default async function SchoolIndex() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (ctx.isPlatformAdmin && ctx.memberships.length === 0) redirect("/admin");

  const schoolIds = Array.from(new Set(ctx.memberships.map((m) => m.schoolId)));
  const schools = await prisma.school.findMany({ where: { id: { in: schoolIds } } });

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
