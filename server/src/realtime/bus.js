import { EventEmitter } from "events";
import Redis from "ioredis";
import { REDIS_URL } from "../config.js";

const emitter = new EventEmitter();
let publisher = null;
let subscriber = null;
const useRedis = Boolean(REDIS_URL);
const channelPrefix = "events";

const localEmit = (type, payload) => {
  process.nextTick(() => emitter.emit(type, payload));
};

if (useRedis) {
  publisher = new Redis(REDIS_URL, { lazyConnect: true });
  subscriber = new Redis(REDIS_URL, { lazyConnect: true });
  publisher.connect().catch((err) => console.error("redis publish connect error", err));
  subscriber.connect().then(() => subscriber.psubscribe(`${channelPrefix}:*`)).catch((err) => console.error("redis subscribe connect error", err));
  if (subscriber) {
    subscriber.on("pmessage", (pattern, channel, message) => {
      if (!channel.startsWith(`${channelPrefix}:`)) return;
      const type = channel.slice(channelPrefix.length + 1);
      try {
        const parsed = JSON.parse(message);
        localEmit(type, parsed);
      } catch (err) {
        console.error("redis message parse error", err);
      }
    });
  }
}

export const publishBus = async (type, payload) => {
  const data = payload ?? {};
  if (useRedis && publisher) {
    try {
      await publisher.publish(`${channelPrefix}:${type}`, JSON.stringify(data));
    } catch (err) {
      console.error("redis publish error", err);
    }
  }
  localEmit(type, data);
};

export const subscribeBus = (type, handler) => {
  emitter.on(type, handler);
  return () => emitter.off(type, handler);
};
