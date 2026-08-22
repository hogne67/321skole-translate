import type { PodcastSoundId } from "@/lib/podcastWorkshop";

export type PodcastSoundGroup = "intro" | "transition" | "effect" | "outro";

export type PodcastSoundDefinition = {
    id: Exclude<PodcastSoundId, "">;
    group: PodcastSoundGroup;
    durationSeconds: number;
    src: string;
};

export const PODCAST_SOUND_LIBRARY: PodcastSoundDefinition[] = [
    { id: "intro_warm", group: "intro", durationSeconds: 4, src: "/audio/podcast-library/intro-warm.mp3" },
    { id: "intro_bright", group: "intro", durationSeconds: 4, src: "/audio/podcast-library/intro-bright.mp3" },
    { id: "intro_news", group: "intro", durationSeconds: 4, src: "/audio/podcast-library/intro-news.mp3" },
    { id: "transition_ding", group: "transition", durationSeconds: 1, src: "/audio/podcast-library/transition-ding.mp3" },
    { id: "transition_soft", group: "transition", durationSeconds: 2, src: "/audio/podcast-library/transition-soft.mp3" },
    { id: "transition_clap", group: "effect", durationSeconds: 1, src: "/audio/podcast-library/effect-clap.mp3" },
    { id: "effect_success", group: "effect", durationSeconds: 1, src: "/audio/podcast-library/effect-success.mp3" },
    { id: "effect_wow", group: "effect", durationSeconds: 1, src: "/audio/podcast-library/effect-wow.mp3" },
    { id: "outro_soft", group: "outro", durationSeconds: 4, src: "/audio/podcast-library/outro-soft.mp3" },
    { id: "outro_bright", group: "outro", durationSeconds: 4, src: "/audio/podcast-library/outro-bright.mp3" },
];

export const PODCAST_SOUND_GROUPS: Record<"intro" | "transition" | "outro", PodcastSoundId[]> = {
    intro: ["", "intro_warm", "intro_bright", "intro_news"],
    transition: ["", "transition_ding", "transition_soft", "transition_clap", "effect_success", "effect_wow"],
    outro: ["", "outro_soft", "outro_bright"],
};

const soundById = new Map<Exclude<PodcastSoundId, "">, PodcastSoundDefinition>(
    PODCAST_SOUND_LIBRARY.map((sound) => [sound.id, sound])
);

export function getPodcastSound(soundId: PodcastSoundId) {
    if (!soundId) return null;
    return soundById.get(soundId) ?? null;
}

export function getSoundDuration(soundId: PodcastSoundId) {
    return getPodcastSound(soundId)?.durationSeconds ?? 0;
}

function playToneFallback(soundId: PodcastSoundId) {
    if (!soundId) return Promise.resolve();
    if (typeof window === "undefined") return Promise.resolve();

    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return Promise.resolve();

    const context = new AudioContextClass();
    const master = context.createGain();
    master.gain.value = 0.16;
    master.connect(context.destination);

    const now = context.currentTime;
    const tonesBySound: Record<Exclude<PodcastSoundId, "">, Array<[number, number, number]>> = {
        intro_warm: [[261.63, 0, 0.24], [329.63, 0.22, 0.24], [392, 0.44, 0.34]],
        intro_bright: [[523.25, 0, 0.16], [659.25, 0.15, 0.16], [783.99, 0.3, 0.22]],
        intro_news: [[392, 0, 0.18], [523.25, 0.16, 0.18], [659.25, 0.32, 0.28]],
        transition_ding: [[880, 0, 0.18], [1174.66, 0.13, 0.28]],
        transition_soft: [[329.63, 0, 0.18], [392, 0.15, 0.24]],
        transition_clap: [[180, 0, 0.06], [220, 0.05, 0.06], [160, 0.1, 0.08]],
        effect_success: [[659.25, 0, 0.12], [783.99, 0.1, 0.16], [1046.5, 0.22, 0.2]],
        effect_wow: [[220, 0, 0.14], [440, 0.12, 0.22]],
        outro_soft: [[392, 0, 0.24], [329.63, 0.22, 0.24], [261.63, 0.44, 0.42]],
        outro_bright: [[783.99, 0, 0.18], [659.25, 0.16, 0.18], [523.25, 0.32, 0.32]],
    };

    const tones = tonesBySound[soundId];
    tones.forEach(([frequency, start, duration]) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = soundId === "transition_clap" ? "triangle" : "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, now + start);
        gain.gain.exponentialRampToValueAtTime(0.9, now + start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
        oscillator.connect(gain);
        gain.connect(master);
        oscillator.start(now + start);
        oscillator.stop(now + start + duration + 0.03);
    });

    const totalMs = Math.max(...tones.map(([, start, duration]) => start + duration)) * 1000 + 80;
    return new Promise<void>((resolve) => {
        window.setTimeout(() => {
            void context.close();
            resolve();
        }, totalMs);
    });
}

export function playPodcastSound(soundId: PodcastSoundId, options: { overlapSeconds?: number } = {}) {
    const sound = getPodcastSound(soundId);
    if (!sound) return Promise.resolve();

    return new Promise<void>((resolve) => {
        const audio = new Audio(sound.src);
        const maxSeconds = Math.max(0.1, sound.durationSeconds);
        const overlapSeconds = Math.max(0, Math.min(options.overlapSeconds ?? 0, maxSeconds - 0.05));
        const resolveAfterMs = Math.max(80, (maxSeconds - overlapSeconds) * 1000);
        const stopAfterMs = Math.max(resolveAfterMs, maxSeconds * 1000);
        let settled = false;
        let resolved = false;
        let stopTimer = 0;
        let resolveTimer = 0;
        const finish = () => {
            if (settled) return;
            settled = true;
            window.clearTimeout(stopTimer);
            window.clearTimeout(resolveTimer);
            resolve();
        };
        const resolveEarly = () => {
            if (resolved) return;
            resolved = true;
            resolve();
        };
        audio.onended = () => {
            resolveEarly();
            finish();
        };
        audio.onerror = () => {
            void playToneFallback(soundId).then(finish);
        };
        void audio.play().catch(() => {
            void playToneFallback(soundId).then(finish);
        });
        resolveTimer = window.setTimeout(resolveEarly, resolveAfterMs);
        stopTimer = window.setTimeout(() => {
            audio.pause();
            audio.currentTime = 0;
            finish();
        }, stopAfterMs);
    });
}
