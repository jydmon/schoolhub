import { requireAuth } from "@/lib/session";
import { CONNECTOR_CATALOG, METHOD_LABELS, DOMAIN_LABELS } from "@/lib/connectors";
import { handleError, ok } from "@/lib/http";

// The static connector catalog (templates a school can connect).
export async function GET() {
  try {
    await requireAuth();
    return ok({ connectors: CONNECTOR_CATALOG, methodLabels: METHOD_LABELS, domainLabels: DOMAIN_LABELS });
  } catch (err) {
    return handleError(err);
  }
}
