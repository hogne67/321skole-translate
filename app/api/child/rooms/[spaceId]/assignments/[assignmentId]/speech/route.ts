import type { NextRequest } from "next/server";
import { getReadingPracticeStage, readingPracticeSpokenText } from "@/lib/a1start/readingPracticeText";
import { showsReadingPracticeWordDivisions } from "@/lib/a1start/readingPractice";
import { normalizeAudioLanguage } from "@/lib/audio/language";
import { reserveSpeechUsage, speechFailure, synthesizeReadingPassage, synthesizeSpeech } from "@/lib/audio/speech.server";
import { firstLongText, taskOptions, taskPrompt } from "@/lib/familyAssignments";
import { FamilyAccessError, familyError, familyJson, familyRequestBody } from "@/lib/familyDevice.server";
import { readFamilyAssignment } from "@/lib/familyWork.server";

export const maxDuration = 45;

export async function POST(req: NextRequest, { params }: { params: Promise<{ spaceId: string; assignmentId: string }> }) {
    try {
        const { spaceId, assignmentId } = await params;
        const { mode, taskIndex, optionIndex } = await familyRequestBody(req, 1024);
        const { view, ownerUid } = await readFamilyAssignment(req, spaceId, assignmentId);
        const { assignment, submission } = view;
        const tasks = Array.isArray(assignment.tasks) ? assignment.tasks : [];
        const task = typeof taskIndex === "number" && Number.isInteger(taskIndex) ? tasks[taskIndex] : undefined;
        const stage = getReadingPracticeStage(assignment.textType ?? assignment.texttype, assignment.language);
        const language = normalizeAudioLanguage(assignment.language ?? "no");
        let text = "";
        if (mode === "text") {
            text = firstLongText(assignment);
            if (showsReadingPracticeWordDivisions(stage)) text = readingPracticeSpokenText(text);
        } else if (mode === "feedback") {
            text = submission?.aiFeedback ?? "";
        } else if (mode === "task" && task) {
            text = taskPrompt(task);
        } else if (mode === "option" && task && typeof optionIndex === "number" && Number.isInteger(optionIndex)) {
            text = taskOptions(task)[optionIndex] ?? "";
        }
        const clean = text.trim();
        if (!clean || clean.length > 4000) throw new FamilyAccessError(400, "speech_unavailable");

        const account = { uid: ownerUid, role: "parent", anonymous: false };
        await reserveSpeechUsage(account, "request");
        const signal = AbortSignal.any([req.signal, AbortSignal.timeout(38_000)]);
        const audio = mode === "text" && stage !== null && language === "no"
            ? await synthesizeReadingPassage(account, clean, language, signal)
            : { url: await synthesizeSpeech(account, clean, language, signal) };
        return familyJson(audio);
    } catch (error) {
        return error instanceof FamilyAccessError ? familyError(error) : speechFailure(error);
    }
}
