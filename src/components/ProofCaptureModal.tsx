import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getCookie } from "../utils/cookies";
import { sha256Hex } from "../utils/hash";

type UploadPhase =
  | "idle"
  | "ready"
  | "hashing"
  | "presigning"
  | "uploading"
  | "finalizing"
  | "waiting"
  | "error";

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

const ProofCaptureModal = ({ open, dareId, dareTitle, onClose, onFinalize }: ProofCaptureModalProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<UploadPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [limit, setLimit] = useState<number | null>(10 * 1024 * 1024);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setPreviewUrl(null);
      setStatus("idle");
      setError(null);
      setProgress(0);
      setLimit(null);
    }
  }, [open]);

  useEffect(() => {
    if (!previewUrl) return;
    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const disabled = useMemo(() =>
    ["hashing", "presigning", "uploading", "finalizing", "waiting"].includes(status),
  [status]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] ?? null;
    if (!next) return;
    setFile(next);
    setPreviewUrl(URL.createObjectURL(next));
    setStatus("ready");
    setError(null);
    setProgress(0);
  };

  const retry = () => {
    setFile(null);
    setPreviewUrl(null);
    setStatus("idle");
    setError(null);
    setProgress(0);
  };

  const upload = useCallback(async () => {
    if (!file) return;
    try {
      setStatus("hashing");
      setError(null);
      setProgress(0);
      const buffer = await file.arrayBuffer();
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
          type: "photo",
          mime: file.type || "image/jpeg",
          sizeBytes: file.size,
          sha256: sha,
        }),
      });
      if (!presignResponse.ok) {
        const payload = await presignResponse.json().catch(() => ({}));
        throw new Error(payload.error || "Presign failed");
      }
      const presign: PresignPayload = await presignResponse.json();
      setLimit(presign.maxBytes);
      if (file.size > presign.maxBytes) {
        throw new Error(`File exceeds ${formatBytes(presign.maxBytes)}`);
      }
      setStatus("uploading");
      await uploadWithProgress(
        presign.url,
        presign.method || "PUT",
        presign.headers,
        file,
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
          type: "photo",
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
  }, [file, dareId, onFinalize]);

  if (!open) return null;

  const ready = status === "ready" || status === "error";
  const waiting = status === "waiting";

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
        <div className="proof-modal__body">
          {!file && (
            <label className="proof-modal__dropzone">
              <input
                type="file"
                accept="image/*"
                capture="user"
                onChange={handleFileChange}
                disabled={disabled}
              />
              <span>Tap to add a photo</span>
              {limit && <span className="proof-modal__hint">Max {formatBytes(limit)}</span>}
            </label>
          )}
          {file && previewUrl && (
            <div className="proof-modal__preview">
              <img src={previewUrl} alt="Proof preview" />
              <div className="proof-modal__preview-meta">
                <span>{file.name}</span>
                <span>{formatBytes(file.size)}</span>
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
          {status === "hashing" && <p className="proof-modal__status">Hashing photo…</p>}
          {status === "presigning" && <p className="proof-modal__status">Preparing upload…</p>}
          {status === "finalizing" && <p className="proof-modal__status">Finalizing…</p>}
          {waiting && <p className="proof-modal__status">Processing image…</p>}
        </div>
        <footer className="proof-modal__actions">
          {ready && (
            <button type="button" onClick={retry} disabled={disabled} className="proof-modal__action">
              Choose another
            </button>
          )}
          {file && (
            <button
              type="button"
              onClick={upload}
              disabled={disabled || status === "waiting"}
              className="proof-modal__primary"
            >
              {waiting ? "Waiting" : "Upload"}
            </button>
          )}
          {!file && (
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
