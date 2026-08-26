"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Pause, Play, Square, Trash2 } from "lucide-react";
import type { StudentAudioAsset } from "@/lib/audio/studentAudio";

export type AudioReadingSubmission = StudentAudioAsset;

type Props = {
  disabled: boolean;
  required: boolean;
  submitted: boolean;
  existing: AudioReadingSubmission | null;
  t: (key: string, values?: Record<string, unknown>) => string;
  onRecordingReady: (recording: AudioReadingSubmission | null) => void;
};

type RecorderStatus = "idle" | "recording" | "paused" | "ready";

function formatDuration(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
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

function statusLabel(status: RecorderStatus, t: Props["t"]) {
  if (status === "recording") return t("audioReading.recording");
  if (status === "paused") return t("audioReading.paused");
  if (status === "ready") return t("audioReading.ready");
  return t("audioReading.waiting");
}

export default function AudioReadingStudentSection({
  disabled,
  required,
  submitted,
  existing,
  t,
  onRecordingReady,
}: Props) {
  const [status, setStatus] = useState<RecorderStatus>(existing ? "ready" : "idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(existing?.durationSeconds ?? 0);
  const [previewUrl, setPreviewUrl] = useState(existing?.audioDataUrl ?? "");
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const accumulatedMsRef = useRef(0);

  useEffect(() => {
    if (!existing) return;
    setStatus("ready");
    setElapsedSeconds(existing.durationSeconds);
    setPreviewUrl(existing.audioDataUrl ?? "");
  }, [existing]);

  useEffect(() => {
    if (status !== "recording" || startedAtRef.current == null) return;

    const interval = window.setInterval(() => {
      const activeMs = Date.now() - (startedAtRef.current ?? Date.now());
      setElapsedSeconds(Math.floor((accumulatedMsRef.current + activeMs) / 1000));
    }, 250);

    return () => window.clearInterval(interval);
  }, [status]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function resetRecording() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.ondataavailable = null;
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    startedAtRef.current = null;
    accumulatedMsRef.current = 0;
    setElapsedSeconds(0);
    setPreviewUrl("");
    setStatus("idle");
    setError(null);
    onRecordingReady(null);
  }

  async function startRecording() {
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError(t("audioReading.errors.unsupported"));
      return;
    }

    try {
      resetRecording();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        const durationSeconds = Math.max(1, Math.floor(accumulatedMsRef.current / 1000));
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const audioDataUrl = await blobToDataUrl(blob);

        setPreviewUrl(audioDataUrl);
        setElapsedSeconds(durationSeconds);
        setStatus("ready");
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        startedAtRef.current = null;

        onRecordingReady({
          version: 1,
          activityType: "audio_reading",
          audioDataUrl,
          mimeType: recorder.mimeType || "audio/webm",
          durationSeconds,
          recordedAt: Date.now(),
          visibility: "teacher",
          retentionPolicy: "review_plus_30_days",
        });
      };

      recorder.start();
      accumulatedMsRef.current = 0;
      startedAtRef.current = Date.now();
      setElapsedSeconds(0);
      setStatus("recording");
    } catch (err: unknown) {
      const name = err instanceof DOMException ? err.name : "";
      setError(name === "NotAllowedError" ? t("audioReading.errors.permission") : t("audioReading.errors.default"));
      setStatus("idle");
    }
  }

  function pauseRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    accumulatedMsRef.current += Date.now() - (startedAtRef.current ?? Date.now());
    startedAtRef.current = null;
    recorder.pause();
    setStatus("paused");
  }

  function resumeRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "paused") return;
    recorder.resume();
    startedAtRef.current = Date.now();
    setStatus("recording");
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;

    if (startedAtRef.current != null) {
      accumulatedMsRef.current += Date.now() - startedAtRef.current;
      setElapsedSeconds(Math.floor(accumulatedMsRef.current / 1000));
    }

    recorder.stop();
  }

  const canStart = (status === "idle" || status === "ready") && !disabled;
  const canPause = status === "recording" && !disabled;
  const canResume = status === "paused" && !disabled;
  const canStop = (status === "recording" || status === "paused") && !disabled;
  const canDelete = !disabled && !!previewUrl && status !== "recording" && status !== "paused";
  const pauseResumeLabel = status === "paused" ? t("audioReading.resume") : t("audioReading.pause");

  return (
    <section
      style={{
        border: "1px solid rgba(15,23,42,0.12)",
        borderRadius: 16,
        background: "white",
        padding: 16,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>
            {t("audioReading.title")}
          </h2>
          <p style={{ margin: "6px 0 0", color: "#475569", fontSize: 14, lineHeight: 1.55 }}>
            {t("audioReading.subtitle")}
          </p>
          <p style={{ margin: "6px 0 0", color: "#0f766e", fontSize: 13, fontWeight: 750, lineHeight: 1.45 }}>
            {submitted ? t("audioReading.submittedPrivacy") : t("audioReading.privacy")}
          </p>
        </div>
        <div
          style={{
            border: "1px solid rgba(15,23,42,0.10)",
            borderRadius: 12,
            background: "#f8fafc",
            padding: "8px 12px",
            fontWeight: 900,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatDuration(elapsedSeconds)}
        </div>
      </div>

      <div className="audioReadingActions">
        <button
          type="button"
          onClick={startRecording}
          disabled={!canStart}
          className="audioReadingAction isStart"
        >
          <Mic size={18} aria-hidden="true" />
          {previewUrl ? t("audioReading.recordAgain") : t("audioReading.start")}
        </button>

        <button
          type="button"
          onClick={status === "paused" ? resumeRecording : pauseRecording}
          disabled={!(canPause || canResume)}
          className={`audioReadingAction ${status === "paused" ? "isResume" : "isPause"}`}
        >
          {status === "paused" ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}
          {pauseResumeLabel}
        </button>

        <button
          type="button"
          onClick={stopRecording}
          disabled={!canStop}
          className="audioReadingAction isStop"
        >
          <Square size={18} aria-hidden="true" />
          {t("audioReading.stop")}
        </button>

        <button
          type="button"
          onClick={resetRecording}
          disabled={!canDelete}
          className="audioReadingAction isDelete"
        >
          <Trash2 size={18} aria-hidden="true" />
          {t("audioReading.delete")}
        </button>
      </div>

      {status === "recording" || status === "paused" ? (
        <div
          style={{
            marginTop: 14,
            border: status === "recording"
              ? "1px solid rgba(225,29,72,0.24)"
              : "1px solid rgba(15,23,42,0.14)",
            borderRadius: 14,
            background: status === "recording" ? "#fff1f2" : "#f8fafc",
            padding: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <span
                className={status === "recording" ? "audioReadingDot isRecording" : "audioReadingDot"}
                aria-hidden="true"
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: status === "recording" ? "#9f1239" : "#334155" }}>
                  {statusLabel(status, t)}
                </div>
                <div style={{ marginTop: 2, fontSize: 12, fontWeight: 650, color: "#64748b" }}>
                  {status === "recording" ? t("audioReading.recordingHint") : t("audioReading.pausedHint")}
                </div>
              </div>
            </div>
            <div style={{ fontWeight: 950, fontVariantNumeric: "tabular-nums", color: "#0f172a" }}>
              {formatDuration(elapsedSeconds)}
            </div>
          </div>

          <div
            style={{
              marginTop: 10,
              height: 8,
              overflow: "hidden",
              borderRadius: 999,
              background: "rgba(15,23,42,0.10)",
            }}
          >
            <div
              className={status === "recording" ? "audioReadingMeter isRecording" : "audioReadingMeter"}
            />
          </div>
        </div>
      ) : null}

      {error ? (
        <div
          style={{
            marginTop: 12,
            border: "1px solid rgba(225,29,72,0.25)",
            borderRadius: 12,
            background: "#fff1f2",
            color: "#be123c",
            padding: "10px 12px",
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          {error}
        </div>
      ) : null}

      {previewUrl ? (
        <div
          style={{
            marginTop: 14,
            border: "1px solid rgba(15,23,42,0.10)",
            borderRadius: 14,
            background: "#f8fafc",
            padding: 12,
          }}
        >
          <div style={{ marginBottom: 8, fontWeight: 850 }}>
            {t("audioReading.preview")}
          </div>
          <audio controls src={previewUrl} style={{ width: "100%" }} />
        </div>
      ) : (
        <div style={{ marginTop: 12, color: "#64748b", fontSize: 14 }}>
          {required ? t("audioReading.required") : t("audioReading.optional")}
        </div>
      )}

      <style jsx>{`
        .audioReadingActions {
          display: grid;
          gap: 8px;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          margin-top: 14px;
        }

        .audioReadingAction {
          align-items: center;
          border: 1px solid rgba(15, 23, 42, 0.18);
          border-radius: 12px;
          display: inline-flex;
          font-weight: 900;
          gap: 8px;
          justify-content: center;
          min-height: 44px;
          padding: 10px 12px;
          transition: background 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
          white-space: nowrap;
        }

        .audioReadingAction:disabled {
          cursor: not-allowed;
          opacity: 0.45;
        }

        .audioReadingAction.isStart {
          background: #be123c;
          border-color: #be123c;
          color: white;
        }

        .audioReadingAction.isPause {
          background: #fff7ed;
          border-color: #fdba74;
          color: #9a3412;
        }

        .audioReadingAction.isResume {
          background: #ecfdf5;
          border-color: #6ee7b7;
          color: #065f46;
        }

        .audioReadingAction.isStop {
          background: #0f172a;
          border-color: #0f172a;
          color: white;
        }

        .audioReadingAction.isDelete {
          background: white;
          border-color: rgba(15, 23, 42, 0.18);
          color: #334155;
        }

        .audioReadingAction:not(:disabled):hover {
          filter: brightness(0.97);
        }

        .audioReadingDot {
          width: 12px;
          height: 12px;
          border-radius: 999px;
          background: #94a3b8;
          box-shadow: 0 0 0 4px rgba(148, 163, 184, 0.14);
          flex: 0 0 auto;
        }

        .audioReadingDot.isRecording {
          background: #e11d48;
          box-shadow: 0 0 0 4px rgba(225, 29, 72, 0.16);
          animation: audioReadingPulse 1.05s ease-in-out infinite;
        }

        .audioReadingMeter {
          width: 100%;
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #94a3b8, #cbd5e1, #94a3b8);
          opacity: 0.8;
        }

        .audioReadingMeter.isRecording {
          background: linear-gradient(90deg, #be123c 0%, #fb7185 45%, #be123c 90%);
          background-size: 180% 100%;
          animation: audioReadingMove 1.1s linear infinite;
        }

        @keyframes audioReadingPulse {
          0%,
          100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(0.72);
            opacity: 0.75;
          }
        }

        @keyframes audioReadingMove {
          from {
            background-position: 0% 0;
          }
          to {
            background-position: 180% 0;
          }
        }

        @media (max-width: 720px) {
          .audioReadingActions {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
      `}</style>
    </section>
  );
}
