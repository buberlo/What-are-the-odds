import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { applyBlurMasks } from "../src/media/image.js";

describe("applyBlurMasks", () => {
  it("blurs specified regions and leaves others untouched", async () => {
    const overlay = await sharp({
      create: {
        width: 20,
        height: 20,
        channels: 3,
        background: { r: 20, g: 40, b: 200 },
      },
    })
      .png()
      .toBuffer();

    const base = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 200, g: 40, b: 80 },
      },
    })
      .composite([{ input: overlay, left: 40, top: 40 }])
      .jpeg()
      .toBuffer();

    const blurred = await applyBlurMasks(base, [{ x: 10, y: 10, w: 40, h: 40 }]);

    const centerBefore = await sharp(base)
      .extract({ left: 25, top: 25, width: 1, height: 1 })
      .raw()
      .toBuffer();
    const centerAfter = await sharp(blurred)
      .extract({ left: 25, top: 25, width: 1, height: 1 })
      .raw()
      .toBuffer();
    expect(centerAfter.equals(centerBefore)).toBe(false);

    const cornerBefore = await sharp(base)
      .extract({ left: 80, top: 80, width: 1, height: 1 })
      .raw()
      .toBuffer();
    const cornerAfter = await sharp(blurred)
      .extract({ left: 80, top: 80, width: 1, height: 1 })
      .raw()
      .toBuffer();
    expect(cornerAfter.equals(cornerBefore)).toBe(true);
  });
});
