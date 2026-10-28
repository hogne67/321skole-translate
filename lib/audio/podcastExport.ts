import type { StudentAudioAsset } from "./studentAudio";
import { readStudentAudioBlob } from "./studentAudio";
import { getPodcastWorkshopSegments, type PodcastWorkshopConfig, type PodcastWorkshopSubmission } from "../podcastWorkshop";
import { getPodcastSound, getSoundTailSeconds } from "../podcastSoundLibrary";
import { auth } from "../firebase";

export type PodcastExportClip = { asset?: StudentAudioAsset; url?: string; label: string; tailSeconds?: number };

/** Snapshot the complete expected sequence before any network or audio work.
 * Empty configured/custom segments are errors, never a partial full export. */
export function podcastExportClips(config: PodcastWorkshopConfig, submission: PodcastWorkshopSubmission): PodcastExportClip[] {
  const segments = getPodcastWorkshopSegments(config, submission);
  if (segments.length === 0 || new Set(segments.map(segment => segment.id)).size !== segments.length) throw new Error("Invalid podcast segments");
  const voices = segments.map(segment => {
    const voice = submission.productionSegments[segment.id]?.voice;
    if (!voice || (!voice.storagePath && !voice.audioDataUrl)) throw new Error("Podcast segment missing");
    return { ...voice };
  });
  const clips: PodcastExportClip[] = [];
  function sound(id: typeof submission.productionMix.introSoundId, label: string, tail = true) {
    if (!id) return;
    const entry = getPodcastSound(id);
    if (!entry) throw new Error("Podcast sound missing");
    clips.push({ url: entry.src, label, tailSeconds: tail ? getSoundTailSeconds(id) : 0 });
  }
  sound(submission.productionMix.introSoundId, "intro", false);
  segments.forEach((segment, index) => {
    clips.push({ asset: voices[index], label: segment.title });
    if (index < segments.length - 1) sound(submission.productionMix.transitionSoundIds?.[segment.id]
      ?? submission.productionMix.transitionSoundId, "overgang");
  });
  sound(submission.productionMix.outroSoundId, "outro");
  return clips;
}

export function audioBufferToWav(buffer: AudioBuffer) {
  const channels = Math.min(2, buffer.numberOfChannels), rate = buffer.sampleRate;
  if (channels < 1 || !Number.isSafeInteger(buffer.length) || buffer.length <= 0) throw new Error("Empty podcast audio");
  const size = buffer.length * channels * 2, output = new ArrayBuffer(44 + size), view = new DataView(output);
  const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  text(0, "RIFF"); view.setUint32(4, 36 + size, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * channels * 2, true); view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, size, true);
  const data = Array.from({ length: channels }, (_, i) => buffer.getChannelData(i));
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) for (let channel = 0; channel < channels; channel++) {
    const value = Math.max(-1, Math.min(1, data[channel][i] ?? 0));
    view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true); offset += 2;
  }
  return new Blob([output], { type: "audio/wav" });
}

export async function renderPodcastWav(clips: PodcastExportClip[]) {
  if (clips.length === 0) throw new Error("Empty podcast");
  const actor = auth.currentUser;
  const checkSession = () => { if (auth.currentUser !== actor) throw new Error("Audio session changed"); };
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) throw new Error("Audio context unavailable");
  const context = new AudioContextClass();
  try {
    const decoded: AudioBuffer[] = [];
    // Sequential reads stop at the first error and avoid holding concurrent file downloads.
    for (const clip of clips) {
      checkSession();
      let blob: Blob;
      if (clip.asset) blob = await readStudentAudioBlob(clip.asset);
      else {
        if (!clip.url || !/^\/audio\/podcast-library\/[a-z-]+\.mp3$/.test(clip.url)) throw new Error("Invalid podcast sound URL");
        const response = await fetch(clip.url, { cache: "no-store", redirect: "error" });
        if (!response.ok) throw new Error("Podcast sound unavailable");
        blob = await response.blob();
      }
      const buffer = await context.decodeAudioData(await blob.arrayBuffer());
      checkSession();
      if (buffer.length <= 0 || !Number.isFinite(buffer.duration) || buffer.duration <= 0) throw new Error("Invalid podcast audio");
      decoded.push(buffer);
    }
    const rate = context.sampleRate, channels = Math.min(2, Math.max(1, ...decoded.map(buffer => buffer.numberOfChannels)));
    const frames = decoded.reduce((sum, buffer, i) => sum + Math.ceil((buffer.duration + Math.max(0, clips[i].tailSeconds ?? 0)) * rate), 0);
    const offline = new OfflineAudioContext(channels, frames, rate);
    let cursor = 0;
    decoded.forEach((buffer, i) => {
      const source = offline.createBufferSource(); source.buffer = buffer; source.connect(offline.destination); source.start(cursor / rate);
      cursor += Math.ceil((buffer.duration + Math.max(0, clips[i].tailSeconds ?? 0)) * rate);
    });
    const rendered = await offline.startRendering();
    checkSession();
    return audioBufferToWav(rendered);
  } finally { await context.close(); }
}

export function downloadAudioBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob), anchor = document.createElement("a");
  try {
    anchor.href = url; anchor.download = filename; anchor.rel = "noopener";
    document.body.appendChild(anchor); anchor.click();
  } finally { anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
