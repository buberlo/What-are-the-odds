import Redis from "ioredis";
import { REDIS_URL } from "../config.js";

const script = `
local key = KEYS[1]
local rate = tonumber(ARGV[1])
local burst = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])
if rate <= 0 or burst <= 0 then
  return 0
end
local bucket = redis.call('HMGET', key, 'tokens', 'timestamp')
local tokens = tonumber(bucket[1])
local timestamp = tonumber(bucket[2])
if not tokens then
  tokens = burst
  timestamp = now
end
local delta = now - timestamp
if delta > 0 then
  local refill = (rate / 60000) * delta
  tokens = math.min(burst, tokens + refill)
  timestamp = now
end
if tokens < cost then
  redis.call('HMSET', key, 'tokens', tokens, 'timestamp', timestamp)
  redis.call('PEXPIRE', key, math.ceil(60000 * burst / rate))
  return 0
end
tokens = tokens - cost
redis.call('HMSET', key, 'tokens', tokens, 'timestamp', timestamp)
redis.call('PEXPIRE', key, math.ceil(60000 * burst / rate))
return 1
`;

const useRedis = Boolean(REDIS_URL);
let redis = null;
let sha = null;
const localBuckets = new Map();

const ensureRedis = () => {
  if (!useRedis) return null;
  if (!redis) {
    redis = new Redis(REDIS_URL, { lazyConnect: true });
    redis.connect().catch((err) => console.error("redis rate connect error", err));
  }
  return redis;
};

const evalScript = async (key, rate, burst, cost) => {
  const client = ensureRedis();
  if (!client) return false;
  const now = Date.now();
  try {
    if (!sha) {
      sha = await client.script("load", script);
    }
    const result = await client.evalsha(sha, 1, key, String(rate), String(burst), String(now), String(cost));
    return result === 1;
  } catch (err) {
    if (err?.message?.includes("NOSCRIPT")) {
      sha = null;
      return evalScript(key, rate, burst, cost);
    }
    console.error("redis rate error", err);
    return true;
  }
};

const localConsume = (key, rate, burst, cost) => {
  const now = Date.now();
  const bucket = localBuckets.get(key) || { tokens: burst, timestamp: now };
  const delta = now - bucket.timestamp;
  if (delta > 0) {
    const refill = (rate / 60000) * delta;
    bucket.tokens = Math.min(burst, bucket.tokens + refill);
    bucket.timestamp = now;
  }
  if (bucket.tokens < cost) {
    localBuckets.set(key, bucket);
    return false;
  }
  bucket.tokens -= cost;
  localBuckets.set(key, bucket);
  return true;
};

export const consumeRate = async (key, rate, burst, cost = 1) => {
  if (!rate || !burst) return false;
  if (useRedis) return evalScript(key, rate, burst, cost);
  return localConsume(key, rate, burst, cost);
};
