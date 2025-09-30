import { useEffect, useMemo, useState } from "react";
import { getCookie } from "../utils/cookies";

type DareView = {
  dare: {
    id: string;
    title: string;
    description: string | null;
    category: string | null;
    rangeN: number;
    expiryTs: string;
    visibility: string | null;
    status: string;
    fairness: {
      algorithm: string;
      commitHashPrefix: string;
    };
  };
};

type DareResult = {
  committedNumber: number;
  revealedNumber: number;
  matched: boolean;
};

const formatCountdown = (expiry: string) => {
  const diff = Date.parse(expiry) - Date.now();
  if (diff <= 0) return "expired";
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m ${seconds}s`;
};

const LinkDareInvitePage = ({ slug, token }: { slug: string; token: string }) => {
  const [view, setView] = useState<DareView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [result, setResult] = useState<DareResult | null>(null);
  const [countdown, setCountdown] = useState("-");
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const dareId = view?.dare.id;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/i/${encodeURIComponent(slug)}?t=${encodeURIComponent(token)}`);
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || "Failed to load dare");
        }
        const payload: DareView = await response.json();
        if (cancelled) return;
        setView(payload);
        setStatus(payload.dare.status);
        setCountdown(formatCountdown(payload.dare.expiryTs));
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load dare");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [slug, token]);

  useEffect(() => {
    if (!view) return;
    const timer = window.setInterval(() => {
      setCountdown(formatCountdown(view.dare.expiryTs));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [view]);

  useEffect(() => {
    if (!dareId) return;
    const source = new EventSource(`/api/dares/${dareId}/stream`);
    source.addEventListener("dare.accepted", () => {
      setStatus("accepted");
      setAccepted(true);
    });
    source.addEventListener("dare.resolved", (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent<string>).data) as DareResult & { id: string };
        setResult({
          committedNumber: payload.committedNumber,
          revealedNumber: payload.revealedNumber,
          matched: payload.matched,
        });
        setStatus("resolved");
      } catch {}
    });
    source.addEventListener("dare.expired", () => {
      setStatus("expired");
    });
    source.addEventListener("heartbeat", () => {});
    return () => {
      source.close();
    };
  }, [dareId]);

  const acceptDare = async () => {
    if (!dareId || accepting) return;
    setAccepting(true);
    setError(null);
    try {
      const csrf = getCookie("csrf-token");
      const response = await fetch(`/api/dares/${dareId}/accept`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key":
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : Math.random().toString(36).slice(2),
          ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        },
        body: JSON.stringify({ inviteToken: token }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Failed to accept");
      }
      setAccepted(true);
      setStatus("accepted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept");
    } finally {
      setAccepting(false);
    }
  };

  const pills = useMemo(() => {
    if (!view) return [];
    return Array.from({ length: view.dare.rangeN }, (_, index) => index + 1);
  }, [view]);

  if (loading) {
    return (
      <main className="link-dare link-dare--loading">
        <p>Loading dare…</p>
      </main>
    );
  }

  if (error || !view) {
    return (
      <main className="link-dare link-dare--error">
        <h1>Invite unavailable</h1>
        <p>{error ?? "This invite could not be loaded."}</p>
      </main>
    );
  }

  const expired = status === "expired" || countdown === "expired";

  return (
    <main className="link-dare">
      <header className="link-dare__header">
        <h1>{view.dare.title}</h1>
        <div className="link-dare__meta">
          <span className="link-dare__badge">{view.dare.fairness.algorithm}</span>
          <span className="link-dare__hash">hash {view.dare.fairness.commitHashPrefix}…</span>
        </div>
      </header>
      <section className="link-dare__body">
        {view.dare.description && <p className="link-dare__description">{view.dare.description}</p>}
        <div className="link-dare__countdown">
          <span>Time remaining</span>
          <strong>{countdown}</strong>
        </div>
        <div className="link-dare__range">
          {pills.map((value) => (
            <span key={value} className="link-dare__pill">
              {value}
            </span>
          ))}
        </div>
        <div className="link-dare__cta">
          <button
            type="button"
            onClick={acceptDare}
            disabled={accepting || accepted || expired || status === "resolved"}
          >
            {accepted ? "Invite accepted" : accepting ? "Accepting…" : "Accept dare"}
          </button>
          {status === "resolved" && result && (
            <div className="link-dare__result-panel">
              <h2>Outcome</h2>
              <p>
                Host pick <strong>{result.committedNumber}</strong> vs your pick <strong>{result.revealedNumber}</strong>
              </p>
              <p>{result.matched ? "Numbers matched" : "No match"}</p>
              {result.matched && <div className="link-dare__banner">Proof required – stay tuned for Phase 2</div>}
            </div>
          )}
        </div>
        {status === "expired" && <p className="link-dare__expired">This dare has expired.</p>}
      </section>
    </main>
  );
};

export default LinkDareInvitePage;
