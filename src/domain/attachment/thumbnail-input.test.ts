import { describe, expect, it } from "bun:test";
import { DEFAULT_THUMBNAIL_SIZE, MAX_THUMBNAIL_SIZE, resolveThumbnailSize, sniffRasterImageFormat } from "./thumbnail-input";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const gif = Buffer.from("GIF89a\x01\x00\x01\x00", "latin1");
const webp = Buffer.concat([Buffer.from("RIFF", "latin1"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBPVP8 ", "latin1")]);
const bmp = Buffer.from("BM\x00\x00\x00\x00", "latin1");
const avif = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from("ftypavif", "latin1")]);

describe("sniffRasterImageFormat", () => {
  it("recognises the raster formats on Redmine's allowlist", () => {
    expect(sniffRasterImageFormat(png)).toBe("png");
    expect(sniffRasterImageFormat(jpeg)).toBe("jpeg");
    expect(sniffRasterImageFormat(gif)).toBe("gif");
    expect(sniffRasterImageFormat(webp)).toBe("webp");
    expect(sniffRasterImageFormat(bmp)).toBe("bmp");
    expect(sniffRasterImageFormat(avif)).toBe("avif");
  });

  it("rejects SVG however it is dressed up", () => {
    expect(sniffRasterImageFormat(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffRasterImageFormat(Buffer.from('<?xml version="1.0"?><svg></svg>'))).toBeNull();
    // The upload's declared content type is not an input here, which is the point: an SVG
    // uploaded as image/png must not reach the renderer.
    expect(sniffRasterImageFormat(Buffer.from("<!DOCTYPE html><script>alert(1)</script>"))).toBeNull();
  });

  it("rejects truncated and empty input instead of reading past the end", () => {
    expect(sniffRasterImageFormat(Buffer.alloc(0))).toBeNull();
    expect(sniffRasterImageFormat(Buffer.from([0x89, 0x50]))).toBeNull();
    expect(sniffRasterImageFormat(Buffer.from("RIFF", "latin1"))).toBeNull();
  });

  it("does not mistake a RIFF container that is not WebP for an image", () => {
    const wav = Buffer.concat([Buffer.from("RIFF", "latin1"), Buffer.from([0, 0, 0, 0]), Buffer.from("WAVEfmt ", "latin1")]);
    expect(sniffRasterImageFormat(wav)).toBeNull();
  });
});

describe("resolveThumbnailSize", () => {
  it("rounds up to the next multiple of 50, like Attachment#thumbnail", () => {
    expect(resolveThumbnailSize(80)).toBe(100);
    expect(resolveThumbnailSize(100)).toBe(100);
    expect(resolveThumbnailSize("101")).toBe(150);
  });

  it("caps at 800", () => {
    expect(resolveThumbnailSize(5000)).toBe(MAX_THUMBNAIL_SIZE);
    expect(resolveThumbnailSize(Number.MAX_SAFE_INTEGER)).toBe(MAX_THUMBNAIL_SIZE);
    expect(resolveThumbnailSize("Infinity")).toBe(DEFAULT_THUMBNAIL_SIZE);
  });

  it("falls back to the default for junk, zero and negative sizes", () => {
    expect(resolveThumbnailSize(undefined)).toBe(DEFAULT_THUMBNAIL_SIZE);
    expect(resolveThumbnailSize(null)).toBe(DEFAULT_THUMBNAIL_SIZE);
    expect(resolveThumbnailSize("abc")).toBe(DEFAULT_THUMBNAIL_SIZE);
    expect(resolveThumbnailSize("")).toBe(DEFAULT_THUMBNAIL_SIZE);
    expect(resolveThumbnailSize(0)).toBe(DEFAULT_THUMBNAIL_SIZE);
    expect(resolveThumbnailSize(-200)).toBe(DEFAULT_THUMBNAIL_SIZE);
    expect(resolveThumbnailSize(NaN)).toBe(DEFAULT_THUMBNAIL_SIZE);
  });

  it("only ever yields one of a small fixed set of sizes", () => {
    const produced = new Set(Array.from({ length: 2000 }, (_, i) => resolveThumbnailSize(i)));
    // 50, 100, ... 800 — and the default (100) is already one of them.
    expect([...produced].sort((a, b) => a - b)).toEqual(Array.from({ length: MAX_THUMBNAIL_SIZE / 50 }, (_, i) => (i + 1) * 50));
  });
});
