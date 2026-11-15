import { generateAssessment } from "@/lib/readingTests/generate.server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  return generateAssessment(req, "listening");
}
