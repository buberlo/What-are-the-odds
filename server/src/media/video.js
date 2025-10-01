import { spawn } from "child_process";
import { promises as fs } from "fs";
import sharp from "sharp";
import {
  FFMPEG_PATH,
  FFPROBE_PATH,
  PROOF_MAX_DURATION_MS,
  PROOF_WATERMARK,
} from "../config.js";
import { buildWatermarkBuffer } from "./watermark.js";

const run = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout?.on("data", (chunk) => stdout.push(chunk));
    child.stderr?.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout: Buffer.concat(stdout).toString("utf8") });
      } else {
        const error = new Error(`Command failed: ${command} ${args.join(" ")}`);
        error.stderr = Buffer.concat(stderr).toString("utf8");
        reject(error);
      }
    });
  });

export const probeVideo = async (inputPath) => {
  const { stdout } = await run(FFPROBE_PATH, [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_streams",
    "-show_format",
    inputPath,
  ]);
  const parsed = JSON.parse(stdout || "{}");
  const videoStream = (parsed.streams || []).find((stream) => stream.codec_type === "video");
  if (!videoStream) throw new Error("No video stream");
  const durationSeconds = Number(parsed.format?.duration ?? videoStream.duration ?? 0);
  const durationMs = Number.isFinite(durationSeconds) ? Math.round(durationSeconds * 1000) : null;
  if (durationMs && durationMs > PROOF_MAX_DURATION_MS) {
    const err = new Error("Video too long");
    err.code = "VIDEO_TOO_LONG";
    throw err;
  }
  const width = Number(videoStream.width) || null;
  const height = Number(videoStream.height) || null;
  const rotationTag = Number(videoStream.tags?.rotate) || Number(videoStream.side_data_list?.[0]?.rotation) || 0;
  return { durationMs, width, height, rotation: rotationTag };
};

const createOverlay = async (workspace, slug, createdAt) => {
  if (!PROOF_WATERMARK) return null;
  const overlaySvg = buildWatermarkBuffer(1920, 1080, slug, createdAt);
  const overlayPath = workspace.pathFor("watermark.png");
  await sharp(overlaySvg).png().toFile(overlayPath);
  return overlayPath;
};

const scaleFilter = "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2";

const encodeMp4 = async (inputPath, outputPath, overlayPath) => {
  const args = ["-y", "-i", inputPath];
  if (overlayPath) {
    args.push("-i", overlayPath);
    args.push(
      "-filter_complex",
      `[0:v]${scaleFilter}[v0];[1:v][v0]scale2ref=w=iw:h=ih[wm][v1];[v1][wm]overlay=W-w-48:H-h-48`,
    );
  } else {
    args.push("-vf", scaleFilter);
  }
  args.push(
    "-c:v",
    "libx264",
    "-profile:v",
    "main",
    "-preset",
    "medium",
    "-crf",
    "22",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ac",
    "2",
    "-af",
    "loudnorm=I=-16:LRA=11:TP=-1.5",
    outputPath,
  );
  await run(FFMPEG_PATH, args);
};

const encodeWebm = async (inputPath, outputPath, overlayPath) => {
  const args = ["-y", "-i", inputPath];
  if (overlayPath) {
    args.push("-i", overlayPath);
    args.push(
      "-filter_complex",
      `[0:v]${scaleFilter}[v0];[1:v][v0]scale2ref=w=iw:h=ih[wm][v1];[v1][wm]overlay=W-w-48:H-h-48`,
    );
  } else {
    args.push("-vf", scaleFilter);
  }
  args.push(
    "-c:v",
    "libvpx-vp9",
    "-b:v",
    "0",
    "-crf",
    "32",
    "-pix_fmt",
    "yuv420p",
    "-row-mt",
    "1",
    "-deadline",
    "good",
    "-cpu-used",
    "4",
    "-c:a",
    "libopus",
    "-b:a",
    "96k",
    "-ac",
    "2",
    outputPath,
  );
  await run(FFMPEG_PATH, args);
};

const captureFrame = async (inputPath, timeSeconds, outputPath, overlayPath) => {
  const seekArgs = timeSeconds > 0 ? ["-ss", timeSeconds.toString()] : [];
  const args = ["-y", ...seekArgs, "-i", inputPath, "-frames:v", "1"];
  if (overlayPath) {
    args.push(
      "-filter_complex",
      `[0:v]${scaleFilter}[v0];[1:v][v0]scale2ref=w=iw:h=ih[wm][v1];[v1][wm]overlay=W-w-48:H-h-48`,
    );
  } else {
    args.push("-vf", scaleFilter);
  }
  args.push(outputPath);
  await run(FFMPEG_PATH, args);
};

const averageBrightness = async (buffer) => {
  const stats = await sharp(buffer).stats();
  const channels = stats.channels.slice(0, 3);
  const total = channels.reduce((acc, channel) => acc + channel.mean, 0);
  return total / channels.length;
};

const createGif = async (inputPath, outputPath, overlayPath) => {
  const args = ["-y", "-t", "2", "-i", inputPath];
  if (overlayPath) {
    args.push(
      "-filter_complex",
      `[0:v]fps=12,${scaleFilter}[v0];[1:v][v0]scale2ref=w=iw:h=ih[wm][v1];[v1][wm]overlay=W-w-48:H-h-48`,
    );
  } else {
    args.push("-vf", `fps=12,${scaleFilter}`);
  }
  args.push("-loop", "0", "-fs", "3M", outputPath);
  await run(FFMPEG_PATH, args);
};

export const buildVideoDerivatives = async ({ workspace, inputPath, slug, createdAt, durationMs }) => {
  const overlayPath = await createOverlay(workspace, slug, createdAt);
  const mp4Path = workspace.pathFor("proof.mp4");
  const webmPath = workspace.pathFor("proof.webm");
  await encodeMp4(inputPath, mp4Path, overlayPath);
  await encodeWebm(inputPath, webmPath, overlayPath);
  const firstPosterPath = workspace.pathFor("poster-a.jpg");
  const secondPosterPath = workspace.pathFor("poster-b.jpg");
  await captureFrame(inputPath, 1, firstPosterPath, overlayPath);
  const midSeconds = durationMs ? Math.max(0, Math.floor(durationMs / 2000)) : 0;
  await captureFrame(inputPath, midSeconds, secondPosterPath, overlayPath);
  const firstPosterBuffer = await fs.readFile(firstPosterPath);
  const secondPosterBuffer = await fs.readFile(secondPosterPath);
  const firstScore = await averageBrightness(firstPosterBuffer);
  const secondScore = await averageBrightness(secondPosterBuffer);
  const posterBuffer = secondScore > firstScore ? secondPosterBuffer : firstPosterBuffer;
  const posterMeta = await sharp(posterBuffer).metadata();
  let gifBuffer = null;
  const gifPath = workspace.pathFor("preview.gif");
  try {
    await createGif(inputPath, gifPath, overlayPath);
    gifBuffer = await fs.readFile(gifPath);
  } catch {
    gifBuffer = null;
  }
  return {
    mp4Path,
    webmPath,
    posterBuffer,
    gifBuffer,
    width: posterMeta.width || null,
    height: posterMeta.height || null,
  };
};
