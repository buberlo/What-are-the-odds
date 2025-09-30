import express from "express";
import { FEATURE_LEADERBOARDS, LEADERBOARD_TOP_N, ADMIN_API_TOKEN } from "./config.js";
import { findSnapshot, snapshotPayload, listCategoriesForWindow } from "./leaderboard.js";
import { rebuildSnapshot } from "./leaderboardScheduler.js";

const truthy = (value) =>
  typeof value === "string" && ["1", "true", "on", "yes"].includes(value.toLowerCase());

const cache = new Map();

const cacheKey = (period, category, withProofs, limit) =>
  `${period}|${category ?? "*"}|${withProofs ? 1 : 0}|${limit}`;

const remember = (key, value) => {
  cache.set(key, { value, expiresAt: Date.now() + 5 * 60 * 1000 });
};

const recall = (key) => {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
};

const parseCategory = (input) => {
  if (input === undefined || input === null || input === "" || input === "*") return undefined;
  if (input === "_none" || input === "none" || input === "null") return "__none__";
  return String(input);
};

const applyLimit = (entries, limit) => entries.slice(0, limit);

export const registerLeaderboardRoutes = (app, { getIp, rateLimit, emit }) => {
  const router = express.Router();

  router.get("/api/leaderboard", (req, res) => {
    if (!FEATURE_LEADERBOARDS) return res.status(404).json({ error: "Not found" });
    const ip = getIp(req);
    if (!rateLimit(`${ip}:leaderboard`)) return res.status(429).json({ error: "Rate limited" });
    const period = req.query.period;
    if (!period || !["daily", "weekly", "alltime"].includes(period)) return res.status(400).json({ error: "Invalid period" });
    const category = parseCategory(req.query.category);
    const withProofs = truthy(req.query.withProofs);
    const limitRaw = Number.parseInt(req.query.limit ?? "", 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, LEADERBOARD_TOP_N) : LEADERBOARD_TOP_N;
    const key = cacheKey(period, category, withProofs, limit);
    const cached = recall(key);
    if (cached) {
      res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=300");
      return res.json({ ...cached, entries: applyLimit(cached.entries, limit) });
    }
    const row = findSnapshot({ period, category, withProofs });
    const payload = row ? snapshotPayload(row) : rebuildSnapshot({ period, category, withProofs, limit, emit });
    const categories = payload
      ? listCategoriesForWindow({ fromTs: payload.fromTs, toTs: payload.toTs })
      : [];
    const shaped = payload
      ? {
          ...payload,
          entries: applyLimit(Array.isArray(payload.entries) ? payload.entries : [], limit),
          categories,
        }
      : null;
    remember(
      key,
      payload
        ? { ...payload, categories }
        : {
            period,
            category: category ?? null,
            withProofs,
            entries: [],
            fromTs: null,
            toTs: null,
            generatedAt: null,
            version: 0,
            categories: [],
          }
    );
    res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=300");
    res.json(
      shaped || {
        period,
        category: category ?? null,
        withProofs,
        entries: [],
        fromTs: null,
        toTs: null,
        generatedAt: null,
        version: 0,
        categories: [],
      }
    );
  });

  router.post("/api/admin/leaderboard/rebuild", (req, res) => {
    if (!FEATURE_LEADERBOARDS) return res.status(404).json({ error: "Not found" });
    if (!ADMIN_API_TOKEN || req.headers["x-admin-token"] !== ADMIN_API_TOKEN) return res.status(403).json({ error: "Forbidden" });
    const { period = "daily", category: rawCategory, withProofs = false, fromTs, toTs, limit } = req.body || {};
    if (!["daily", "weekly", "alltime"].includes(period)) return res.status(400).json({ error: "Invalid period" });
    const category = parseCategory(rawCategory);
    const snapshot = rebuildSnapshot({ period, category, withProofs: Boolean(withProofs), fromTs, toTs, limit, emit });
    cache.clear();
    const decorated = snapshot
      ? {
          ...snapshot,
          categories: listCategoriesForWindow({ fromTs: snapshot.fromTs, toTs: snapshot.toTs }),
        }
      : snapshot;
    res.json(decorated);
  });

  app.use(router);
};
