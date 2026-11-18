import { getAdmin } from "@/lib/firebaseAdmin";
import { normalizeAudioLanguage } from "@/lib/audio/language";
import { speechAccount,speechBody,speechFailure,SpeechError,reserveSpeechUsage,synthesizeSpeech,assertPersonalSpeechAccess } from "@/lib/audio/speech.server";
import { getSpaceAccess } from "@/lib/security/spaceAccess.server";
import { validGrammarId } from "@/lib/grammarTests/types";
export const runtime = "nodejs";
export const maxDuration = 45;
export async function POST(req: Request) {
  try {
    const account = await speechAccount(req), body = await speechBody(req);
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text || text.length > 4000 || !validGrammarId(body.lessonId)) throw new SpeechError(400,"Velg en oppgave og tekst på opptil 4000 tegn.");
    const { db } = getAdmin();
    if (body.spaceId !== undefined) {
      if (!validGrammarId(body.spaceId)) throw new SpeechError(400,"Ugyldig Space.");
      const access = await getSpaceAccess(db,body.spaceId,account.uid);
      if (!access.canRead) throw new SpeechError(403,"Du har ikke tilgang til denne oppgaven.");
      const assignment = (await db.doc(`spaces/${body.spaceId}/lessons/${body.lessonId}`).get()).data();
      if (!assignment || assignment.status === "archived") throw new SpeechError(404,"Oppgaven finnes ikke.");
      if (assignment.lessonType === "grammar_test") throw new SpeechError(403,"Bruk lydknappen i grammatikkoppgaven.");
    } else {
      await assertPersonalSpeechAccess(account);
    }
    const language = normalizeAudioLanguage(typeof body.lang === "string" ? body.lang : "no");
    await reserveSpeechUsage(account,"request");
    const url = await synthesizeSpeech(account,text,language,AbortSignal.any([req.signal,AbortSignal.timeout(38_000)]));
    return Response.json({url,lang:language,voice:"marin"},{headers:{"Cache-Control":"private,no-store"}});
  } catch (error) { return speechFailure(error); }
}
