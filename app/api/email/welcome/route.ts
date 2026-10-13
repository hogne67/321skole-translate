import { handleVerificationEmail } from "@/lib/email/server/verificationHandler";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(req: Request) { return handleVerificationEmail(req); }
