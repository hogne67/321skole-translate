import { handleSchoolInvite } from "@/lib/schools/server/inviteRoute";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(req: Request) { return handleSchoolInvite(req); }
