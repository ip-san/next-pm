import { htmlToText } from "./html-to-text";
import { parseMime, type MailAttachment, type ParsedEmail } from "./mime";
import type { PreferredBodyPart } from "@/domain/settings/mail-handler-settings";

export type { MailAttachment, ParsedEmail };
export { parseMime as parseEmail };

/**
 * Redmine's `MailHandler#plain_text_body`: take the preferred part type first, fall back to the
 * other, converting HTML to text when that's what's left. An empty string is a valid result —
 * a mail whose only content is an attachment has no body.
 */
export function plainTextBody(email: ParsedEmail, preferred: PreferredBodyPart): string {
  const plain = email.textBody.trim();
  const html = email.htmlBody.trim();
  const order = preferred === "html" ? [htmlToText(html), plain] : [plain, htmlToText(html)];
  return order.find((candidate) => candidate.length > 0) ?? "";
}

/**
 * Mirrors Redmine's `MailHandler.ignored_emails_headers` plus its emission-address check: both
 * exist to stop a notification the app itself sent from being fed straight back in. That loop
 * matters more now that the mail handler enqueues notifications of its own.
 */
export function isAutoSubmitted(email: ParsedEmail): boolean {
  const autoSubmitted = email.headers.get("auto-submitted")?.toLowerCase() ?? "";
  if (/^auto-(replied|generated)/.test(autoSubmitted)) {
    return true;
  }
  return (email.headers.get("x-autoreply") ?? "").toLowerCase() === "yes";
}

// Mirrors Redmine's ISSUE_REPLY_SUBJECT_RE ("[... #123]"), adapted to an 8-hex-char prefix
// instead of a sequential number — next-pm issues are identified by uuid, not an integer id,
// and "#eb0b2d1a" (issue.id.slice(0, 8)) is already the shorthand the rest of the app displays.
const ISSUE_REPLY_SUBJECT_RE = /\[(?:[^\]]*\s+)?#([0-9a-fA-F]{8})\]/;

// Redmine's MESSAGE_REPLY_SUBJECT_RE ("[... msg123]"), same uuid-prefix adaptation.
const MESSAGE_REPLY_SUBJECT_RE = /\[[^\]]*msg([0-9a-fA-F]{8})\]/;

/** Returns the 8-hex-char issue id prefix a reply subject targets, or null if it's not a reply. */
export function extractIssueReplyIdPrefix(subject: string): string | null {
  const match = ISSUE_REPLY_SUBJECT_RE.exec(subject);
  return match ? match[1].toLowerCase() : null;
}

/** Returns the 8-hex-char message id prefix a forum reply subject targets, or null. */
export function extractMessageReplyIdPrefix(subject: string): string | null {
  const match = MESSAGE_REPLY_SUBJECT_RE.exec(subject);
  return match ? match[1].toLowerCase() : null;
}

/** Strips the routing token off a forum reply subject, as Redmine does before saving it. */
export function stripMessageReplyToken(subject: string): string {
  return subject.replace(/^.*msg[0-9a-fA-F]{8}\]/, "").trim();
}

/**
 * Redmine's `MailHandler#get_project_from_receiver_addresses`: with
 * `project_from_subaddress=redmine@example.com`, a message addressed to
 * `redmine+myproject@example.com` targets the project `myproject`. Returns the identifier only;
 * the caller decides whether such a project exists and is reachable.
 */
export function projectIdentifierFromSubaddress(email: ParsedEmail, subaddress: string): string | null {
  const [local, domain] = subaddress.split("@");
  if (!local || !domain) {
    return null;
  }
  const expectedLocal = local.toLowerCase();
  const expectedDomain = domain.toLowerCase();

  for (const address of [...email.to, ...email.cc, ...email.bcc]) {
    const at = address.lastIndexOf("@");
    if (at === -1) continue;
    if (address.slice(at + 1) !== expectedDomain) continue;
    const addressLocal = address.slice(0, at);
    if (!addressLocal.startsWith(`${expectedLocal}+`)) continue;
    const identifier = addressLocal.slice(expectedLocal.length + 1);
    // A second "+" means this isn't the single-segment sub-address Redmine matches.
    if (identifier.length > 0 && !identifier.includes("+")) {
      return identifier;
    }
  }
  return null;
}
