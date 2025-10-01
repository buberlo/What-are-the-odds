import sharp from "sharp";
import { buildWatermarkBuffer } from "./watermark.js";

export const generatePhotoVariants = async ({ buffer, watermark, slug, createdAt }) => {
  const base = await sharp(buffer, { limitInputPixels: false })
    .rotate()
    .resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  const baseMeta = await sharp(base).metadata();
  let source = base;
  if (watermark) {
    const overlay = buildWatermarkBuffer(baseMeta.width || 1920, baseMeta.height || 1080, slug, createdAt);
    source = await sharp(base)
      .composite([{ input: overlay, gravity: "southeast" }])
      .jpeg({ quality: 85 })
      .toBuffer();
  }
  const metadata = await sharp(source).metadata();
  const makeSized = async (width) =>
    sharp(source)
      .resize({ width, height: width, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  const jpeg = source;
  const thumb1280 = await makeSized(1280);
  const thumb640 = await makeSized(640);
  const thumb320 = await makeSized(320);
  const poster = thumb640;
  return {
    variants: new Map([
      ["jpeg", jpeg],
      ["thumb1280", thumb1280],
      ["thumb640", thumb640],
      ["thumb320", thumb320],
      ["poster", poster],
    ]),
    width: metadata.width || null,
    height: metadata.height || null,
  };
};

export const applyBlurMasks = async (buffer, masks) => {
  if (!Array.isArray(masks) || masks.length === 0) return buffer;
  let current = buffer;
  const meta = await sharp(buffer).metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  for (const mask of masks) {
    if (!mask) continue;
    const left = Math.max(0, Math.floor(Number(mask.x) || 0));
    const top = Math.max(0, Math.floor(Number(mask.y) || 0));
    const maskWidth = Math.max(1, Math.floor(Number(mask.w) || Number(mask.width) || 0));
    const maskHeight = Math.max(1, Math.floor(Number(mask.h) || Number(mask.height) || 0));
    if (width && height) {
      if (left >= width || top >= height) continue;
    }
    const clampedWidth = width ? Math.min(maskWidth, width - left) : maskWidth;
    const clampedHeight = height ? Math.min(maskHeight, height - top) : maskHeight;
    if (clampedWidth <= 0 || clampedHeight <= 0) continue;
    const region = await sharp(buffer)
      .extract({ left, top, width: clampedWidth, height: clampedHeight })
      .blur(35)
      .toBuffer();
    current = await sharp(current)
      .composite([{ input: region, left, top }])
      .toBuffer();
  }
  return current;
};
