import { useCallback, useEffect, useMemo, useState } from "react";
import { SharePayload } from "../types";

type ShareResource = "result" | "proof";

interface SharePageProps {
  resource: ShareResource;
  id: string;
  initialData?: SharePayload;
}

type ShareStatus = "idle" | "loading" | "loaded" | "error";

const buildEndpoint = (resource: ShareResource, id: string) =>
  resource === "result" ? `/api/share/result/${encodeURIComponent(id)}` : `/api/share/proof/${encodeURIComponent(id)}`;

const formatResolved = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
};

const SharePage = ({ resource, id, initialData }: SharePageProps) => {
  const [data, setData] = useState<SharePayload | null>(() => {
    if (initialData && initialData.type === resource) return initialData;
    return null;
  });
  const [status, setStatus] = useState<ShareStatus>(initialData ? "loaded" : "idle");
  const [error, setError] = useState<string | null>(null);
  const [shareFeedback, setShareFeedback] = useState<"idle" | "shared" | "copied">("idle");

  const captionBlock = useMemo(() => {
    if (!data) return "";
    const hashtags = data.hashtags?.join(" ") ?? "";
    return [data.caption, hashtags].filter(Boolean).join("\n\n");
  }, [data]);

  const fetchShareData = useCallback(async () => {
    if (status === "loading") return;
    try {
      setStatus("loading");
      setError(null);
      const endpoint = buildEndpoint(resource, id);
      const response = await fetch(endpoint, { credentials: "same-origin" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Not available");
      }
      const payload: SharePayload = await response.json();
      setData(payload);
      setStatus("loaded");
      document.title = payload.title;
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Unable to load share data");
    }
  }, [resource, id, status]);

  useEffect(() => {
    if (!data) {
      fetchShareData();
    } else {
      document.title = data.title;
    }
  }, [data, fetchShareData]);

  const shareAction = useCallback(async () => {
    if (!data) return;
    const url = data.url;
    const text = captionBlock ? `${captionBlock}\n\n${url}` : url;
    if (navigator.share) {
      try {
        await navigator.share({ title: data.title, text: captionBlock, url });
        setShareFeedback("shared");
        window.setTimeout(() => setShareFeedback("idle"), 2000);
        return;
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard?.writeText(text);
      setShareFeedback("copied");
      window.setTimeout(() => setShareFeedback("idle"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to share");
    }
  }, [data, captionBlock]);

  const copyCaption = useCallback(async () => {
    if (!data) return;
    try {
      await navigator.clipboard?.writeText(captionBlock);
      setShareFeedback("copied");
      window.setTimeout(() => setShareFeedback("idle"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to copy caption");
    }
  }, [data, captionBlock]);

  const copyLink = useCallback(async () => {
    if (!data) return;
    try {
      await navigator.clipboard?.writeText(data.url);
      setShareFeedback("copied");
      window.setTimeout(() => setShareFeedback("idle"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to copy link");
    }
  }, [data]);

  if (status === "error") {
    return (
      <div className="share-page">
        <div className="share-page__card">
          <h1 className="share-page__title">Share unavailable</h1>
          <p className="share-page__error">{error}</p>
          <a href="/" className="share-page__back">
            Return to home
          </a>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="share-page share-page--loading">
        <div className="share-page__spinner" aria-hidden="true" />
        <p>Preparing share card…</p>
      </div>
    );
  }

  return (
    <div className="share-page">
      <div className="share-page__card">
        <header className="share-page__header">
          <p className="share-page__eyebrow">{resource === "result" ? "Dare result" : "Proof highlight"}</p>
          <h1 className="share-page__title">{data.title}</h1>
          <p className="share-page__description">{data.description}</p>
        </header>

        <div className="share-page__media">
          <img src={data.image} alt="Share preview" />
        </div>

        <dl className="share-page__meta">
          <div>
            <dt>Resolved</dt>
            <dd>{formatResolved(data.resolvedAt)}</dd>
          </div>
          <div>
            <dt>Match odds</dt>
            <dd>1 in {data.range}</dd>
          </div>
          <div>
            <dt>Matchup</dt>
            <dd>
              {data.winner} vs {data.loser}
            </dd>
          </div>
        </dl>

        <section className="share-page__caption">
          <h2>Caption preset</h2>
          <p>{data.caption}</p>
          <p className="share-page__hashtags">{data.hashtags.join(" ")}</p>
        </section>

        <div className="share-page__actions">
          <button type="button" onClick={shareAction} className="share-page__button">
            {shareFeedback === "shared" ? "Shared" : shareFeedback === "copied" ? "Copied" : "Share this"}
          </button>
          <button type="button" onClick={copyCaption} className="share-page__button share-page__button--ghost">
            Copy caption
          </button>
          <button type="button" onClick={copyLink} className="share-page__button share-page__button--ghost">
            Copy link
          </button>
        </div>

        <footer className="share-page__footer">
          <a href={data.url} className="share-page__permalink">
            {data.url}
          </a>
          <a href="/" className="share-page__back">
            Explore the experience
          </a>
        </footer>
      </div>
    </div>
  );
};

export default SharePage;
