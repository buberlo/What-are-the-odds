import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { ProofRecord } from "../types";
import { getCookie } from "../utils/cookies";
import { FEATURE_PROOF_BLUR, FEATURE_PROOF_MODERATION } from "../flags";
import ProofBlurEditor, { Mask } from "./ProofBlurEditor";

type ProofSharePanelProps = {
  proof: ProofRecord;
  dareTitle: string;
  dareCategory?: string | null;
  onUpdate: (value: ProofRecord) => void;
};

const normalizeTag = (value: string) => {
  const trimmed = value.replace(/\s+/g, "");
  const cleaned = trimmed.replace(/[^\p{L}\p{N}_-]/gu, "");
  if (!cleaned) return null;
  return `#${cleaned}`;
};

const defaultTags = (category?: string | null) => {
  const tags = ["#WhatAreTheOdds", "#DareAccepted"];
  if (category) {
    const tag = normalizeTag(category);
    if (tag) tags.push(tag);
  }
  return tags;
};

const assetUrl = (proof: ProofRecord, keys: string[]) => {
  for (const key of keys) {
    const asset = proof.assets[key as keyof ProofRecord["assets"]];
    if (asset?.url) return asset.url;
  }
  return "";
};

const parseHashtags = (value: string) => {
  const next = value
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => (entry.startsWith("#") ? entry : `#${entry}`));
  const normalized = next
    .map((entry) => normalizeTag(entry.slice(1)) ?? normalizeTag(entry))
    .filter((entry): entry is string => Boolean(entry));
  return Array.from(new Set(normalized));
};

const moderationLabel = (state: string) => {
  switch (state) {
    case "approved":
      return "Approved";
    case "pending":
      return "Pending review";
    case "rejected":
      return "Rejected";
    default:
      return state;
  }
};

const ProofSharePanel = ({ proof, dareTitle, dareCategory, onUpdate }: ProofSharePanelProps) => {
  const [caption, setCaption] = useState(proof.caption ?? dareTitle);
  const [hashtags, setHashtags] = useState(() =>
    proof.hashtags?.length ? proof.hashtags.join(" ") : defaultTags(dareCategory).join(" "),
  );
  const [status, setStatus] = useState<"idle" | "saving" | "copied" | "shared" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [blurOpen, setBlurOpen] = useState(false);
  const [blurSaving, setBlurSaving] = useState(false);
  const [blurError, setBlurError] = useState<string | null>(null);

  useEffect(() => {
    setCaption(proof.caption ?? dareTitle);
    setHashtags(proof.hashtags?.length ? proof.hashtags.join(" ") : defaultTags(dareCategory).join(" "));
  }, [proof, dareTitle, dareCategory]);

  const thumbnail = useMemo(
    () => assetUrl(proof, ["poster_redacted", "thumb320", "thumb640", "poster", "jpeg_redacted", "jpeg"]),
    [proof],
  );
  const posterPreview = useMemo(
    () => assetUrl(proof, ["poster_redacted", "poster", "jpeg_redacted", "jpeg", "thumb640"]),
    [proof],
  );
  const posterSource = useMemo(
    () => assetUrl(proof, ["poster", "poster_redacted", "thumb640", "jpeg"]),
    [proof],
  );
  const videoSources = useMemo(() => {
    const mp4 = proof.assets.mp4?.url || "";
    const webm = proof.assets.webm?.url || "";
    return { mp4, webm };
  }, [proof]);

  const disabled = status === "saving";
  const moderationState = proof.moderation;
  const moderationPending = FEATURE_PROOF_MODERATION && moderationState === "pending";
  const moderationRejected = moderationState === "rejected";

  const sendVisibility = async (nextVisibility: "public" | "unlisted") => {
    if (nextVisibility === "public" && moderationState !== "approved") {
      setError("Proof must be approved before going public");
      setStatus("error");
      return;
    }
    try {
      setStatus("saving");
      setError(null);
      const csrf = getCookie("csrf-token");
      const response = await fetch(`/api/proofs/${encodeURIComponent(proof.id)}/publish`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        },
        credentials: "same-origin",
        body: JSON.stringify({
          visibility: nextVisibility,
          caption: caption.trim() || dareTitle,
          hashtags: parseHashtags(hashtags),
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Update failed");
      }
      const payload: ProofRecord = await response.json();
      onUpdate(payload);
      setStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
      setStatus("error");
    }
  };

  const copyCaption = async () => {
    try {
      const block = [caption.trim() || dareTitle, parseHashtags(hashtags).join(" ")].filter(Boolean).join("\n\n");
      await navigator.clipboard.writeText(block);
      setStatus("copied");
      window.setTimeout(() => setStatus("idle"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Copy failed");
      setStatus("error");
    }
  };

  const shareProof = async () => {
    const link = proof.publicUrl;
    const captionBlock = [caption.trim() || dareTitle, parseHashtags(hashtags).join(" ")]
      .filter(Boolean)
      .join("\n\n");
    if (navigator.share) {
      try {
        await navigator.share({
          title: dareTitle,
          url: link,
          text: captionBlock,
        });
        setStatus("shared");
        window.setTimeout(() => setStatus("idle"), 2000);
        return;
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${captionBlock}\n\n${link}`);
      setStatus("copied");
      window.setTimeout(() => setStatus("idle"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Share failed");
      setStatus("error");
    }
  };

  const onCaptionChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setCaption(event.target.value);
  };

  const onHashtagChange = (event: ChangeEvent<HTMLInputElement>) => {
    setHashtags(event.target.value);
  };

  const handleBlurApply = async (maskList: Mask[]) => {
    if (!maskList.length) {
      setBlurOpen(false);
      return;
    }
    try {
      setBlurSaving(true);
      setBlurError(null);
      const csrf = getCookie("csrf-token");
      const response = await fetch(`/api/proofs/${encodeURIComponent(proof.id)}/blur`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        },
        credentials: "same-origin",
        body: JSON.stringify({ masks: maskList }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Blur failed");
      }
      const payload: ProofRecord = await response.json();
      onUpdate(payload);
      setBlurOpen(false);
    } catch (err) {
      setBlurError(err instanceof Error ? err.message : "Blur failed");
    } finally {
      setBlurSaving(false);
    }
  };

  const canBlur = FEATURE_PROOF_BLUR && Boolean(posterSource);

  return (
    <section className="proof-share">
      <div className="proof-share__media">
        {proof.type === "video" && (videoSources.mp4 || videoSources.webm) ? (
          <video
            controls
            playsInline
            muted
            poster={posterPreview || thumbnail || undefined}
          >
            {videoSources.mp4 && <source src={videoSources.mp4} type="video/mp4" />}
            {videoSources.webm && <source src={videoSources.webm} type="video/webm" />}
          </video>
        ) : thumbnail ? (
          <img src={thumbnail} alt="Proof thumbnail" />
        ) : (
          <div className="proof-share__placeholder">No preview</div>
        )}
      </div>
      <div className="proof-share__content">
        <header className="proof-share__header">
          <h3>Proof ready</h3>
          <a href={proof.publicUrl} target="_blank" rel="noreferrer">
            View page
          </a>
        </header>
        <div className="proof-share__status">
          <span className={`proof-share__badge proof-share__badge--${moderationState}`}>
            {moderationLabel(moderationState)}
          </span>
          <span className="proof-share__visibility">Visibility: {proof.visibility}</span>
        </div>
        {moderationPending && (
          <p className="proof-share__hint">Public publishing is locked until moderation approves this proof.</p>
        )}
        {moderationRejected && (
          <p className="proof-share__warning">Proof rejected. Apply additional blur or upload a replacement.</p>
        )}
        <label className="proof-share__field">
          <span>Caption</span>
          <textarea value={caption} onChange={onCaptionChange} rows={3} disabled={disabled} />
        </label>
        <label className="proof-share__field">
          <span>Hashtags</span>
          <input value={hashtags} onChange={onHashtagChange} disabled={disabled} />
        </label>
        {error && <p className="proof-share__error">{error}</p>}
        <div className="proof-share__actions">
          <button type="button" onClick={copyCaption} disabled={disabled}>
            {status === "copied" ? "Copied" : "Copy caption"}
          </button>
          <button type="button" onClick={shareProof} disabled={disabled}>
            {status === "shared" ? "Shared" : "Share"}
          </button>
          <button type="button" onClick={() => sendVisibility("public")} disabled={disabled}>
            {proof.visibility === "public" ? "Refresh public" : "Publish proof"}
          </button>
          {proof.visibility === "public" && (
            <button type="button" onClick={() => sendVisibility("unlisted")} disabled={disabled}>
              Make unlisted
            </button>
          )}
          {canBlur && (
            <button type="button" onClick={() => setBlurOpen(true)} disabled={blurSaving}>
              Blur poster
            </button>
          )}
        </div>
        {blurError && <p className="proof-share__error">{blurError}</p>}
        {posterPreview && (
          <details className="proof-share__preview">
            <summary>Poster preview</summary>
            <img src={posterPreview} alt="Poster" />
          </details>
        )}
      </div>
      {canBlur && blurOpen && (
        <ProofBlurEditor
          open={blurOpen}
          imageUrl={posterSource}
          onClose={() => {
            if (!blurSaving) setBlurOpen(false);
          }}
          onApply={handleBlurApply}
          saving={blurSaving}
        />
      )}
    </section>
  );
};

export default ProofSharePanel;
