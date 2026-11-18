import "server-only";
import { getAdmin } from "@/lib/firebaseAdmin";
import { getSpaceAccess,ownsSpaceSubmission,submissionBelongsToPath } from "@/lib/security/spaceAccess.server";
import { grammarSpeechParts,type GrammarAudioPart } from "@/lib/grammarTests/audio";
import { parseGrammarTasks,parseGrammarTest,validGrammarId } from "@/lib/grammarTests/types";
import { speechAccount,speechBody,speechFailure,SpeechError,reserveSpeechUsage,synthesizeSpeech,assertPersonalSpeechAccess } from "@/lib/audio/speech.server";
export const runtime = "nodejs";
export const maxDuration = 80;
export async function POST(req: Request) {
  try {
    const account = await speechAccount(req), body = await speechBody(req), { db } = getAdmin();
    if (!validGrammarId(body.taskId) || (body.mode !== "gap" && body.mode !== "solution")) throw new SpeechError(400, "Ugyldig oppgave.");
    let tasks;
    if (body.spaceId !== undefined) {
      if (!validGrammarId(body.spaceId) || !validGrammarId(body.assignmentId)) throw new SpeechError(400, "Ugyldig prøve.");
      const access = await getSpaceAccess(db, body.spaceId, account.uid);
      if (!access.canRead) throw new SpeechError(403, "Du har ikke tilgang til denne prøven.");
      const assignment = (await db.doc(`spaces/${body.spaceId}/lessons/${body.assignmentId}`).get()).data();
      if (assignment?.lessonType !== "grammar_test" || assignment.status === "archived") throw new SpeechError(404, "Prøven finnes ikke.");
      if (assignment.grammarAudioEnabled !== true) throw new SpeechError(403, "Læreren har slått av lydstøtte i denne prøven.");
      tasks = parseGrammarTasks(assignment.tasks);
      if (body.mode === "solution" && !access.canTeach) {
        const id = `${body.spaceId}_${body.assignmentId}_${access.participantId}`;
        const submission = (await db.doc(`spaces/${body.spaceId}/lessons/${body.assignmentId}/submissions/${id}`).get()).data();
        if (!submission || !ownsSpaceSubmission(submission,account.uid,access.participantId) || !submissionBelongsToPath(submission,body.spaceId,body.assignmentId) || !["submitted","reviewed","approved"].includes(String(submission.status)))
          throw new SpeechError(403, "Hele setningen kan høres etter at svarene er levert og rettet.");
      }
    } else {
      await assertPersonalSpeechAccess(account);
      if (!validGrammarId(body.lessonId) || !validGrammarId(body.revision)) throw new SpeechError(400, "Lagre prøven før du prøver lydstøtten.");
      const lesson = (await db.doc(`lessons/${body.lessonId}`).get()).data();
      if (lesson?.ownerId !== account.uid || lesson.lessonType !== "grammar_test" || lesson.deletedAt) throw new SpeechError(404, "Prøven finnes ikke.");
      if (lesson.grammarRevision !== body.revision) throw new SpeechError(409, "Prøven er endret. Åpne eller lagre den på nytt.");
      const test = parseGrammarTest(lesson.grammarTest);
      if (!test?.audioEnabled) throw new SpeechError(403, "Lydstøtte er slått av.");
      tasks = test.tasks;
    }
    const task = tasks?.find(task => task.id === body.taskId);
    if (!task) throw new SpeechError(400, "Ugyldig oppgave.");
    await reserveSpeechUsage(account,"request");
    const signal = AbortSignal.any([req.signal,AbortSignal.timeout(70_000)]), parts: GrammarAudioPart[] = [];
    // Generate the two sides independently. The voice model never receives the gap or a missing word to guess.
    for (const part of grammarSpeechParts(task,body.mode)) parts.push(typeof part === "number" ? { kind:"pause",milliseconds:part } : { kind:"audio",url:await synthesizeSpeech(account,part,"Norwegian Bokmål",signal) });
    return Response.json({ parts }, { headers:{"Cache-Control":"private,no-store"} });
  } catch (error) { return speechFailure(error); }
}
