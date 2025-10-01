import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import crypto from "crypto";
import { openReadStream } from "../storage.js";

export const createWorkspace = async () => {
  const dir = await mkdtemp(join(tmpdir(), "proof-"));
  const unique = () => crypto.randomUUID();
  const pathFor = (name) => join(dir, name || unique());
  const pull = async (storageKey, fileName) => {
    const source = await openReadStream(storageKey);
    const target = pathFor(fileName || unique());
    const out = createWriteStream(target);
    await pipeline(source, out);
    return target;
  };
  const cleanup = async () => {
    await rm(dir, { recursive: true, force: true });
  };
  return { dir, pathFor, pull, cleanup };
};
