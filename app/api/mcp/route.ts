import { handleMcp } from "@/lib/integrations/openai/mcp";
import { getOAuthRuntime } from "@/lib/integrations/openai/provider";
import { IntegrationError } from "@/lib/integrations/openai/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function handler(request: Request) {
  try { return await handleMcp(request, getOAuthRuntime()); }
  catch (error) {
    return Response.json({ error: "Integration is unavailable." }, {
      status: error instanceof IntegrationError ? error.status : 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
export const POST = handler;
export const GET = handler;
export const DELETE = handler;
