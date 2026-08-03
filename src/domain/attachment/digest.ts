import { createHash } from "node:crypto";

/** Mirrors Redmine's Attachment#digest (sha256 of the file content). */
export function computeDigest(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}
