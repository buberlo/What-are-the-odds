import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCookie } from "../utils/cookies";
import { sha256Hex } from "../utils/hash";
import { FEATURE_VIDEO_PROOFS } from "../flags";

type UploadPhase =
  | "idle"
  | "ready"
  | "hashing"
  | "presigning"
  | "uploading"
  | "finalizing"
  | "waiting"
  | "error";

type Mode = "photo" | "video";

type RecordingState = "idle" | "recording" | "processing";

type ProofCaptureModalProps = {
  open: boolean;
  dareId: string;
  dareTitle: string;
  onClose: () => void;
  onFinalize: (value: { proofId: string; slug: string }) => void;
};

type PresignPayload = {
  key: string;
  url: string;
  headers?: Record<string, string>;
  maxBytes: number;
  method?: string;
};

const MAX_VIDEO_MS = 10000;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

const formatBytes = (value: number) => {
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[index - 1] ?? "KB"}`;
};

const formatSeconds = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  const tenths = Math.floor((ms % 1000) / 100);
  return `${seconds}.${tenths}s`;
};

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : typeof error === "string" ? error : "Upload failed";

const uploadWithProgress = async (
  url: string,
  method: string,
  headers: Record<string, string> | undefined,
  body: Blob,
  onProgress: (value: number) => void,
) =>
  new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        if (value !== undefined) xhr.setRequestHeader(key, value);
      }
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const ratio = event.total ? event.loaded / event.total : 0;
        onProgress(Math.min(Math.max(ratio, 0), 1));
      }
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve();
      } else {
        reject(new Error("Upload rejected"));
      }
    };
    xhr.send(body);
  });

const hasMediaRecorderSupport = () =>
  typeof window !== "undefined" &&
  typeof navigator !== "undefined" &&
  "mediaDevices" in navigator &&
  typeof (window as unknown as { MediaRecorder?: unknown }).MediaRecorder !== "undefined";

const pickRecorderMimeType = () => {
  if (!hasMediaRecorderSupport()) return undefined;
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  for (const type of candidates) {
    if ((window as unknown as { MediaRecorder: typeof MediaRecorder }).MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return undefined;
};

const readVideoDuration = (file: File) =>
  new Promise<number>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration * 1000);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to read video metadata"));
    };
    video.src = url;
  });

const ProofCaptureModal = ({ open, dareId, dareTitle, onClose, onFinalize }: ProofCaptureModalProps) => {
  const supportsVideo = FEATURE_VIDEO_PROOFS;
  const supportsRecorder = useMemo(() => hasMediaRecorderSupport(), []);
  const [mode, setMode] = useState<Mode>("photo");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<UploadPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [limit, setLimit] = useState<number | null>(null);
  const [videoDurationMs, setVideoDurationMs] = useState<number | null>(null);
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const stopTimerRef = useRef<number | null>(null);
  const cancelRecordingRef = useRef(false);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);

  const disabled = useMemo(
    () =>
      ["hashing", "presigning", "uploading", "finalizing", "waiting"].includes(status) ||
      recordingState === "recording",
    [status, recordingState],
  );

  const resetMediaState = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (stopTimerRef.current) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = null;
    }
    recorderRef.current = null;
    cancelRecordingRef.current = false;
    chunksRef.current = [];
    setRecordingState("idle");
    setElapsedMs(0);
  }, []);

  const stopRecording = useCallback(
    (cancel = false) => {
      if (recordingState === "idle") return;
      cancelRecordingRef.current = cancel;
      if (stopTimerRef.current) {
        window.clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      } else {
        resetMediaState();
      }
      setRecordingState("processing");
    },
    [recordingState, resetMediaState],
  );

  const pickVideoMime = useMemo(() => pickRecorderMimeType(), [supportsRecorder]);

  const startRecording = useCallback(async () => {
    if (!supportsRecorder) return;
    try {
      setError(null);
      if (selectedFile) setSelectedFile(null);
      setVideoDurationMs(null);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: true });
      streamRef.current = stream;
      const RecorderClass = (window as unknown as { MediaRecorder: typeof MediaRecorder }).MediaRecorder;
      const recorder = pickVideoMime ? new RecorderClass(stream, { mimeType: pickVideoMime }) : new RecorderClass(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        if (cancelRecordingRef.current) {
          chunksRef.current = [];
          resetMediaState();
          return;
        }
        const type = recorder.mimeType || pickVideoMime || "video/webm";
        const extension = type.includes("mp4") ? "mp4" : "webm";
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        const file = new File([blob], `proof-${Date.now()}.${extension}`, { type });
        if (file.size > MAX_VIDEO_BYTES) {
          setError(`Video exceeds ${formatBytes(MAX_VIDEO_BYTES)}`);
          resetMediaState();
          return;
        }
        try {
          const duration = await readVideoDuration(file);
          if (!Number.isFinite(duration)) {
            setError("Unable to read video metadata");
            resetMediaState();
            return;
          }
          const durationMs = Math.round(duration);
          if (durationMs > MAX_VIDEO_MS + 100) {
            setError("Video must be 10 seconds or less");
            resetMediaState();
            return;
          }
          setVideoDurationMs(durationMs);
          setSelectedFile(file);
          setStatus("ready");
        } catch (err) {
          setError(errorMessage(err));
        }
        resetMediaState();
      };
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
        liveVideoRef.current.play().catch(() => {});
      }
      recorder.start();
      setRecordingState("recording");
      setElapsedMs(0);
      timerRef.current = window.setInterval(() => {
        setElapsedMs((value) => {
          const next = value + 100;
          if (next >= MAX_VIDEO_MS) {
            stopRecording();
          }
          return next;
        });
      }, 100);
      stopTimerRef.current = window.setTimeout(() => {
        stopRecording();
      }, MAX_VIDEO_MS);
    } catch (err) {
      resetMediaState();
      setError(errorMessage(err));
    }
  }, [supportsRecorder, selectedFile, pickVideoMime, stopRecording, resetMediaState]);

  const resetState = useCallback(() => {
    setSelectedFile(null);
    setStatus("idle");
    setError(null);
    setProgress(0);
    setLimit(null);
    setVideoDurationMs(null);
    setPreviewUrl(null);
  }, []);

  const retry = useCallback(() => {
    stopRecording(true);
    resetState();
  }, [resetState, stopRecording]);

  const validateVideoFile = useCallback(
    async (file: File) => {
      if (file.size > MAX_VIDEO_BYTES) {
        setError(`Video exceeds ${formatBytes(MAX_VIDEO_BYTES)}`);
        return false;
      }
      try {
        const duration = await readVideoDuration(file);
        if (!Number.isFinite(duration)) {
          setError("Unable to read video metadata");
          return false;
        }
        const durationMs = Math.round(duration);
        if (durationMs > MAX_VIDEO_MS + 100) {
          setError("Video must be 10 seconds or less");
          return false;
        }
        setVideoDurationMs(durationMs);
        return true;
      } catch (err) {
        setError(errorMessage(err));
        return false;
      }
    },
    [],
  );

  const handlePhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] ?? null;
    if (!next) return;
    setSelectedFile(next);
    setStatus("ready");
    setError(null);
    setProgress(0);
    setVideoDurationMs(null);
  };

  const handleVideoFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] ?? null;
    if (!next) return;
    const valid = await validateVideoFile(next);
    if (!valid) return;
    setSelectedFile(next);
    setStatus("ready");
    setError(null);
    setProgress(0);
  };

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [selectedFile]);

  useEffect(() => {
    if (!open) {
      stopRecording(true);
      resetState();
      return;
    }
    setMode((current) => (supportsVideo ? current : "photo"));
  }, [open, resetState, stopRecording, supportsVideo]);

  useEffect(() => {
    stopRecording(true);
    resetState();
  }, [mode, resetState, stopRecording]);

  const upload = useCallback(async () => {
    if (!selectedFile) return;
    const fileType = selectedFile.type || (mode === "video" ? "video/webm" : "image/jpeg");
    if (mode === "video") {
      const valid = await validateVideoFile(selectedFile);
      if (!valid) {
        setStatus("error");
        return;
      }
    }
    try {
      setStatus("hashing");
      setError(null);
      setProgress(0);
      const buffer = await selectedFile.arrayBuffer();
      const sha = await sha256Hex(buffer);
      setStatus("presigning");
      const csrf = getCookie("csrf-token");
      const presignResponse = await fetch("/api/proofs/presign", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        },
        credentials: "same-origin",
        body: JSON.stringify({
          dareId,
          type: mode,
          mime: fileType,
          sizeBytes: selectedFile.size,
          sha256: sha,
        }),
      });
      if (!presignResponse.ok) {
        const payload = await presignResponse.json().catch(() => ({}));
        throw new Error(payload.error || "Presign failed");
      }
      const presign: PresignPayload = await presignResponse.json();
      setLimit(presign.maxBytes);
      if (selectedFile.size > presign.maxBytes) {
        throw new Error(`File exceeds ${formatBytes(presign.maxBytes)}`);
      }
      setStatus("uploading");
      await uploadWithProgress(
        presign.url,
        presign.method || "PUT",
        presign.headers,
        selectedFile,
        (value) => setProgress(value),
      );
      setStatus("finalizing");
      const finalizeResponse = await fetch(`/api/dares/${encodeURIComponent(dareId)}/proofs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        },
        credentials: "same-origin",
        body: JSON.stringify({
          key: presign.key,
          sha256: sha,
          type: mode,
        }),
      });
      if (!finalizeResponse.ok) {
        const payload = await finalizeResponse.json().catch(() => ({}));
        throw new Error(payload.error || "Finalize failed");
      }
      const payload = await finalizeResponse.json();
      setStatus("waiting");
      onFinalize(payload);
    } catch (err) {
      setStatus("error");
      setError(errorMessage(err));
    }
  }, [selectedFile, mode, dareId, validateVideoFile, onFinalize]);

  if (!open) return null;

  const ready = status === "ready" || status === "error";
  const waiting = status === "waiting";
  const isVideoMode = mode === "video";

  return (
    <div className="proof-modal" role="dialog" aria-modal="true">
      <div className="proof-modal__backdrop" />
      <div className="proof-modal__panel">
        <header className="proof-modal__header">
          <h2>Upload proof</h2>
          <button type="button" onClick={onClose} disabled={!waiting && status !== "idle"}>
            Close
          </button>
        </header>
        <p className="proof-modal__subtitle">{dareTitle}</p>
        {supportsVideo && (
          <div className="proof-modal__mode">
            <button
              type="button"
              className={mode === "photo" ? "is-active" : ""}
              onClick={() => setMode("photo")}
              disabled={disabled || mode === "photo"}
            >
              Photo
            </button>
            <button
              type="button"
              className={mode === "video" ? "is-active" : ""}
              onClick={() => setMode("video")}
              disabled={disabled || mode === "video"}
            >
              Video
            </button>
          </div>
        )}
        <div className="proof-modal__body">
          {isVideoMode ? (
            <div className="proof-modal__video">
              {supportsRecorder && (
                <div className="proof-modal__recorder">
                  <video ref={liveVideoRef} autoPlay muted playsInline />
                  {recordingState === "idle" ? (
                    <button type="button" onClick={startRecording} disabled={disabled}>
                      Start recording
                    </button>
                  ) : (
                    <button type="button" onClick={() => stopRecording()}>
                      Stop ({formatSeconds(Math.min(elapsedMs, MAX_VIDEO_MS))})
                    </button>
                  )}
                  <p>Up to 10 seconds with audio. Camera preview stays private.</p>
                </div>
              )}
              <label className="proof-modal__dropzone proof-modal__dropzone--video">
                <input
                  type="file"
                  accept="video/*"
                  onChange={handleVideoFileChange}
                  disabled={disabled || recordingState === "recording"}
                />
                <span>Select a video</span>
                <span className="proof-modal__hint">10s max · {formatBytes(MAX_VIDEO_BYTES)}</span>
              </label>
            </div>
          ) : (
            !selectedFile && (
              <label className="proof-modal__dropzone">
                <input
                  type="file"
                  accept="image/*"
                  capture="user"
                  onChange={handlePhotoChange}
                  disabled={disabled}
                />
                <span>Tap to add a photo</span>
                {limit && <span className="proof-modal__hint">Max {formatBytes(limit)}</span>}
              </label>
            )
          )}
          {selectedFile && previewUrl && (
            <div className={`proof-modal__preview${isVideoMode ? " proof-modal__preview--video" : ""}`}>
              {isVideoMode ? (
                <video src={previewUrl} controls playsInline muted />
              ) : (
                <img src={previewUrl} alt="Proof preview" />
              )}
              <div className="proof-modal__preview-meta">
                <span>{selectedFile.name}</span>
                <span>{formatBytes(selectedFile.size)}</span>
                {isVideoMode && videoDurationMs !== null && <span>{formatSeconds(videoDurationMs)}</span>}
              </div>
            </div>
          )}
          {error && <p className="proof-modal__error">{error}</p>}
          {status === "uploading" && (
            <div className="proof-modal__progress">
              <div className="proof-modal__progress-bar" style={{ width: `${progress * 100}%` }} />
              <span>{Math.round(progress * 100)}%</span>
            </div>
          )}
          {status === "hashing" && <p className="proof-modal__status">Hashing media…</p>}
          {status === "presigning" && <p className="proof-modal__status">Preparing upload…</p>}
          {status === "finalizing" && <p className="proof-modal__status">Finalizing…</p>}
          {waiting && <p className="proof-modal__status">Processing proof…</p>}
        </div>
        <footer className="proof-modal__actions">
          {ready && (
            <button type="button" onClick={retry} disabled={disabled} className="proof-modal__action">
              Choose another
            </button>
          )}
          {selectedFile && (
            <button
              type="button"
              onClick={upload}
              disabled={disabled || status === "waiting"}
              className="proof-modal__primary"
            >
              {waiting ? "Waiting" : "Upload"}
            </button>
          )}
          {!selectedFile && (
            <button type="button" onClick={onClose} disabled={disabled} className="proof-modal__action">
              Later
            </button>
          )}
        </footer>
      </div>
    </div>
  );
};

export default ProofCaptureModal;
