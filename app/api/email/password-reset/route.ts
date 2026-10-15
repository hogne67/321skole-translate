import { handlePasswordReset } from "@/lib/email/server/passwordResetHandler";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(req: Request) { return handlePasswordReset(req); }
