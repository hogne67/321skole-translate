"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import type {
  PodcastWorkshopConfig,
  PodcastWorkshopFeedback,
  PodcastSoundId,
  PodcastWorkshopRoomKey,
  PodcastWorkshopSubmission,
} from "@/lib/podcastWorkshop";
import type { StudentAudioAsset } from "@/lib/audio/studentAudio";

type TFn = (key: string, values?: Record<string, unknown>) => string;
type RoomKey = PodcastWorkshopRoomKey;

type Props = {
  title: string;
  config: PodcastWorkshopConfig;
  value: PodcastWorkshopSubmission;
  disabled: boolean;
  submitted: boolean;
  feedback?: PodcastWorkshopFeedback | null;
  t: TFn;
  onChange: (next: PodcastWorkshopSubmission) => void;
};

const cardStyle: CSSProperties = {
  border: "1px solid rgba(15,23,42,0.10)",
  borderRadius: 14,
  background: "white",
  padding: 16,
};

const labelStyle: CSSProperties = {
  display: "block",
  marginBottom: 7,
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: 0,
  color: "#334155",
};

const textareaStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  resize: "vertical",
  minHeight: 96,
  borderRadius: 12,
  border: "1px solid rgba(15,23,42,0.16)",
  padding: "10px 12px",
  background: "white",
  color: "#0f172a",
  font: "inherit",
  lineHeight: 1.5,
};

function formatMinutes(seconds: number) {
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}

function hasText(value: string | undefined) {
  return String(value ?? "").trim().length > 0;
}

function roomStatus(room: RoomKey, config: PodcastWorkshopConfig, value: PodcastWorkshopSubmission) {
  if (room === "ideas") return hasText(value.ideas) ? "working" : "empty";
  if (room === "plan") {
    return config.segments.some((segment) => hasText(value.segmentPlans[segment.id])) ? "working" : "empty";
  }
  if (room === "script") {
    return config.segments.some((segment) => hasText(value.segmentScripts[segment.id])) ? "working" : "empty";
  }
  if (room === "production") return "later";
  return hasText(value.notes) || Object.values(value.selfAssessment).some(Boolean) ? "working" : "empty";
}

function statusLabel(t: TFn, status: string) {
  if (status === "working") return t("podcastWorkshop.statusWorking");
  if (status === "later") return t("podcastWorkshop.statusLater");
  return t("podcastWorkshop.statusEmpty");
}

function formatDuration(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function getVoiceSegments(config: PodcastWorkshopConfig, value: PodcastWorkshopSubmission) {
  return config.segments.filter((segment) => {
    const voice = value.productionSegments[segment.id]?.voice;
    return !!voice?.audioDataUrl;
  });
}

function getVoiceDuration(config: PodcastWorkshopConfig, value: PodcastWorkshopSubmission) {
  return getVoiceSegments(config, value).reduce((sum, segment) => {
    return sum + (value.productionSegments[segment.id]?.voice?.durationSeconds ?? 0);
  }, 0);
}

function getSupportedMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read audio."));
    reader.readAsDataURL(blob);
  });
}

const PODCAST_SOUND_GROUPS: Record<"intro" | "transition" | "outro", PodcastSoundId[]> = {
  intro: ["", "intro_warm", "intro_bright"],
  transition: ["", "transition_ding", "transition_clap"],
  outro: ["", "outro_soft"],
};

function playToneSequence(soundId: PodcastSoundId) {
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
    transition_ding: [[880, 0, 0.18], [1174.66, 0.13, 0.28]],
    transition_clap: [[180, 0, 0.06], [220, 0.05, 0.06], [160, 0.1, 0.08]],
    outro_soft: [[392, 0, 0.24], [329.63, 0.22, 0.24], [261.63, 0.44, 0.42]],
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

export default function PodcastWorkshopStudentSection({
  title,
  config,
  value,
  disabled,
  submitted,
  feedback,
  t,
  onChange,
}: Props) {
  const [activeRoom, setActiveRoom] = useState<RoomKey>("ideas");
  const readOnly = disabled || submitted;

  const rooms = useMemo(
    () => [
      { key: "ideas" as const, label: t("podcastWorkshop.roomIdeas") },
      { key: "plan" as const, label: t("podcastWorkshop.roomPlan") },
      {
        key: "script" as const,
        label: config.scriptMode === "script"
          ? t("podcastWorkshop.roomScript")
          : t("podcastWorkshop.roomBullets"),
      },
      { key: "production" as const, label: t("podcastWorkshop.roomProduction") },
      { key: "final" as const, label: t("podcastWorkshop.roomFinal") },
    ],
    [config.scriptMode, t]
  );

  function patch(next: Partial<PodcastWorkshopSubmission>) {
    onChange({ ...value, ...next });
  }

  function patchPlan(segmentId: string, text: string) {
    patch({ segmentPlans: { ...value.segmentPlans, [segmentId]: text } });
  }

  function patchScript(segmentId: string, text: string) {
    patch({ segmentScripts: { ...value.segmentScripts, [segmentId]: text } });
  }

  function patchProductionVoice(segmentId: string, voice: StudentAudioAsset | null) {
    const current = value.productionSegments[segmentId] ?? {
      voice: null,
      volume: 1,
      fadeInSeconds: 0,
      fadeOutSeconds: 0,
    };
    patch({
      productionSegments: {
        ...value.productionSegments,
        [segmentId]: {
          ...current,
          voice,
        },
      },
    });
  }

  function patchProductionMix(key: "introSoundId" | "transitionSoundId" | "outroSoundId", soundId: PodcastSoundId) {
    patch({
      productionMix: {
        ...value.productionMix,
        [key]: soundId,
      },
    });
  }

  function toggleCriterion(key: string) {
    patch({ selfAssessment: { ...value.selfAssessment, [key]: !value.selfAssessment[key] } });
  }

  function renderRoom() {
    if (activeRoom === "ideas") {
      return (
        <RoomCard title={t("podcastWorkshop.ideasTitle")} help={t("podcastWorkshop.ideasHelp")}>
          <label style={labelStyle} htmlFor="podcast-ideas">{t("podcastWorkshop.ideasLabel")}</label>
          <textarea
            id="podcast-ideas"
            value={value.ideas}
            onChange={(event) => patch({ ideas: event.target.value })}
            placeholder={t("podcastWorkshop.ideasPlaceholder")}
            readOnly={readOnly}
            rows={8}
            style={{ ...textareaStyle, minHeight: 210, background: readOnly ? "rgba(248,250,252,0.78)" : "white" }}
          />
        </RoomCard>
      );
    }

    if (activeRoom === "plan") {
      return (
        <RoomCard title={t("podcastWorkshop.planTitle")} help={t("podcastWorkshop.planHelp")}>
          <SegmentFields
            config={config}
            value={value}
            readOnly={readOnly}
            t={t}
            mode="plan"
            onPlan={patchPlan}
            onScript={patchScript}
          />
        </RoomCard>
      );
    }

    if (activeRoom === "script") {
      return (
        <RoomCard
          title={config.scriptMode === "script" ? t("podcastWorkshop.scriptTitle") : t("podcastWorkshop.bulletsTitle")}
          help={config.scriptMode === "script" ? t("podcastWorkshop.scriptHelp") : t("podcastWorkshop.bulletsHelp")}
        >
          <SegmentFields
            config={config}
            value={value}
            readOnly={readOnly}
            t={t}
            mode="script"
            onVoiceChange={patchProductionVoice}
            onPlan={patchPlan}
            onScript={patchScript}
          />
        </RoomCard>
      );
    }

    if (activeRoom === "production") {
      return (
        <RoomCard title={t("podcastWorkshop.productionTitle")} help={t("podcastWorkshop.productionHelp")}>
          <div style={{ display: "grid", gap: 12 }}>
            {config.segments.map((segment, index) => (
              <div key={segment.id} className="podcastWorkshopSegmentShell">
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: "0 0 2px", color: "#64748b", fontSize: 12, fontWeight: 900 }}>
                    {t("podcastWorkshop.part", { n: index + 1 })}
                  </p>
                  <strong>{segment.title}</strong>
                  <p style={{ margin: "6px 0 0", color: "#475569", lineHeight: 1.45 }}>
                    {value.segmentScripts[segment.id] || value.segmentPlans[segment.id] || segment.hint}
                  </p>
                </div>
                <PodcastSegmentPlayback
                  asset={value.productionSegments[segment.id]?.voice ?? null}
                  t={t}
                />
              </div>
            ))}
          </div>
        </RoomCard>
      );
    }

    return (
      <FinalRoom
        config={config}
        value={value}
        readOnly={readOnly}
        feedback={feedback ?? null}
        t={t}
        onNotesChange={(notes) => patch({ notes })}
        onCriterionToggle={toggleCriterion}
      />
    );
  }

  const activeStatus = roomStatus(activeRoom, config, value);

  return (
    <section className="podcastWorkshopShell">
      <div className="podcastWorkshopHero">
        <div className="podcastWorkshopHeroTop">
          <div>
            <p className="podcastWorkshopKicker">{t("podcastWorkshop.kicker")}</p>
            <h2 className="podcastWorkshopTitle">{title}</h2>
            <p className="podcastWorkshopMeta">
              {config.subject || t("podcastWorkshop.subjectFallback")} · {formatMinutes(config.targetDurationSeconds)}
            </p>
          </div>
          <div className="podcastWorkshopStatus">{statusLabel(t, activeStatus)}</div>
        </div>

        <div className="podcastWorkshopAssignment">
          <strong>{t("podcastWorkshop.assignmentTitle")}</strong>
          <div>{config.assignmentText || t("podcastWorkshop.noAssignmentText")}</div>
        </div>
      </div>

      <nav aria-label={t("podcastWorkshop.roomsLabel")} className="podcastWorkshopRooms">
        {rooms.map((room) => {
          const active = room.key === activeRoom;
          const status = roomStatus(room.key, config, value);
          return (
            <button
              key={room.key}
              type="button"
              onClick={() => setActiveRoom(room.key)}
              className={active ? "podcastWorkshopRoomButton isActive" : "podcastWorkshopRoomButton"}
              title={statusLabel(t, status)}
            >
              {room.label}
            </button>
          );
        })}
      </nav>

      <div className="podcastWorkshopGrid">
        <div style={{ minWidth: 0 }}>{renderRoom()}</div>
        <SupportPanel
          activeRoom={activeRoom}
          config={config}
          value={value}
          onMixChange={patchProductionMix}
          feedback={feedback ?? null}
          t={t}
        />
      </div>

      <style jsx>{`
        .podcastWorkshopShell {
          display: grid;
          gap: 14px;
        }

        .podcastWorkshopHero {
          border: 1px solid rgba(16, 185, 129, 0.18);
          border-radius: 14px;
          background: linear-gradient(180deg, rgba(236, 253, 245, 0.95), white);
          padding: 16px;
        }

        .podcastWorkshopHeroTop {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          flex-wrap: wrap;
        }

        .podcastWorkshopKicker {
          margin: 0 0 5px;
          color: #047857;
          font-size: 12px;
          font-weight: 900;
        }

        .podcastWorkshopTitle {
          margin: 0;
          font-size: 24px;
          line-height: 1.18;
        }

        .podcastWorkshopMeta {
          margin: 7px 0 0;
          color: #0f766e;
          font-weight: 750;
        }

        .podcastWorkshopStatus {
          border: 1px solid rgba(16, 185, 129, 0.18);
          border-radius: 12px;
          padding: 8px 10px;
          background: white;
          color: #0f172a;
          font-weight: 900;
        }

        .podcastWorkshopAssignment {
          margin-top: 14px;
          padding: 14px;
          border-radius: 12px;
          border: 1px solid rgba(15, 23, 42, 0.10);
          background: white;
          white-space: pre-wrap;
          line-height: 1.6;
        }

        .podcastWorkshopAssignment strong {
          display: block;
          margin-bottom: 7px;
          font-size: 12px;
          color: #065f46;
        }

        .podcastWorkshopRooms {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding: 8px;
          border-radius: 14px;
          border: 1px solid rgba(15, 23, 42, 0.08);
          background: rgba(255, 255, 255, 0.92);
        }

        .podcastWorkshopRoomButton {
          border: 1px solid rgba(15, 23, 42, 0.14);
          border-radius: 11px;
          padding: 9px 12px;
          background: white;
          color: #0f172a;
          font-weight: 900;
          cursor: pointer;
          white-space: nowrap;
        }

        .podcastWorkshopRoomButton.isActive {
          border-color: rgba(245, 158, 11, 0.80);
          background: #facc15;
          box-shadow: 0 8px 18px rgba(245, 158, 11, 0.18);
        }

        .podcastWorkshopGrid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(240px, 300px);
          gap: 14px;
          align-items: start;
        }

        .podcastWorkshopSegmentShell {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 12px;
          padding: 12px 14px;
          border-radius: 12px;
          border: 1px solid rgba(15, 23, 42, 0.10);
          background: rgba(248, 250, 252, 0.75);
        }

        .podcastWorkshopLater {
          border-radius: 999px;
          padding: 6px 10px;
          background: rgba(226, 232, 240, 0.9);
          color: #334155;
          font-size: 12px;
          font-weight: 900;
          white-space: nowrap;
        }

        .podcastWorkshopCheck {
          display: flex;
          align-items: flex-start;
          gap: 9px;
          padding: 9px 10px;
          border-radius: 10px;
          background: rgba(248, 250, 252, 0.95);
          color: #0f172a;
          font-weight: 750;
        }

        .podcastWorkshopCheck.isChecked {
          background: rgba(220, 252, 231, 0.9);
        }

        @media (max-width: 820px) {
          .podcastWorkshopGrid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
}

function PodcastSegmentRecorder({
  disabled,
  existing,
  t,
  onChange,
}: {
  disabled: boolean;
  segmentId: string;
  existing: StudentAudioAsset | null;
  t: TFn;
  onChange: (asset: StudentAudioAsset | null) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(existing?.durationSeconds ?? 0);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function startRecording() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(t("audioReading.errors.unsupported"));
      return;
    }

    try {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      startedAtRef.current = Date.now();
      setElapsedSeconds(0);

      const timer = window.setInterval(() => {
        if (startedAtRef.current != null) {
          setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
        }
      }, 250);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        window.clearInterval(timer);
        const durationSeconds = Math.max(1, Math.floor((Date.now() - (startedAtRef.current ?? Date.now())) / 1000));
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const audioDataUrl = await blobToDataUrl(blob);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        startedAtRef.current = null;
        setRecording(false);
        setElapsedSeconds(durationSeconds);
        onChange({
          version: 1,
          activityType: "podcast",
          audioDataUrl,
          mimeType: recorder.mimeType || "audio/webm",
          durationSeconds,
          recordedAt: Date.now(),
          visibility: "teacher",
          retentionPolicy: "review_plus_30_days",
        });
      };

      recorder.start();
      setRecording(true);
    } catch (err: unknown) {
      const name = err instanceof DOMException ? err.name : "";
      setError(name === "NotAllowedError" ? t("audioReading.errors.permission") : t("audioReading.errors.default"));
      setRecording(false);
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
  }

  function deleteRecording() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    startedAtRef.current = null;
    setRecording(false);
    setElapsedSeconds(0);
    setError(null);
    onChange(null);
  }

  const playableUrl = existing?.audioDataUrl ?? "";

  return (
    <div className="podcastSegmentRecorder">
      <div className="podcastSegmentRecorderTop">
        <strong>{t("podcastWorkshop.voiceRecording")}</strong>
        <span>{formatDuration(recording ? elapsedSeconds : existing?.durationSeconds ?? elapsedSeconds)}</span>
      </div>
      <div className="podcastSegmentRecorderActions">
        {!recording && !disabled ? (
          <button type="button" onClick={startRecording}>
            {existing ? t("podcastWorkshop.recordAgain") : t("podcastWorkshop.recordVoice")}
          </button>
        ) : null}
        {recording ? (
          <button type="button" onClick={stopRecording}>
            {t("audioReading.stop")}
          </button>
        ) : null}
        {!recording && existing && !disabled ? (
          <button type="button" onClick={deleteRecording}>
            {t("audioReading.delete")}
          </button>
        ) : null}
      </div>
      {recording ? (
        <div className="podcastSegmentRecording">{t("audioReading.recording")}</div>
      ) : null}
      {playableUrl ? (
        <audio controls src={playableUrl} style={{ width: "100%", marginTop: 8 }} />
      ) : null}
      {error ? <div className="podcastSegmentError">{error}</div> : null}

      <style jsx>{`
        .podcastSegmentRecorder {
          border: 1px solid rgba(15, 23, 42, 0.12);
          border-radius: 12px;
          background: white;
          padding: 10px;
        }

        .podcastSegmentRecorderTop {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          color: #0f172a;
          font-variant-numeric: tabular-nums;
        }

        .podcastSegmentRecorderActions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 8px;
        }

        .podcastSegmentRecorderActions button {
          border: 1px solid rgba(15, 23, 42, 0.18);
          border-radius: 10px;
          background: white;
          padding: 8px 10px;
          font-weight: 900;
          cursor: pointer;
        }

        .podcastSegmentRecording {
          margin-top: 8px;
          border-radius: 10px;
          background: #fff1f2;
          color: #9f1239;
          padding: 8px 10px;
          font-weight: 900;
        }

        .podcastSegmentError {
          margin-top: 8px;
          border-radius: 10px;
          background: #fff1f2;
          color: #be123c;
          padding: 8px 10px;
          font-weight: 800;
        }
      `}</style>
    </div>
  );
}

function RoomCard({
  title,
  help,
  children,
}: {
  title: string;
  help: string;
  children: ReactNode;
}) {
  return (
    <div style={cardStyle}>
      <h3 style={{ margin: "0 0 6px", fontSize: 20 }}>{title}</h3>
      <p style={{ margin: "0 0 14px", color: "#475569", lineHeight: 1.5 }}>{help}</p>
      {children}
    </div>
  );
}

function SegmentFields({
  config,
  value,
  readOnly,
  t,
  mode,
  onVoiceChange,
  onPlan,
  onScript,
}: {
  config: PodcastWorkshopConfig;
  value: PodcastWorkshopSubmission;
  readOnly: boolean;
  t: TFn;
  mode: "plan" | "script";
  onVoiceChange?: (segmentId: string, voice: StudentAudioAsset | null) => void;
  onPlan: (segmentId: string, text: string) => void;
  onScript: (segmentId: string, text: string) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {config.segments.map((segment, index) => (
        <div
          key={segment.id}
          style={{
            border: "1px solid rgba(15,23,42,0.10)",
            borderRadius: 12,
            background: "rgba(248,250,252,0.58)",
            padding: 12,
          }}
        >
          <p style={{ margin: "0 0 3px", color: "#64748b", fontSize: 12, fontWeight: 900 }}>
            {t("podcastWorkshop.part", { n: index + 1 })}
          </p>
          <h4 style={{ margin: "0 0 5px", fontSize: 16 }}>{segment.title}</h4>
          {segment.hint ? (
            <p style={{ margin: "0 0 10px", color: "#475569", lineHeight: 1.45 }}>{segment.hint}</p>
          ) : null}

          {mode === "plan" ? (
            <>
              <label style={labelStyle} htmlFor={`podcast-plan-${segment.id}`}>
                {t("podcastWorkshop.planLabel")}
              </label>
              <textarea
                id={`podcast-plan-${segment.id}`}
                value={value.segmentPlans[segment.id] ?? ""}
                onChange={(event) => onPlan(segment.id, event.target.value)}
                placeholder={t("podcastWorkshop.planPlaceholder")}
                readOnly={readOnly}
                rows={3}
                style={{
                  ...textareaStyle,
                  minHeight: 82,
                  background: readOnly ? "rgba(248,250,252,0.78)" : "white",
                }}
              />
            </>
          ) : (
            <>
              <label style={labelStyle} htmlFor={`podcast-script-${segment.id}`}>
                {config.scriptMode === "script"
                  ? t("podcastWorkshop.scriptLabel")
                  : t("podcastWorkshop.bulletsLabel")}
              </label>
              <textarea
                id={`podcast-script-${segment.id}`}
                value={value.segmentScripts[segment.id] ?? ""}
                onChange={(event) => onScript(segment.id, event.target.value)}
                placeholder={
                  config.scriptMode === "script"
                    ? t("podcastWorkshop.scriptPlaceholder")
                    : t("podcastWorkshop.bulletsPlaceholder")
                }
                readOnly={readOnly}
                rows={5}
                style={{
                  ...textareaStyle,
                  background: readOnly ? "rgba(248,250,252,0.78)" : "white",
                }}
              />
              {onVoiceChange ? (
                <div style={{ marginTop: 12 }}>
                  <PodcastSegmentRecorder
                    disabled={readOnly}
                    segmentId={segment.id}
                    existing={value.productionSegments[segment.id]?.voice ?? null}
                    t={t}
                    onChange={(voice) => onVoiceChange(segment.id, voice)}
                  />
                </div>
              ) : null}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function PodcastSegmentPlayback({
  asset,
  t,
}: {
  asset: StudentAudioAsset | null;
  t: TFn;
}) {
  if (!asset) {
    return (
      <div className="podcastSegmentMissing">
        {t("podcastWorkshop.noVoiceRecording")}
      </div>
    );
  }

  return (
    <div className="podcastSegmentPlayback">
      <div className="podcastSegmentPlaybackTop">
        <strong>{t("podcastWorkshop.voiceRecording")}</strong>
        <span>{formatDuration(asset.durationSeconds)}</span>
      </div>
      {asset.audioDataUrl ? (
        <audio controls src={asset.audioDataUrl} style={{ width: "100%", marginTop: 8 }} />
      ) : (
        <div className="podcastSegmentMissing" style={{ marginTop: 8 }}>
          {t("podcastWorkshop.audioSaved")}
        </div>
      )}

      <style jsx>{`
        .podcastSegmentPlayback {
          border: 1px solid rgba(15, 23, 42, 0.12);
          border-radius: 12px;
          background: white;
          padding: 10px;
        }

        .podcastSegmentPlaybackTop {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          color: #0f172a;
          font-variant-numeric: tabular-nums;
        }

        .podcastSegmentMissing {
          border: 1px dashed rgba(15, 23, 42, 0.18);
          border-radius: 12px;
          background: rgba(248, 250, 252, 0.9);
          color: #64748b;
          padding: 10px;
          font-weight: 800;
        }
      `}</style>
    </div>
  );
}

function PodcastFullPlayback({
  config,
  value,
  t,
}: {
  config: PodcastWorkshopConfig;
  value: PodcastWorkshopSubmission;
  t: TFn;
}) {
  const [playing, setPlaying] = useState(false);
  const playerRef = useRef<HTMLAudioElement | null>(null);
  const cancelledRef = useRef(false);
  const segmentsWithAudio = getVoiceSegments(config, value);
  const totalSeconds = getVoiceDuration(config, value);

  useEffect(() => {
    return () => {
      playerRef.current?.pause();
      playerRef.current = null;
    };
  }, []);

  function stopPlayback() {
    cancelledRef.current = true;
    playerRef.current?.pause();
    playerRef.current = null;
    setPlaying(false);
  }

  async function playAudioUrl(url: string) {
    return new Promise<void>((resolve) => {
      const audio = new Audio(url);
      playerRef.current = audio;
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      void audio.play();
    });
  }

  async function playWholePodcast() {
    if (playing) {
      stopPlayback();
      return;
    }

    if (segmentsWithAudio.length === 0) return;

    cancelledRef.current = false;
    setPlaying(true);
    await playToneSequence(value.productionMix.introSoundId);
    for (let index = 0; index < config.segments.length; index += 1) {
      if (cancelledRef.current) break;
      const segment = config.segments[index];
      const url = value.productionSegments[segment.id]?.voice?.audioDataUrl;
      if (url) await playAudioUrl(url);
      const hasNextVoice = config.segments.slice(index + 1).some((nextSegment) => {
        return !!value.productionSegments[nextSegment.id]?.voice?.audioDataUrl;
      });
      if (!cancelledRef.current && hasNextVoice) {
        await playToneSequence(value.productionMix.transitionSoundId);
      }
    }
    if (!cancelledRef.current) await playToneSequence(value.productionMix.outroSoundId);
    if (!cancelledRef.current) setPlaying(false);
  }

  return (
    <div className="podcastProductionPlayback">
      <div className="podcastProductionHeader">
        <h3>{t("podcastWorkshop.productionControlTitle")}</h3>
        <span>{formatDuration(totalSeconds)}</span>
      </div>
      <button
        type="button"
        onClick={playWholePodcast}
        disabled={segmentsWithAudio.length === 0}
        className="podcastProductionPlay"
      >
        {playing ? t("podcastWorkshop.stopFullPodcast") : t("podcastWorkshop.playFullPodcast")}
      </button>

      <style jsx>{`
        .podcastProductionPlayback {
          display: grid;
          gap: 12px;
        }

        .podcastProductionHeader {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          font-variant-numeric: tabular-nums;
        }

        .podcastProductionHeader h3 {
          margin: 0;
          font-size: 15px;
          color: #0f172a;
        }

        .podcastProductionHeader span {
          border-radius: 999px;
          background: white;
          color: #0f766e;
          padding: 5px 8px;
          font-size: 12px;
          font-weight: 900;
        }

        .podcastProductionPlay {
          width: 100%;
          border: 1px solid #0f172a;
          border-radius: 12px;
          background: #0f172a;
          color: white;
          padding: 10px 12px;
          font-weight: 900;
          cursor: pointer;
        }

        .podcastProductionPlay:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }
      `}</style>
    </div>
  );
}

function FinalRoom({
  config,
  value,
  readOnly,
  feedback,
  t,
  onNotesChange,
  onCriterionToggle,
}: {
  config: PodcastWorkshopConfig;
  value: PodcastWorkshopSubmission;
  readOnly: boolean;
  feedback: PodcastWorkshopFeedback | null;
  t: TFn;
  onNotesChange: (notes: string) => void;
  onCriterionToggle: (key: string) => void;
}) {
  const segmentsWithAudio = getVoiceSegments(config, value);
  const missingCount = config.segments.length - segmentsWithAudio.length;
  const finalFeedback = feedback?.rooms?.final ?? null;
  const finalFeedbackText = String(finalFeedback?.text ?? "").trim();
  const finalFeedbackStatus = finalFeedback?.status ?? "";

  return (
    <RoomCard title={t("podcastWorkshop.finalRoomTitle")} help={t("podcastWorkshop.finalHelp")}>
      <div className="podcastFinalPreview">
        <div>
          <p>{t("podcastWorkshop.finalProductLabel")}</p>
          <h3>{t("podcastWorkshop.finalPodcastTitle")}</h3>
          <div className="podcastFinalStats">
            <span>{t("podcastWorkshop.productionReady")}: {segmentsWithAudio.length}</span>
            <span>{t("podcastWorkshop.productionMissing")}: {missingCount}</span>
          </div>
        </div>
        <PodcastFullPlayback config={config} value={value} t={t} />
      </div>

      {finalFeedbackText || finalFeedbackStatus ? (
        <div className={finalFeedbackStatus === "needs_work" ? "podcastFinalFeedback needsWork" : "podcastFinalFeedback"}>
          <strong>{t("podcastWorkshop.teacherFeedbackTitle")}</strong>
          {finalFeedbackStatus ? (
            <span>
              {finalFeedbackStatus === "needs_work"
                ? t("podcastWorkshop.teacherNeedsWork")
                : t("podcastWorkshop.teacherApproved")}
            </span>
          ) : null}
          {finalFeedbackText ? <p>{finalFeedbackText}</p> : null}
        </div>
      ) : null}

      <label style={{ ...labelStyle, marginTop: 16 }} htmlFor="podcast-notes">
        {t("podcastWorkshop.finalNotesLabel")}
      </label>
      <textarea
        id="podcast-notes"
        value={value.notes}
        onChange={(event) => onNotesChange(event.target.value)}
        placeholder={t("podcastWorkshop.finalNotesPlaceholder")}
        readOnly={readOnly}
        rows={4}
        style={{ ...textareaStyle, minHeight: 108, background: readOnly ? "rgba(248,250,252,0.78)" : "white" }}
      />

      {config.criteria.length > 0 ? (
        <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
          <h4 style={{ margin: "0 0 2px", fontSize: 15 }}>{t("podcastWorkshop.finalChecklistTitle")}</h4>
          {config.criteria.map((criterion, index) => {
            const key = `criterion_${index}`;
            return (
              <label
                key={key}
                className={value.selfAssessment[key] ? "podcastWorkshopCheck isChecked" : "podcastWorkshopCheck"}
              >
                <input
                  type="checkbox"
                  checked={value.selfAssessment[key] === true}
                  disabled={readOnly}
                  onChange={() => onCriterionToggle(key)}
                  style={{ marginTop: 3 }}
                />
                <span>{criterion}</span>
              </label>
            );
          })}
        </div>
      ) : null}

      <style jsx>{`
        .podcastFinalPreview {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(220px, 280px);
          gap: 14px;
          align-items: stretch;
          border: 1px solid rgba(20, 184, 166, 0.20);
          border-radius: 14px;
          background: rgba(240, 253, 250, 0.94);
          padding: 14px;
        }

        .podcastFinalPreview p {
          margin: 0 0 6px;
          color: #0f766e;
          font-size: 12px;
          font-weight: 900;
        }

        .podcastFinalPreview h3 {
          margin: 0;
          color: #0f172a;
          font-size: 21px;
        }

        .podcastFinalStats {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 12px;
        }

        .podcastFinalStats span {
          border-radius: 999px;
          background: white;
          color: #0f766e;
          padding: 6px 9px;
          font-size: 12px;
          font-weight: 900;
        }

        .podcastFinalFeedback {
          display: grid;
          gap: 8px;
          margin-top: 14px;
          border: 1px solid rgba(16, 185, 129, 0.24);
          border-radius: 14px;
          background: rgba(236, 253, 245, 0.96);
          padding: 13px;
          color: #0f172a;
        }

        .podcastFinalFeedback.needsWork {
          border-color: rgba(245, 158, 11, 0.28);
          background: rgba(255, 251, 235, 0.96);
        }

        .podcastFinalFeedback strong {
          color: #065f46;
          font-size: 14px;
        }

        .podcastFinalFeedback.needsWork strong {
          color: #92400e;
        }

        .podcastFinalFeedback span {
          justify-self: start;
          border-radius: 999px;
          background: white;
          color: #047857;
          padding: 5px 8px;
          font-size: 12px;
          font-weight: 900;
        }

        .podcastFinalFeedback.needsWork span {
          color: #92400e;
        }

        .podcastFinalFeedback p {
          margin: 0;
          white-space: pre-wrap;
          line-height: 1.55;
          font-weight: 650;
        }

        @media (max-width: 760px) {
          .podcastFinalPreview {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </RoomCard>
  );
}

function ProductionPanel({
  config,
  value,
  onMixChange,
  t,
}: {
  config: PodcastWorkshopConfig;
  value: PodcastWorkshopSubmission;
  onMixChange: (key: "introSoundId" | "transitionSoundId" | "outroSoundId", soundId: PodcastSoundId) => void;
  t: TFn;
}) {
  const segmentsWithAudio = getVoiceSegments(config, value);
  const missingCount = config.segments.length - segmentsWithAudio.length;

  return (
    <aside className="podcastProductionPanel">
      <div className="podcastProductionCard isPrimary">
        <PodcastFullPlayback config={config} value={value} t={t} />
      </div>

      <div className="podcastProductionCard">
        <h3>{t("podcastWorkshop.soundLibraryTitle")}</h3>
        <SoundSelect
          label={t("podcastWorkshop.introSound")}
          value={value.productionMix.introSoundId}
          options={PODCAST_SOUND_GROUPS.intro}
          t={t}
          onChange={(soundId) => onMixChange("introSoundId", soundId)}
        />
        <SoundSelect
          label={t("podcastWorkshop.transitionSound")}
          value={value.productionMix.transitionSoundId}
          options={PODCAST_SOUND_GROUPS.transition}
          t={t}
          onChange={(soundId) => onMixChange("transitionSoundId", soundId)}
        />
        <SoundSelect
          label={t("podcastWorkshop.outroSound")}
          value={value.productionMix.outroSoundId}
          options={PODCAST_SOUND_GROUPS.outro}
          t={t}
          onChange={(soundId) => onMixChange("outroSoundId", soundId)}
        />
      </div>

      <div className="podcastProductionCard">
        <h3>{t("podcastWorkshop.productionStatusTitle")}</h3>
        <div className="podcastProductionStats">
          <div>
            <strong>{segmentsWithAudio.length}</strong>
            <span>{t("podcastWorkshop.productionReady")}</span>
          </div>
          <div>
            <strong>{missingCount}</strong>
            <span>{t("podcastWorkshop.productionMissing")}</span>
          </div>
        </div>
      </div>

      <div className="podcastProductionCard">
        <h3>{t("podcastWorkshop.productionOrderTitle")}</h3>
        <div className="podcastProductionOrder">
          {config.segments.map((segment, index) => {
            const voice = value.productionSegments[segment.id]?.voice ?? null;
            return (
              <div key={segment.id} className={voice ? "isReady" : ""}>
                <span>{index + 1}</span>
                <strong>{segment.title}</strong>
                <em>{voice ? formatDuration(voice.durationSeconds) : t("podcastWorkshop.productionNoClip")}</em>
              </div>
            );
          })}
        </div>
      </div>

      <style jsx>{`
        .podcastProductionPanel {
          display: grid;
          gap: 12px;
          align-self: start;
          position: sticky;
          top: 12px;
        }

        .podcastProductionCard {
          border: 1px solid rgba(15, 23, 42, 0.10);
          border-radius: 14px;
          background: white;
          padding: 14px;
        }

        .podcastProductionCard.isPrimary {
          border-color: rgba(20, 184, 166, 0.22);
          background: rgba(240, 253, 250, 0.95);
        }

        .podcastProductionCard h3 {
          margin: 0 0 10px;
          font-size: 15px;
          color: #0f172a;
        }

        .podcastProductionHeader {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          font-variant-numeric: tabular-nums;
        }

        .podcastProductionHeader h3 {
          margin: 0;
        }

        .podcastProductionHeader span {
          border-radius: 999px;
          background: white;
          color: #0f766e;
          padding: 5px 8px;
          font-size: 12px;
          font-weight: 900;
        }

        .podcastProductionPlay {
          margin-top: 12px;
          width: 100%;
          border: 1px solid #0f172a;
          border-radius: 12px;
          background: #0f172a;
          color: white;
          padding: 10px 12px;
          font-weight: 900;
          cursor: pointer;
        }

        .podcastProductionPlay:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }

        .podcastProductionStats {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .podcastSoundSelect {
          display: grid;
          gap: 6px;
          margin-top: 10px;
        }

        .podcastSoundSelect label {
          color: #334155;
          font-size: 12px;
          font-weight: 900;
        }

        .podcastSoundSelect select {
          width: 100%;
          border: 1px solid rgba(15, 23, 42, 0.16);
          border-radius: 10px;
          background: white;
          padding: 9px 10px;
          color: #0f172a;
          font-weight: 800;
        }

        .podcastProductionStats div {
          border-radius: 12px;
          background: rgba(248, 250, 252, 0.95);
          padding: 10px;
        }

        .podcastProductionStats strong {
          display: block;
          font-size: 24px;
          line-height: 1;
        }

        .podcastProductionStats span {
          display: block;
          margin-top: 4px;
          color: #475569;
          font-size: 12px;
          font-weight: 800;
        }

        .podcastProductionOrder {
          display: grid;
          gap: 8px;
        }

        .podcastProductionOrder div {
          display: grid;
          grid-template-columns: 26px minmax(0, 1fr);
          gap: 8px;
          border-radius: 12px;
          background: rgba(248, 250, 252, 0.95);
          padding: 9px;
        }

        .podcastProductionOrder div.isReady {
          background: rgba(236, 253, 245, 0.95);
        }

        .podcastProductionOrder span {
          display: inline-flex;
          width: 24px;
          height: 24px;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: white;
          font-size: 12px;
          font-weight: 900;
        }

        .podcastProductionOrder strong,
        .podcastProductionOrder em {
          min-width: 0;
        }

        .podcastProductionOrder em {
          grid-column: 2;
          color: #64748b;
          font-size: 12px;
          font-style: normal;
          font-weight: 800;
        }

        @media (max-width: 820px) {
          .podcastProductionPanel {
            position: static;
          }
        }
      `}</style>
    </aside>
  );
}

function SoundSelect({
  label,
  value,
  options,
  t,
  onChange,
}: {
  label: string;
  value: PodcastSoundId;
  options: PodcastSoundId[];
  t: TFn;
  onChange: (soundId: PodcastSoundId) => void;
}) {
  return (
    <div className="podcastSoundSelect">
      <label>{label}</label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as PodcastSoundId)}
      >
        {options.map((soundId) => (
          <option key={soundId || "none"} value={soundId}>
            {soundId ? t(`podcastWorkshop.sounds.${soundId}`) : t("podcastWorkshop.sounds.none")}
          </option>
        ))}
      </select>
    </div>
  );
}

function SupportPanel({
  activeRoom,
  config,
  value,
  onMixChange,
  feedback,
  t,
}: {
  activeRoom: PodcastWorkshopRoomKey;
  config: PodcastWorkshopConfig;
  value: PodcastWorkshopSubmission;
  onMixChange: (key: "introSoundId" | "transitionSoundId" | "outroSoundId", soundId: PodcastSoundId) => void;
  feedback: PodcastWorkshopFeedback | null;
  t: TFn;
}) {
  const roomFeedback = feedback?.rooms?.[activeRoom] ?? null;
  const feedbackText = String(roomFeedback?.text ?? "").trim();
  const feedbackStatus = roomFeedback?.status ?? "";

  if (activeRoom === "production") {
    return (
      <ProductionPanel
        config={config}
        value={value}
        onMixChange={onMixChange}
        t={t}
      />
    );
  }

  return (
    <aside className="podcastWorkshopSupport">
      {feedbackText || feedbackStatus ? (
        <div
          style={{
            ...cardStyle,
            borderColor:
              feedbackStatus === "needs_work"
                ? "rgba(245,158,11,0.28)"
                : "rgba(16,185,129,0.24)",
            background:
              feedbackStatus === "needs_work"
                ? "rgba(255,251,235,0.96)"
                : "rgba(236,253,245,0.96)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: 14,
                color: feedbackStatus === "needs_work" ? "#92400e" : "#065f46",
              }}
            >
              {t("podcastWorkshop.teacherFeedbackTitle")}
            </h3>
            {feedbackStatus ? (
              <span
                style={{
                  borderRadius: 999,
                  padding: "5px 8px",
                  background: "white",
                  color: feedbackStatus === "needs_work" ? "#92400e" : "#047857",
                  fontSize: 12,
                  fontWeight: 900,
                  whiteSpace: "nowrap",
                }}
              >
                {feedbackStatus === "needs_work"
                  ? t("podcastWorkshop.teacherNeedsWork")
                  : t("podcastWorkshop.teacherApproved")}
              </span>
            ) : null}
          </div>
          {feedbackText ? (
            <div
              style={{
                marginTop: 10,
                whiteSpace: "pre-wrap",
                color: "#0f172a",
                lineHeight: 1.55,
                fontWeight: 650,
              }}
            >
              {feedbackText}
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        style={{
          ...cardStyle,
          borderColor: "rgba(20,184,166,0.20)",
          background: "rgba(240,253,250,0.94)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 14, color: "#115e59" }}>{t("podcastWorkshop.supportTitle")}</h3>
          <span className="podcastWorkshopAiBadge">
            {config.aiSupport === "off" ? t("podcastWorkshop.aiOff") : t("podcastWorkshop.aiCoach")}
          </span>
        </div>
        <p style={{ margin: "8px 0 0", color: "#134e4a", fontWeight: 700, lineHeight: 1.45 }}>
          {t("podcastWorkshop.supportHint")}
        </p>
      </div>

      {config.guidingQuestions.length > 0 ? (
        <SupportCard title={t("podcastWorkshop.questionsTitle")}>
          {config.guidingQuestions.map((question) => (
            <SupportItem key={question}>{question}</SupportItem>
          ))}
        </SupportCard>
      ) : null}

      {config.vocabulary.length > 0 ? (
        <SupportCard title={t("podcastWorkshop.vocabulary")}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {config.vocabulary.map((word) => (
              <span key={word} className="podcastWorkshopWord">{word}</span>
            ))}
          </div>
        </SupportCard>
      ) : null}

      {config.criteria.length > 0 ? (
        <SupportCard title={t("podcastWorkshop.criteria")}>
          {config.criteria.map((criterion) => (
            <SupportItem key={criterion}>{criterion}</SupportItem>
          ))}
        </SupportCard>
      ) : null}

      <style jsx>{`
        .podcastWorkshopSupport {
          display: grid;
          gap: 12px;
          align-self: start;
          position: sticky;
          top: 12px;
        }

        .podcastWorkshopAiBadge {
          border-radius: 999px;
          padding: 5px 8px;
          background: white;
          color: #0f766e;
          font-size: 12px;
          font-weight: 900;
          white-space: nowrap;
        }

        .podcastWorkshopWord {
          border: 1px solid rgba(22, 101, 52, 0.18);
          border-radius: 999px;
          padding: 7px 10px;
          background: rgba(240, 253, 244, 0.92);
          color: #14532d;
          font-weight: 850;
        }

        @media (max-width: 820px) {
          .podcastWorkshopSupport {
            position: static;
          }
        }
      `}</style>
    </aside>
  );
}

function SupportCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={cardStyle}>
      <h3 style={{ margin: "0 0 10px", fontSize: 15 }}>{title}</h3>
      <div style={{ display: "grid", gap: 7 }}>{children}</div>
    </div>
  );
}

function SupportItem({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        borderRadius: 10,
        padding: "8px 10px",
        background: "rgba(248,250,252,0.95)",
        color: "#334155",
        fontWeight: 700,
        lineHeight: 1.4,
      }}
    >
      {children}
    </div>
  );
}
