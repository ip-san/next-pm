/**
 * Decisions about *what* may be turned into a thumbnail, kept pure so they can be tested
 * without loading the native image library.
 *
 * Ports the two guards Redmine applies in `Redmine::Thumbnail.generate`:
 *   1. the real MIME type is read from the file's own bytes (`Marcel::MimeType.for`) and
 *      checked against ALLOWED_TYPES — the stored/declared content type is never trusted;
 *   2. the requested size is quantised and capped, so one image can only ever produce a
 *      small, fixed set of renderings.
 */

/** Redmine's `Redmine::Thumbnail::ALLOWED_TYPES`, minus application/pdf (no Ghostscript here). */
export type RasterImageFormat = "png" | "jpeg" | "gif" | "webp" | "bmp" | "avif";

function startsWith(data: Buffer, bytes: number[], offset = 0): boolean {
  if (data.length < offset + bytes.length) return false;
  return bytes.every((byte, index) => data[offset + index] === byte);
}

function ascii(data: Buffer, offset: number, length: number): string {
  return data.length < offset + length ? "" : data.toString("latin1", offset, offset + length);
}

/**
 * Identifies the format from the leading bytes, or null for anything not on the allowlist.
 *
 * SVG is absent on purpose and must stay absent. It is a document, not a bitmap: handing one
 * to the renderer means a library parses attacker-controlled markup that can reference
 * external and local resources. A declared content type of "image/png" on an SVG upload is
 * enough to reach that path if the declaration is believed, which is exactly the differential
 * this function closes.
 */
export function sniffRasterImageFormat(data: Buffer): RasterImageFormat | null {
  if (startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(data, [0xff, 0xd8, 0xff])) return "jpeg";
  if (ascii(data, 0, 6) === "GIF87a" || ascii(data, 0, 6) === "GIF89a") return "gif";
  if (ascii(data, 0, 4) === "RIFF" && ascii(data, 8, 4) === "WEBP") return "webp";
  if (ascii(data, 0, 2) === "BM") return "bmp";
  // ISO-BMFF: a `ftyp` box whose major brand (or a compatible brand) is an AVIF one.
  if (ascii(data, 4, 4) === "ftyp" && ["avif", "avis"].includes(ascii(data, 8, 4))) return "avif";
  return null;
}

/** Longest prefix sniffRasterImageFormat ever inspects — nothing else needs to be read first. */
export const IMAGE_SNIFF_BYTES = 16;

export const DEFAULT_THUMBNAIL_SIZE = 100;
export const MAX_THUMBNAIL_SIZE = 800;
const THUMBNAIL_SIZE_STEP = 50;

/**
 * Mirrors Attachment#thumbnail's sizing: round up to the next multiple of 50, cap at 800, and
 * fall back to the default for anything non-positive or unparseable. Redmine's comment on the
 * rounding says it plainly — "Limit the number of thumbnails per image" — which is also what
 * stops a caller from walking `?size=` across hundreds of values to force hundreds of renders.
 */
export function resolveThumbnailSize(raw: string | number | null | undefined): number {
  const requested = typeof raw === "number" ? raw : Number(raw ?? NaN);
  if (!Number.isFinite(requested) || requested <= 0) {
    return DEFAULT_THUMBNAIL_SIZE;
  }
  const quantised = Math.ceil(requested / THUMBNAIL_SIZE_STEP) * THUMBNAIL_SIZE_STEP;
  return Math.min(quantised, MAX_THUMBNAIL_SIZE);
}
