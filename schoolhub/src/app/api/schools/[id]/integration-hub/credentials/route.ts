import { requireAuth } from "@/lib/session";
import { assertTenantAccess } from "@/lib/tenant";
import { assertHubAccess, setCredential } from "@/lib/integration/hub";
import { hubCredentialSchema } from "@/lib/validation";
import { handleError, ok } from "@/lib/http";

type Params = { params: { id: string } };

// Store an encrypted credential bundle for a connector. The plaintext secret is
// encrypted (AES-256-GCM) before storage and is NEVER returned — only a masked
// hint. Setting a credential over an existing one is treated as a rotation.
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    assertTenantAccess(ctx, params.id);
    assertHubAccess(ctx, params.id);
    const i = hubCredentialSchema.parse(await req.json());
    const res = await setCredential({
      schoolId: params.id, integrationId: i.integrationId, authMethod: i.authMethod,
      secret: i.secret, expiresAt: i.expiresAt ?? null, actor: { userId: ctx.userId, email: ctx.email },
    });
    // Return only the masked hint — never the secret.
    return ok({ ok: true, maskedHint: res.maskedHint, rotated: res.rotated }, 201);
  } catch (err) { return handleError(err); }
}
