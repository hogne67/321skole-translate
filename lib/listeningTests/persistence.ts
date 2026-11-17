import { LISTENING_AUDIO_TYPES, MAX_LISTENING_AUDIO_BYTES, parseListeningTest, type ListeningTest } from "./types";

export const LISTENING_SAVE_LIFETIME_MS = 15 * 60 * 1000;
export const LISTENING_READ_CHUNK_BYTES = 1024 * 1024;
export type ListeningAudioInput = { contentType: string; size: number; sha256: string };
export type SavedListeningAudio = ListeningAudioInput & { storagePath: string; generation: string; saveId: string;clipId?:string };

export function validListeningId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value)&&!["__proto__","constructor","prototype"].includes(value);
}
export function listeningEditHref(locale: string, id: string) {
  return `/${locale}/tools/listening-tests?edit=${encodeURIComponent(id)}`;
}
export function listeningMetadata(test: ListeningTest): Omit<ListeningTest,"audioDataUrl"> {
  return {version:test.version,title:test.title,level:test.level,language:test.language,script:test.script,tasks:test.tasks,plays:test.plays,playback:test.playback,...(test.clips?{clips:test.clips.map(clip=>({taskId:clip.taskId,script:clip.script,...(clip.aiVoice===undefined?{}:{aiVoice:clip.aiVoice})}))}:{}),...(test.aiVoice===undefined?{}:{aiVoice:test.aiVoice})};
}
export function parseListeningMetadata(raw: unknown): ListeningTest | null {
  if (!raw || typeof raw !== "object" || "audioDataUrl" in raw) return null;
  if("clips" in raw&&Array.isArray(raw.clips)&&raw.clips.some(clip=>clip&&typeof clip==="object"&&"audioDataUrl"in clip))return null;
  const test = parseListeningTest(raw);
  return test ? JSON.parse(JSON.stringify(test)) as ListeningTest : null;
}
export function parseListeningAudioInput(raw: unknown): ListeningAudioInput | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string,unknown>;
  if (typeof value.contentType !== "string" || !LISTENING_AUDIO_TYPES.includes(value.contentType)
    || typeof value.size !== "number" || !Number.isSafeInteger(value.size) || value.size <= 0 || value.size > MAX_LISTENING_AUDIO_BYTES
    || typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.sha256)) return null;
  return {contentType:value.contentType,size:value.size,sha256:value.sha256};
}
export function listeningAudioPath(uid: string, id: string, saveId: string,clipId?:string) {
  if (![uid,id,saveId].every(validListeningId)) throw new Error("Invalid listening file identity");
  if(clipId!==undefined&&!validListeningId(clipId))throw new Error("Invalid clip identity");
  return `private-listening-tests/${uid}/${id}/${saveId}${clipId?`-${clipId}`:""}`;
}
export function parseSavedListeningAudio(raw: unknown, uid: string, id: string,clipId?:string): SavedListeningAudio | null {
  const input=parseListeningAudioInput(raw);
  if (!input || !raw || typeof raw !== "object") return null;
  const value=raw as Record<string,unknown>;
  if (!validListeningId(value.saveId) || typeof value.generation!=="string" || !/^[1-9][0-9]*$/.test(value.generation)
    ||value.clipId!==clipId||value.storagePath!==listeningAudioPath(uid,id,value.saveId,clipId)) return null;
  return {...input,saveId:value.saveId,generation:value.generation,storagePath:value.storagePath as string,...(clipId?{clipId}:{})};
}
