/**
 * A deliberately small MIME reader for the incoming-mail handler, standing in for the `mail`
 * gem Redmine's MailHandler leans on. It covers exactly what `MailHandler#plain_text_body`,
 * `#add_attachments` and `#add_watchers` need to read off a real message:
 *
 * - RFC 5322 header folding, and RFC 2047 encoded-words in Subject / display names
 * - nested multipart bodies (the usual multipart/mixed wrapping a multipart/alternative)
 * - base64 and quoted-printable transfer encodings
 * - per-part charsets (ISO-2022-JP and Shift_JIS included — TextDecoder handles both)
 * - attachments, by Content-Disposition or by a filename parameter, with RFC 2231 names
 *
 * Anything it can't make sense of degrades rather than throws: an unknown charset falls back
 * to UTF-8, an unknown transfer encoding is treated as 8bit. A message that yields no body at
 * all is still a valid parse — the caller decides whether an empty body is usable.
 */

export interface MailAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
}

export interface ParsedEmail {
  fromEmail: string;
  fromName: string | null;
  /** Lower-cased addresses from To:, in header order. */
  to: string[];
  /** Lower-cased addresses from Cc:, in header order. */
  cc: string[];
  /** Lower-cased addresses from Bcc:, in header order (present on locally-injected mail). */
  bcc: string[];
  subject: string;
  /** In-Reply-To + References message ids, angle brackets stripped. */
  references: string[];
  /** Raw (decoded) header values, lower-cased names, first occurrence wins. */
  headers: Map<string, string>;
  /** Concatenated text/plain parts. */
  textBody: string;
  /** Concatenated text/html parts, still HTML. */
  htmlBody: string;
  attachments: MailAttachment[];
}

interface ContentType {
  type: string;
  params: Map<string, string>;
}

interface MimePart {
  headers: Map<string, string>;
  body: Buffer;
}

const DEFAULT_CHARSET = "utf-8";

function unfold(rawHeaders: string): string {
  return rawHeaders.replace(/\r?\n[ \t]+/g, " ");
}

/**
 * Collects headers as a name -> list map. Keeping every occurrence matters for References,
 * which a long reply chain splits across several header lines.
 */
function parseHeaderLines(rawHeaders: string): Map<string, string[]> {
  const headers = new Map<string, string[]>();
  for (const line of unfold(rawHeaders).split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const name = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    const existing = headers.get(name);
    if (existing) {
      existing.push(value);
    } else {
      headers.set(name, [value]);
    }
  }
  return headers;
}

function firstValues(headers: Map<string, string[]>): Map<string, string> {
  return new Map([...headers].map(([name, values]) => [name, values[0]]));
}

function decodeCharset(bytes: Buffer, charset: string): string {
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder(DEFAULT_CHARSET).decode(bytes);
  }
}

function decodeQuotedPrintable(input: Buffer, { underscoreAsSpace }: { underscoreAsSpace: boolean }): Buffer {
  const text = input.toString("latin1");
  const out: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "=") {
      // A "=" at end of line is a soft break: drop it together with the newline.
      if (text.startsWith("\r\n", i + 1)) {
        i += 2;
        continue;
      }
      if (text[i + 1] === "\n") {
        i += 1;
        continue;
      }
      const hex = text.slice(i + 1, i + 3);
      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        out.push(parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    if (underscoreAsSpace && ch === "_") {
      out.push(0x20);
      continue;
    }
    out.push(text.charCodeAt(i) & 0xff);
  }
  return Buffer.from(out);
}

const ENCODED_WORD_RE = /=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g;

/** RFC 2047 encoded-words, as they show up in Subject and in From display names. */
export function decodeEncodedWords(value: string): string {
  // Adjacent encoded-words separated only by whitespace are a single logical run (RFC 2047 §6.2).
  const joined = value.replace(/(\?=)\s+(=\?)/g, "$1$2");
  return joined.replace(ENCODED_WORD_RE, (_match, charset: string, encoding: string, text: string) => {
    const raw =
      encoding.toLowerCase() === "b"
        ? Buffer.from(text, "base64")
        : decodeQuotedPrintable(Buffer.from(text, "latin1"), { underscoreAsSpace: true });
    return decodeCharset(raw, charset.split("*")[0].toLowerCase());
  });
}

/** Splits a structured header value on `;`, ignoring separators inside quoted strings. */
function splitParameters(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quoted = false;
  for (const ch of value) {
    if (ch === '"') {
      quoted = !quoted;
      current += ch;
    } else if (ch === ";" && !quoted) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2
    ? trimmed.slice(1, -1).replace(/\\(.)/g, "$1")
    : trimmed;
}

/**
 * Parses `type/subtype; a=b; c*=utf-8''%41` style headers. RFC 2231 continuations
 * (`name*0`, `name*1`) and percent-encoded extended values are folded back into one param,
 * since that's how non-ASCII attachment filenames arrive.
 */
function parseStructuredHeader(raw: string): ContentType {
  const segments = splitParameters(raw);
  const type = segments[0].trim().toLowerCase();
  const continuations = new Map<string, string[]>();
  const params = new Map<string, string>();

  for (const segment of segments.slice(1)) {
    const eq = segment.indexOf("=");
    if (eq === -1) continue;
    const rawName = segment.slice(0, eq).trim().toLowerCase();
    const rawValue = segment.slice(eq + 1);
    const continuation = /^(.+?)\*(\d+)(\*?)$/.exec(rawName);
    if (continuation) {
      const list = continuations.get(continuation[1]) ?? [];
      list[Number(continuation[2])] = unquote(rawValue);
      continuations.set(continuation[1], list);
      continue;
    }
    params.set(rawName.replace(/\*$/, ""), unquote(rawValue));
  }
  for (const [name, chunks] of continuations) {
    params.set(name, chunks.filter((chunk) => chunk !== undefined).join(""));
  }

  for (const [name, value] of params) {
    params.set(name, decodeExtendedValue(decodeEncodedWords(value)));
  }
  return { type, params };
}

/** `utf-8''%E6%97%A5` — RFC 2231's charset-tagged, percent-encoded parameter value. */
function decodeExtendedValue(value: string): string {
  const match = /^([^']*)'([^']*)'(.*)$/.exec(value);
  if (!match) return value;
  const bytes = Buffer.from(
    match[3].replace(/%([0-9a-fA-F]{2})/g, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16))),
    "latin1",
  );
  return decodeCharset(bytes, (match[1] || DEFAULT_CHARSET).toLowerCase());
}

function splitMessage(raw: Buffer): { rawHeaders: string; body: Buffer } {
  const text = raw.toString("latin1");
  const crlf = text.indexOf("\r\n\r\n");
  const lf = text.indexOf("\n\n");
  let separator: number;
  let length: number;
  if (crlf !== -1 && (lf === -1 || crlf <= lf)) {
    separator = crlf;
    length = 4;
  } else if (lf !== -1) {
    separator = lf;
    length = 2;
  } else {
    return { rawHeaders: text, body: Buffer.alloc(0) };
  }
  return { rawHeaders: text.slice(0, separator), body: raw.subarray(separator + length) };
}

/** Splits a multipart body on its boundary, dropping the preamble and the epilogue. */
function splitMultipart(body: Buffer, boundary: string): Buffer[] {
  const text = body.toString("latin1");
  const delimiter = `--${boundary}`;
  const parts: Buffer[] = [];
  let start = -1;

  for (let index = 0; index < text.length; ) {
    const found = text.indexOf(delimiter, index);
    if (found === -1) break;
    const atLineStart = found === 0 || text[found - 1] === "\n";
    if (!atLineStart) {
      index = found + delimiter.length;
      continue;
    }
    if (start !== -1) {
      // Trim the CRLF that belongs to the delimiter line, not to the part.
      let end = found;
      if (text[end - 1] === "\n") end -= 1;
      if (text[end - 1] === "\r") end -= 1;
      parts.push(body.subarray(start, end));
    }
    const isClosing = text.startsWith("--", found + delimiter.length);
    if (isClosing) break;
    const lineEnd = text.indexOf("\n", found);
    if (lineEnd === -1) break;
    start = lineEnd + 1;
    index = start;
  }
  return parts;
}

function decodeBody(body: Buffer, transferEncoding: string): Buffer {
  switch (transferEncoding.trim().toLowerCase()) {
    case "base64":
      return Buffer.from(body.toString("latin1").replace(/[^A-Za-z0-9+/=]/g, ""), "base64");
    case "quoted-printable":
      return decodeQuotedPrintable(body, { underscoreAsSpace: false });
    default:
      // 7bit / 8bit / binary / anything unrecognised: the bytes are already the content.
      return body;
  }
}

function attachmentFilename(contentType: ContentType, disposition: ContentType): string | null {
  return disposition.params.get("filename") ?? contentType.params.get("name") ?? null;
}

interface Collected {
  text: string[];
  html: string[];
  attachments: MailAttachment[];
}

function collectPart(part: MimePart, collected: Collected): void {
  const contentType = parseStructuredHeader(part.headers.get("content-type") ?? "text/plain");
  const disposition = parseStructuredHeader(part.headers.get("content-disposition") ?? "");

  if (contentType.type.startsWith("multipart/")) {
    const boundary = contentType.params.get("boundary");
    if (!boundary) return;
    for (const raw of splitMultipart(part.body, boundary)) {
      const { rawHeaders, body } = splitMessage(raw);
      collectPart({ headers: firstValues(parseHeaderLines(rawHeaders)), body }, collected);
    }
    return;
  }

  const decoded = decodeBody(part.body, part.headers.get("content-transfer-encoding") ?? "");
  const filename = attachmentFilename(contentType, disposition);
  const isAttachment = disposition.type === "attachment" || (filename !== null && !contentType.type.startsWith("text/"));

  if (isAttachment) {
    if (decoded.length > 0) {
      collected.attachments.push({
        filename: filename ?? "attachment",
        contentType: contentType.type || "application/octet-stream",
        content: decoded,
      });
    }
    return;
  }

  const charset = (contentType.params.get("charset") ?? DEFAULT_CHARSET).toLowerCase();
  const text = decodeCharset(decoded, charset);
  if (contentType.type === "text/html") {
    collected.html.push(text);
  } else if (contentType.type === "" || contentType.type.startsWith("text/")) {
    collected.text.push(text);
  }
}

function addressesFrom(headerValues: string[] | undefined): string[] {
  if (!headerValues) return [];
  return headerValues
    .flatMap((value) => splitAddressList(value))
    .map((address) => extractAddress(address))
    .filter((address) => address.length > 0);
}

/** Splits an address list on commas that aren't inside a quoted display name or a group. */
function splitAddressList(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quoted = false;
  let angle = false;
  for (const ch of value) {
    if (ch === '"') quoted = !quoted;
    if (ch === "<") angle = true;
    if (ch === ">") angle = false;
    if (ch === "," && !quoted && !angle) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

export function extractAddress(mailbox: string): string {
  const angleMatch = /<([^>]*)>/.exec(mailbox);
  return (angleMatch ? angleMatch[1] : mailbox).trim().toLowerCase();
}

export function extractDisplayName(mailbox: string): string | null {
  const angleMatch = /^(.*)<[^>]*>\s*$/.exec(mailbox);
  if (angleMatch) {
    const name = decodeEncodedWords(unquote(angleMatch[1].trim()));
    return name.length > 0 ? name : null;
  }
  // `address (Display Name)` — the other RFC 5322 spelling, used by some mailers.
  const commentMatch = /\(([^)]*)\)/.exec(mailbox);
  return commentMatch && commentMatch[1].trim().length > 0 ? decodeEncodedWords(commentMatch[1].trim()) : null;
}

function messageIds(values: string[] | undefined): string[] {
  if (!values) return [];
  return values.flatMap((value) => [...value.matchAll(/<([^>]+)>/g)].map((match) => match[1]));
}

export function parseMime(raw: string | Buffer): ParsedEmail {
  const buffer = typeof raw === "string" ? Buffer.from(raw, "utf8") : raw;
  const { rawHeaders, body } = splitMessage(buffer);
  const allHeaders = parseHeaderLines(rawHeaders);
  const headers = firstValues(allHeaders);

  const collected: Collected = { text: [], html: [], attachments: [] };
  collectPart({ headers, body }, collected);

  const fromMailbox = splitAddressList(headers.get("from") ?? "")[0] ?? "";

  return {
    fromEmail: extractAddress(fromMailbox),
    fromName: extractDisplayName(fromMailbox),
    to: addressesFrom(allHeaders.get("to")),
    cc: addressesFrom(allHeaders.get("cc")),
    bcc: addressesFrom(allHeaders.get("bcc")),
    subject: decodeEncodedWords(headers.get("subject") ?? "").trim(),
    references: [...messageIds(allHeaders.get("in-reply-to")), ...messageIds(allHeaders.get("references"))],
    headers,
    textBody: collected.text.join("\n"),
    htmlBody: collected.html.join("\n"),
    attachments: collected.attachments,
  };
}
