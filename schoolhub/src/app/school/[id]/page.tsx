import { redirect, notFound } from "next/navigation";
import { getAuthContext } from "@/lib/session";
import { prisma } from "@/lib/db";
import { isMemberOf, rolesInSchool } from "@/lib/rbac";
import { ROLE_LABELS } from "@/lib/constants";
import TopBar from "@/components/TopBar";
import SchoolPortal from "./SchoolPortal";

export default async function SchoolAdminPage({ params }: { params: { id: string } }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!isMemberOf(ctx, params.id)) notFound();

  const school = await prisma.school.findUnique({
    where: { id: params.id },
    include: { config: true, subscription: { include: { plan: true } } },
  });
  if (!school) notFound();

  const roles = rolesInSchool(ctx, params.id);
  const roleLabel = roles.map((r) => ROLE_LABELS[r] ?? r).join(", ") || "Member";

  return (
    <>
      <TopBar email={ctx.email} role={roleLabel} />
      <div className="container">
        <h1>{school.name}</h1>
        <p className="page-sub">
          <span className={`badge ${school.status}`}>{school.status}</span>{" "}
          {school.subscription && <> · {school.subscription.plan.name} plan</>}
        </p>
        <SchoolPortal
          schoolId={params.id}
          roles={roles}
          initial={JSON.parse(
            JSON.stringify({
              school,
            })
          )}
        />
      </div>
    </>
  );
}
