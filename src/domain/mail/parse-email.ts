export class UnsupportedMailFormatError extends Error {}

export interface ParsedEmail {
  fromEmail: string;
  subject: string;
  body: string;
}

const SUPPORTED_TRANSFER_ENCODINGS = new Set(["7bit", "8bit"]);

// Continuation lines (RFC 5322 folding) start with a space or tab — join them onto the
// previous header line before splitting on ":" so a folded Subject/From isn't cut in half.
function unfoldHeaders(rawHeaders: string): string {
  return rawHeaders.replace(/\n[ \t]+/g, " ");
}

function parseHeaders(unfolded: string): Map<string, string> {
  const headers = new Map<string, string>();
  for (const line of unfolded.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const name = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    // First occurrence wins — every header this parser reads is expected to appear once.
    if (!headers.has(name)) {
      headers.set(name, value);
    }
  }
  return headers;
}

function extractEmailAddress(fromHeader: string): string {
  const angleMatch = /<([^>]+)>/.exec(fromHeader);
  return (angleMatch ? angleMatch[1] : fromHeader).trim().toLowerCase();
}

/**
 * Parses a raw RFC 5322 message into just what the mail handler needs: sender address, subject,
 * body. Deliberately narrow — no MIME multipart, no transfer-encoding decode, no RFC 2047
 * encoded-word decoding for non-ASCII headers. A message outside that shape (anything but a
 * single text/plain part, 7bit/8bit) is rejected rather than partially/incorrectly decoded.
 */
export function parseEmail(raw: string): ParsedEmail {
  const normalized = raw.replace(/\r\n/g, "\n");
  const separatorIndex = normalized.indexOf("\n\n");
  const rawHeaders = separatorIndex === -1 ? normalized : normalized.slice(0, separatorIndex);
  const body = separatorIndex === -1 ? "" : normalized.slice(separatorIndex + 2);

  const headers = parseHeaders(unfoldHeaders(rawHeaders));

  const contentType = (headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (contentType && contentType !== "text/plain") {
    throw new UnsupportedMailFormatError(`unsupported content type: ${contentType}`);
  }

  const transferEncoding = (headers.get("content-transfer-encoding") ?? "").trim().toLowerCase();
  if (transferEncoding && !SUPPORTED_TRANSFER_ENCODINGS.has(transferEncoding)) {
    throw new UnsupportedMailFormatError(`unsupported transfer encoding: ${transferEncoding}`);
  }

  const fromHeader = headers.get("from");
  if (!fromHeader) {
    throw new UnsupportedMailFormatError("missing From header");
  }

  return {
    fromEmail: extractEmailAddress(fromHeader),
    subject: headers.get("subject") ?? "",
    body: body.trim(),
  };
}

// Mirrors Redmine's ISSUE_REPLY_SUBJECT_RE ("[... #123]"), adapted to an 8-hex-char prefix
// instead of a sequential number — next-pm issues are identified by uuid, not an integer id,
// and "#eb0b2d1a" (issue.id.slice(0, 8)) is already the shorthand the rest of the app displays.
const ISSUE_REPLY_SUBJECT_RE = /\[(?:[^\]]*\s+)?#([0-9a-fA-F]{8})\]/;

/** Returns the 8-hex-char issue id prefix a reply subject targets, or null if it's not a reply. */
export function extractIssueReplyIdPrefix(subject: string): string | null {
  const match = ISSUE_REPLY_SUBJECT_RE.exec(subject);
  return match ? match[1].toLowerCase() : null;
}
