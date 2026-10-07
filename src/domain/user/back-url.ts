/**
 * Mirrors Redmine's ApplicationController#validate_back_url: a redirect target supplied in a
 * query string is only honoured when it is a path on this application.
 *
 * The cases that matter are the ones a naive `startsWith("/")` misses:
 * - `//evil.example` is protocol-relative and leaves the site;
 * - `/\evil.example` is too, because the WHATWG URL parser normalises a backslash to a slash
 *   for http(s), so `new URL("/\\evil.example", origin)` resolves to `http://evil.example`
 *   (Redmine rejects backslashes for the same reason);
 * - a CR/LF would let a crafted value split the response header.
 * Anything rejected falls back to "/" rather than erroring — the user is mid-login and should
 * land somewhere useful, not on an error page.
 */
export function safeBackPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/")) {
    return "/";
  }
  if (raw.startsWith("//") || raw.startsWith("/\\")) {
    return "/";
  }
  if (/[\r\n\t\0]/.test(raw)) {
    return "/";
  }
  return raw;
}
