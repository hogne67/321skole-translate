import "server-only";
import { NextResponse } from "next/server";

// No authentication, request parsing, database access or external transport.
// The same response applies to every role and every Planner API entrypoint.
export function plannerPausedResponse() {
  return NextResponse.json(
    { error: "planner_paused" },
    { status: 410, headers: { "Cache-Control": "private, no-store" } },
  );
}
