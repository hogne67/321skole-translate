import { NextResponse } from "next/server";

function scoreContent(text: string) {
  const t = (text || "").toLowerCase();

  // ekstremt enkel MVP-liste (utvid senere)
  const sexual = ["porn", "sex", "nude", "naked"];
  const hate = ["kill all", "hate", "nazi"];
  const selfharm = ["suicide", "self-harm"];
  const pii = [/(\+?\d[\d\s\-]{6,}\d)/g, /@/g]; // tlf/email-ish

  let score = 0;
  const reasons: string[] = [];

  const hitList = (arr: string[], reason: string, add: number) => {
    if (arr.some((w) => t.includes(w))) {
      score += add;
      reasons.push(reason);
    }
  };

  hitList(sexual, "sexual_content", 60);
  hitList(hate, "hate_or_extremism", 60);
  hitList(selfharm, "self_harm", 80);

  if (pii.some((re) => re.test(text))) {
    score += 30;
    reasons.push("possible_personal_data");
  }

  // cap 0-100
  score = Math.max(0, Math.min(100, score));

  // beslutning
  let status: "pass" | "review" | "blocked" = "pass";
  if (score >= 80) status = "blocked";
  else if (score >= 40) status = "review";

  return { status, riskScore: score, reasons };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  const title = body?.title ?? "";
  const sourceText = body?.sourceText ?? "";
  const tasks = body?.tasks ?? null;

  const combined =
    `TITLE:\n${title}\n\nTEXT:\n${sourceText}\n\nTASKS:\n` +
    (tasks ? JSON.stringify(tasks) : "");

  const result = scoreContent(combined);

  return NextResponse.json({
    ...result,
    notes: result.reasons.length ? "Auto-check flagged content." : "Auto-check passed.",
  });
}
