import { AsyncLocalStorage } from "async_hooks";

// Request-scoped context so cross-cutting concerns (currently: attributing audit
// entries to the impersonating admin during an item-13 support session) can be
// threaded without touching every call site. Populated by getAuthContext.
export type RequestCtx = { impersonatorId?: string };

export const requestContext = new AsyncLocalStorage<RequestCtx>();

/** Set the current request's impersonator, if any. Safe no-op on failure. */
export function markImpersonation(impersonatorId: string | undefined) {
  if (!impersonatorId) return;
  try { requestContext.enterWith({ impersonatorId }); } catch { /* ignore */ }
}

export function currentImpersonatorId(): string | undefined {
  try { return requestContext.getStore()?.impersonatorId; } catch { return undefined; }
}
