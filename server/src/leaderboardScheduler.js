import { computeLeaderboardEntries, findSnapshot, findSnapshotByWindow, saveSnapshot, snapshotPayload, listCategoriesForWindow } from "./leaderboard.js";
import { LEADERBOARD_VERSION, FEATURE_LEADERBOARDS } from "./config.js";
import db from "./db.js";

const asDate = (value) => (value instanceof Date ? value : new Date(value));

const windowForPeriod = (period, reference = new Date()) => {
  const now = new Date(reference);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  if (period === "daily") {
    const end = new Date(Date.UTC(year, month, day));
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    return { fromTs: start, toTs: end };
  }
  if (period === "weekly") {
    const currentDay = now.getUTCDay() || 7;
    const startOfWeek = new Date(Date.UTC(year, month, day - currentDay + 1));
    const start = new Date(startOfWeek.getTime() - 7 * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    return { fromTs: start, toTs: end };
  }
  if (period === "alltime") {
    return { fromTs: new Date(0), toTs: now };
  }
  throw new Error(`unsupported period ${period}`);
};

const ensureSnapshotForWindow = ({ period, category, withProofs, fromTs, toTs, limit, emit }) => {
  const existing = findSnapshotByWindow({ period, category, withProofs, fromTs, toTs });
  if (existing) return snapshotPayload(existing);
  const { entries } = computeLeaderboardEntries({ fromTs, toTs, category, withProofs, limit });
  const id = saveSnapshot({ period, category, withProofs, fromTs, toTs, entries });
  if (emit) emit("leaderboard.updated", { id, period, category: category ?? null, withProofs, fromTs, toTs, version: LEADERBOARD_VERSION });
  return snapshotPayload(findSnapshotByWindow({ period, category, withProofs, fromTs, toTs }));
};

const runSnapshotBatch = ({ period, reference, limit, emit }) => {
  const window = windowForPeriod(period, reference);
  const categories = [null, ...listCategoriesForWindow(window)];
  for (const category of categories) {
    for (const withProofs of [false, true]) {
      ensureSnapshotForWindow({ period, category, withProofs, fromTs: window.fromTs, toTs: window.toTs, limit, emit });
    }
  }
};

const hasResolvedAfterStmt = db.prepare(
  `SELECT 1
   FROM events e
   JOIN dares d ON d.id = e.dare_id
   LEFT JOIN acceptances a ON a.dare_id = d.id
   WHERE e.type = 'dare.resolved'
     AND a.accepter_id IS NOT NULL
     AND datetime(e.at) > datetime(?)
   LIMIT 1`
);

const delayUntil = (target) => {
  const now = Date.now();
  const wait = Math.max(target - now, 0);
  return new Promise((resolve) => setTimeout(resolve, wait));
};

const nextUtcTime = ({ minute, second, hourOffset = 0, intervalHours = 24 }) => {
  const now = new Date();
  const target = new Date(now.getTime());
  target.setUTCMinutes(minute, second, 0);
  if (hourOffset !== undefined) target.setUTCHours(hourOffset);
  if (target <= now) {
    target.setUTCHours(target.getUTCHours() + intervalHours);
  }
  return target.getTime();
};

const nextDaily = () => {
  const now = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 5, 0));
  if (target <= now) target.setUTCDate(target.getUTCDate() + 1);
  return target.getTime();
};

const nextWeekly = () => {
  const now = new Date();
  const day = now.getUTCDay();
  const distance = (8 - (day || 7)) % 7;
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + distance, 0, 10, 0));
  if (target <= now) target.setUTCDate(target.getUTCDate() + 7);
  return target.getTime();
};

const nextHourly = () => {
  const now = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), 20, 0));
  if (target <= now) target.setUTCHours(target.getUTCHours() + 1);
  return target.getTime();
};

export const scheduleLeaderboardJobs = ({ emit, limit } = {}) => {
  if (!FEATURE_LEADERBOARDS) return { stop: () => {} };
  let cancelled = false;
  const runLoop = async () => {
    while (!cancelled) {
      await delayUntil(nextDaily());
      if (cancelled) break;
      try {
        runSnapshotBatch({ period: "daily", reference: new Date(), limit, emit });
      } catch (err) {
        console.error("leaderboard daily job failed", err);
      }
    }
  };
  const runWeeklyLoop = async () => {
    while (!cancelled) {
      await delayUntil(nextWeekly());
      if (cancelled) break;
      try {
        runSnapshotBatch({ period: "weekly", reference: new Date(), limit, emit });
      } catch (err) {
        console.error("leaderboard weekly job failed", err);
      }
    }
  };
  const runAlltimeLoop = async () => {
    while (!cancelled) {
      await delayUntil(nextHourly());
      if (cancelled) break;
      try {
        const window = windowForPeriod("alltime", new Date());
        const existing = findSnapshot({ period: "alltime", category: null, withProofs: false });
        const since = existing ? existing.to_ts : null;
        const hasNewData = !since || hasResolvedAfterStmt.get(since);
        if (hasNewData) runSnapshotBatch({ period: "alltime", reference: new Date(), limit, emit });
      } catch (err) {
        console.error("leaderboard alltime job failed", err);
      }
    }
  };
  runLoop();
  runWeeklyLoop();
  runAlltimeLoop();
  return {
    stop: () => {
      cancelled = true;
    },
  };
};

export const rebuildSnapshot = ({ period, category, withProofs, fromTs, toTs, limit, emit }) => {
  const window = fromTs && toTs ? { fromTs: asDate(fromTs), toTs: asDate(toTs) } : windowForPeriod(period, new Date());
  return ensureSnapshotForWindow({
    period,
    category,
    withProofs,
    fromTs: window.fromTs,
    toTs: window.toTs,
    limit,
    emit,
  });
};

export const windowFor = windowForPeriod;
