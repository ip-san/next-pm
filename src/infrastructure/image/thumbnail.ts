import { sniffRasterImageFormat } from "@/domain/attachment/thumbnail-input";

/**
 * Thumbnail generation, isolated behind one function so nothing else in the codebase (and no
 * unit test) ever has to load the native image library.
 *
 * Mirrors Redmine's `Redmine::Thumbnail.generate`, including its guards:
 *   - the renderer is only invoked when the file's own bytes say it is an allowed raster
 *     format ("Make sure we only invoke Imagemagick if the file type is allowed");
 *   - a missing renderer degrades to no thumbnail rather than an error
 *     (`Redmine::Thumbnail.convert_available?`). Here the renderer is `sharp`, imported
 *     lazily, so a platform without a prebuilt binary still runs the app.
 */

/**
 * Refuse to decode anything that would expand past this many pixels. sharp's own default is
 * ~268 megapixels, which a 25 MB upload can reach easily — a decompression bomb turns a small
 * file into gigabytes of RAM. 40 MP is well past any screenshot or photo a project attaches.
 */
export const MAX_INPUT_PIXELS = 40_000_000;

let sharpModule: typeof import("sharp") | null | undefined;

async function loadSharp(): Promise<typeof import("sharp") | null> {
  if (sharpModule !== undefined) {
    return sharpModule;
  }
  try {
    sharpModule = (await import("sharp")).default;
  } catch {
    sharpModule = null;
  }
  return sharpModule;
}

/**
 * Renders in flight, keyed by content digest + size. A page full of images, or a client
 * re-requesting the same thumbnail, then costs one decode instead of one per request. Entries
 * are removed as soon as the render settles, so the map is bounded by concurrency, not by the
 * number of attachments ever requested — this is a coalescer, not a cache.
 */
const inFlight = new Map<string, Promise<Buffer | null>>();

async function render(data: Buffer, size: number): Promise<Buffer | null> {
  const sharp = await loadSharp();
  if (!sharp) {
    return null;
  }
  try {
    return await sharp(data, { animated: false, limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" })
      .resize(size, size, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
  } catch {
    // Truncated, corrupt, or over the pixel limit — Redmine logs and returns nil here too.
    return null;
  }
}

/**
 * Re-encodes `data` as a PNG no larger than `size` on its longest edge, or returns null when
 * the bytes are not an allowed raster image, no renderer is available, or decoding fails.
 *
 * Re-encoding (rather than echoing the original bytes) is what makes the result safe to serve
 * inline, and the format sniff is what keeps a document format out of the renderer in the
 * first place. `cacheKey` should be content-derived (the attachment digest) so two different
 * files can never coalesce onto one render.
 *
 * `size` must already have been through `resolveThumbnailSize`.
 */
export async function generateThumbnail(data: Buffer, size: number, cacheKey: string): Promise<Buffer | null> {
  if (sniffRasterImageFormat(data) === null) {
    return null;
  }

  const key = `${cacheKey}:${size}`;
  const pending = inFlight.get(key);
  if (pending) {
    return pending;
  }

  const work = render(data, size).finally(() => inFlight.delete(key));
  inFlight.set(key, work);
  return work;
}
