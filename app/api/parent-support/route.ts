import "server-only";

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { emailVerificationRequiredResponse, needsEmailVerification } from "@/lib/emailVerificationGuard";
import { getAdmin } from "@/lib/firebaseAdmin";
import { accountErrorStatus } from "@/lib/security/accountAccess.server";
import { getSpaceAccess, ownsSpaceSubmission, submissionBelongsToPath } from "@/lib/security/spaceAccess.server";
import { reserveServerFeature } from "@/lib/serverFeatureGuard";
import { isParentSpaceKind } from "@/lib/spaceSharing";

export const runtime = "nodejs";

const systemPrompt = [
  "You help parents encourage learning at home. Return a JSON object with parentMessage, childMessage and nextStep.",
  "Give the parent brief, concrete advice. Write a short, warm message to the child in simple language and suggest one small next step.",
  "Use only the supplied information. Do not invent the child's answers, mistakes, reading level, or performance. Never assign a grade.",
].join(" ");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const spaceId = text(body.spaceId);
  const assignmentId = text(body.assignmentId);
  if (!spaceId || !assignmentId || spaceId.includes("/") || assignmentId.includes("/")) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const { uid } = decoded;
    if (decoded.firebase?.sign_in_provider === "anonymous") {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (needsEmailVerification(decoded)) return emailVerificationRequiredResponse();
    const access = await getSpaceAccess(db, spaceId, uid);
    if (access.profile?.role !== "parent" || !access.owner || !isParentSpaceKind(access.space?.kind) || access.space?.deletedAt) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const assignmentRef = db.collection("spaces").doc(spaceId).collection("lessons").doc(assignmentId);
    const submissionId = [spaceId, assignmentId, access.participantId].join("_");
    const [assignmentSnapshot, submissionSnapshot] = await Promise.all([
      assignmentRef.get(),
      assignmentRef.collection("submissions").doc(submissionId).get(),
    ]);
    const assignment = assignmentSnapshot.data();
    if (!assignment || assignment.archived === true || assignment.status === "archived") {
      return NextResponse.json({ error: "assignment_not_found" }, { status: 404 });
    }
    const stored = submissionSnapshot.data();
    const submission = stored && submissionBelongsToPath(stored, spaceId, assignmentId) &&
      ownsSpaceSubmission(stored, uid, access.participantId) ? stored : null;
    const answers = isRecord(submission?.answers) ? Object.values(submission.answers) : [];
    const selfReport = isRecord(submission?.childSelfReport) ? submission.childSelfReport : {};
    const auto = isRecord(submission?.auto) ? submission.auto : {};

    const context = {
      language: body.locale === "en" ? "English" : body.locale === "pt" ? "Portuguese" : "Norwegian Bokmål",
      taskCount: Array.isArray(assignment.tasks) ? assignment.tasks.length : 0,
      answeredCount: answers.filter((answer) => typeof answer === "boolean" || !!text(answer)).length,
      submitted: submission?.status === "submitted" || submission?.status === "reviewed" || submission?.status === "approved",
      correct: count(auto.correctCount ?? auto.score),
      gradable: count(auto.totalAutoGraded ?? auto.maxScore),
      selfReport: ["readSilently", "readAloud", "completedTasks", "feltEasy", "feltHard"].filter((key) => selfReport[key] === true),
    };

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "parent_support_unavailable" }, { status: 503 });
    }
    const release = await reserveServerFeature({ ...access.profile, db, uid, feature: "ai_feedback" });
    if (!release) return NextResponse.json({ error: "limit_reached" }, { status: 429 });

    try {
      const completion = await new OpenAI().chat.completions.create({
        store: false,
        model: "gpt-4.1-mini",
        max_completion_tokens: 600,
        temperature: 0.5,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(context) },
        ],
      });
      const output: unknown = JSON.parse(completion.choices[0]?.message?.content ?? "null");
      if (!isRecord(output)) throw new Error("invalid_parent_support");
      const suggestion = {
        parentMessage: text(output.parentMessage),
        childMessage: text(output.childMessage),
        nextStep: text(output.nextStep),
      };
      if (!suggestion.parentMessage || !suggestion.childMessage || !suggestion.nextStep) {
        throw new Error("incomplete_parent_support");
      }
      return NextResponse.json(suggestion);
    } catch {
      await release().catch(() => console.error("parent_support_quota_release_failed"));
      return NextResponse.json({ error: "parent_support_unavailable" }, { status: 502 });
    }
  } catch (error) {
    return NextResponse.json({ error: "parent_support_unavailable" }, { status: accountErrorStatus(error) ?? 503 });
  }
}
