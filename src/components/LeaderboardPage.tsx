import { useCallback, useEffect, useMemo, useState } from "react";
import { LeaderboardEntry, LeaderboardResponse } from "../types";

const PERIOD_OPTIONS: { id: LeaderboardResponse["period"]; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "alltime", label: "All-time" },
];

const formatDuration = (ms: number | null) => {
  if (ms === null || ms < 0) return "–";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remaining}s`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return `${hours}h ${remMinutes}m`;
};

const categoryLabel = (value: string) => value;

const normalizeCategoryParam = (value: string) => {
  if (value === "_none") return "__none__";
  return value;
};

const encodeCategoryParam = (value: string) => {
  if (value === "__none__") return "_none";
  return value;
};

const LeaderboardPage = () => {
  const [period, setPeriod] = useState<LeaderboardResponse["period"]>("daily");
  const [category, setCategory] = useState<string>("*");
  const [withProofs, setWithProofs] = useState(false);
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ period, withProofs: withProofs ? "true" : "false" });
      if (category && category !== "*") params.set("category", encodeCategoryParam(category));
      const response = await fetch(`/api/leaderboard?${params.toString()}`, { credentials: "same-origin" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Failed to load leaderboard");
      }
      const payload: LeaderboardResponse = await response.json();
      setData(payload);
      document.title = `Leaderboard · ${payload.period.charAt(0).toUpperCase()}${payload.period.slice(1)}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leaderboard");
    } finally {
      setLoading(false);
    }
  }, [period, category, withProofs]);

  useEffect(() => {
    fetchData();
    const id = window.setInterval(fetchData, 30000);
    return () => window.clearInterval(id);
  }, [fetchData]);

  const numberFormatter = useMemo(() => new Intl.NumberFormat(undefined), []);

  const categories = useMemo(() => {
    const values = new Set<string>(["*"]);
    if (data?.categories) {
      for (const entry of data.categories) values.add(normalizeCategoryParam(entry));
    }
    return Array.from(values);
  }, [data]);

  const entries: LeaderboardEntry[] = data?.entries ?? [];
  const generatedAt = data?.generatedAt ? new Date(data.generatedAt) : null;
  const categoryLabelMap = new Map<string, string>();
  for (const entry of categories) {
    if (entry === "*") {
      categoryLabelMap.set(entry, "All categories");
    } else if (entry === "__none__") {
      categoryLabelMap.set(entry, "Uncategorized");
    } else {
      categoryLabelMap.set(entry, categoryLabel(entry));
    }
  }

  return (
    <div className="leaderboard-page">
      <header className="leaderboard-page__header">
        <div>
          <p className="leaderboard-page__eyebrow">Global standings</p>
          <h1 className="leaderboard-page__title">What are the odds · Leaderboard</h1>
          <p className="leaderboard-page__subtitle">
            Track the bravest players across daily, weekly, and all-time windows.
          </p>
        </div>
        <div className="leaderboard-page__controls">
          <nav className="leaderboard-page__tabs" aria-label="Leaderboard period">
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={option.id === period ? "leaderboard-page__tab leaderboard-page__tab--active" : "leaderboard-page__tab"}
                onClick={() => setPeriod(option.id)}
              >
                {option.label}
              </button>
            ))}
          </nav>
          <div className="leaderboard-page__filters">
            <label className="leaderboard-page__select">
              <span>Category</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                {categories.map((value) => (
                  <option key={value} value={value}>
                    {categoryLabelMap.get(value) ?? value}
                  </option>
                ))}
              </select>
            </label>
            <label className="leaderboard-page__toggle">
              <input type="checkbox" checked={withProofs} onChange={(event) => setWithProofs(event.target.checked)} />
              <span>With proofs only</span>
            </label>
          </div>
        </div>
      </header>

      {error && <p className="leaderboard-page__error">{error}</p>}

      <section className="leaderboard-page__table-container" aria-live="polite">
        {loading && !entries.length ? (
          <div className="leaderboard-page__loading">Loading…</div>
        ) : entries.length ? (
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Player</th>
                <th scope="col">Played</th>
                <th scope="col">Wins</th>
                <th scope="col">Triggered</th>
                <th scope="col">Best streak</th>
                <th scope="col">Median completion</th>
                {withProofs && <th scope="col">Proof</th>}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, index) => {
                const rank = index + 1;
                const name = entry.handle || entry.userId.slice(0, 8);
                return (
                  <tr key={entry.userId}>
                    <td data-label="Rank">#{rank}</td>
                    <td data-label="Player">
                      <div className="leaderboard-table__player">
                        <span className="leaderboard-table__avatar">{name.charAt(0).toUpperCase()}</span>
                        <div>
                          <p className="leaderboard-table__name">{name}</p>
                          <p className="leaderboard-table__meta">
                            {numberFormatter.format(entry.wins)} wins · {numberFormatter.format(entry.triggered)}
                            {" "}
                            triggers
                          </p>
                        </div>
                      </div>
                    </td>
                    <td data-label="Played">{numberFormatter.format(entry.played)}</td>
                    <td data-label="Wins">{numberFormatter.format(entry.wins)}</td>
                    <td data-label="Triggered">{numberFormatter.format(entry.triggered)}</td>
                    <td data-label="Best streak">{numberFormatter.format(entry.streak)}</td>
                    <td data-label="Median completion">{formatDuration(entry.median_completion_ms)}</td>
                    {withProofs && (
                      <td data-label="Proof" className="leaderboard-table__proof-cell">
                        {entry.latest_proof_thumb ? (
                          <a
                            href={entry.latest_proof_url || entry.latest_proof_thumb}
                            target="_blank"
                            rel="noreferrer"
                            className="leaderboard-table__proof-thumb"
                          >
                            <img src={entry.latest_proof_thumb} alt="Latest proof thumbnail" />
                          </a>
                        ) : (
                          <span className="leaderboard-table__proof-none">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="leaderboard-page__empty">No entries yet. Check back soon.</div>
        )}
      </section>

      <footer className="leaderboard-page__footer">
        <span>
          {generatedAt
            ? `Snapshot generated ${generatedAt.toLocaleString()}`
            : "Awaiting first snapshot"}
        </span>
        <a href="/" className="leaderboard-page__link-home">
          Return to experience
        </a>
      </footer>
    </div>
  );
};

export default LeaderboardPage;
