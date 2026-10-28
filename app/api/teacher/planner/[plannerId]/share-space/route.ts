// Planner paused for all roles. Original implementation: plannerHandlers.paused.ts.
// Keep dormant implementations out of this entrypoint's import graph.
import { plannerPausedResponse } from "@/lib/planner/pause.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = plannerPausedResponse;
export const POST = plannerPausedResponse;
export const PUT = plannerPausedResponse;
export const PATCH = plannerPausedResponse;
export const DELETE = plannerPausedResponse;
export const HEAD = plannerPausedResponse;
export const OPTIONS = plannerPausedResponse;
