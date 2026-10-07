/**
 * Thumbnail generation, isolated behind one function so nothing else in the codebase (and no
 * unit test) ever has to load the native image library.
 *
 * Mirrors Redmine's `Redmine::Thumbnail.convert_available?` gate: Redmine shells out to
 * ImageMagick and silently serves no thumbnail when it is missing. Here the equivalent is
 * `sharp`, imported lazily — if it cannot be loaded (platform without a prebuilt binary),
 * `generateThumbnail` returns null and the caller falls back to the plain download link.
 */

export const DEFAULT_THUMBNAIL_SIZE = 200;
export const MAX_THUMBNAIL_SIZE = 800;

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
 * Re-encodes `data` as a PNG no larger than `size` on its longest edge. Re-encoding (rather
 * than echoing the original bytes) is what makes the result safe to serve inline: whatever
 * was wrapped around the pixels does not survive the round trip.
 * Returns null when no thumbnailer is available or the bytes are not a decodable image.
 */
export async function generateThumbnail(data: Buffer, size: number = DEFAULT_THUMBNAIL_SIZE): Promise<Buffer | null> {
  const sharp = await loadSharp();
  if (!sharp) {
    return null;
  }

  const edge = Math.min(Math.max(Math.trunc(size) || DEFAULT_THUMBNAIL_SIZE, 1), MAX_THUMBNAIL_SIZE);
  try {
    return await sharp(data, { animated: false })
      .resize(edge, edge, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}
