import { readIntegrationConfig, IntegrationError } from "@/lib/integrations/openai/config";
import { protectedResourceMetadata } from "@/lib/integrations/openai/mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() {
  try { return Response.json(protectedResourceMetadata(readIntegrationConfig()), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) {
    return Response.json({ error: "Integration is unavailable." }, { status: error instanceof IntegrationError ? error.status : 503, headers: { "Cache-Control": "no-store" } });
  }
}
