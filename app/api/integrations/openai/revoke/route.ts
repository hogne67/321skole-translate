import { getOAuthRuntime } from "@/lib/integrations/openai/provider";
import { assertSameOrigin, IntegrationError } from "@/lib/integrations/openai/config";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const integration = getOAuthRuntime();
    assertSameOrigin(request.headers.get("origin") ?? undefined, integration.config);
    const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new IntegrationError("Sign-in is required.", 401);
    const identity = await integration.services.verifyFirebaseToken(token);
    await integration.services.checkRateLimit(identity.uid);
    await integration.services.revokeForUser(identity.uid);
    return Response.json({ revoked: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: "Could not revoke the integration." }, {
      status: error instanceof IntegrationError ? error.status : 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
