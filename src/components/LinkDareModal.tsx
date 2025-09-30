import { FormEvent, useMemo, useState } from "react";
import LinkDareQR from "./LinkDareQR";
import { getCookie } from "../utils/cookies";

const nowPlusMinutes = (minutes: number) => {
  const date = new Date(Date.now() + minutes * 60000);
  date.setSeconds(0, 0);
  return date;
};

const toLocalInput = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const fromLocalInput = (value: string) => {
  return new Date(value);
};

type CreatedDare = {
  dareId: string;
  slug: string;
  inviteUrl: string;
  expiryTs: string;
};

const LinkDareModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [range, setRange] = useState(10);
  const [committed, setCommitted] = useState(1);
  const [expiry, setExpiry] = useState(toLocalInput(nowPlusMinutes(60)));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedDare | null>(null);
  const [copied, setCopied] = useState(false);

  const expiryBounds = useMemo(() => {
    const min = toLocalInput(nowPlusMinutes(5));
    const max = toLocalInput(nowPlusMinutes(7 * 24 * 60));
    return { min, max };
  }, []);

  if (!open) return null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setCopied(false);
    try {
      const csrf = getCookie("csrf-token");
      const response = await fetch("/api/dares", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          category: category.trim() || undefined,
          rangeN: range,
          expiryTs: fromLocalInput(expiry).toISOString(),
          visibility: "private",
          committedNumber: committed,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Failed to create dare");
      }
      const payload: CreatedDare = await response.json();
      setCreated(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create dare");
    } finally {
      setSubmitting(false);
    }
  };

  const resetAndClose = () => {
    setTitle("");
    setDescription("");
    setCategory("");
    setRange(10);
    setCommitted(1);
    setExpiry(toLocalInput(nowPlusMinutes(60)));
    setCreated(null);
    setError(null);
    setCopied(false);
    onClose();
  };

  const handleCopy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.inviteUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="link-dare__modal" role="dialog" aria-modal="true">
      <div className="link-dare__backdrop" />
      <div className="link-dare__panel">
        <button type="button" className="link-dare__close" onClick={resetAndClose}>
          Close
        </button>
        {!created ? (
          <form className="link-dare__form" onSubmit={handleSubmit}>
            <h2>Create a dare link</h2>
            <label>
              <span>Title</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={80} />
            </label>
            <label>
              <span>Description</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                maxLength={240}
              />
            </label>
            <label>
              <span>Category</span>
              <input value={category} onChange={(event) => setCategory(event.target.value)} maxLength={40} />
            </label>
            <label>
              <span>Range (2-1000)</span>
              <input
                type="number"
                min={2}
                max={1000}
                value={range}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (Number.isNaN(next)) return;
                  setRange(next);
                  if (committed > next) setCommitted(Math.max(1, next));
                }}
              />
            </label>
            <label>
              <span>Committed number</span>
              <input
                type="number"
                min={1}
                max={range}
                value={committed}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (!Number.isInteger(next)) return;
                  setCommitted(Math.min(Math.max(1, next), range));
                }}
              />
            </label>
            <label>
              <span>Expires by</span>
              <input
                type="datetime-local"
                value={expiry}
                min={expiryBounds.min}
                max={expiryBounds.max}
                onChange={(event) => setExpiry(event.target.value)}
              />
            </label>
            {error && <p className="link-dare__error">{error}</p>}
            <button type="submit" disabled={submitting} className="link-dare__submit">
              {submitting ? "Creating…" : "Create dare"}
            </button>
          </form>
        ) : (
          <div className="link-dare__result">
            <h2>Invite ready</h2>
            <p>Share this link with your dare partner. It expires at {new Date(created.expiryTs).toLocaleString()}.</p>
            <div className="link-dare__invite">
              <code>{created.inviteUrl}</code>
              <button type="button" onClick={handleCopy}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <LinkDareQR value={created.inviteUrl} />
            <div className="link-dare__proof">
              <span>Fairness</span>
              <strong>SHA-256 commit & reveal</strong>
            </div>
            <button type="button" className="link-dare__submit" onClick={resetAndClose}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default LinkDareModal;
