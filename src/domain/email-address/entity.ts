/**
 * An *additional* address for a user. The default address stays on users.mail — see
 * infrastructure/db/schema/email-addresses.ts for why next-pm splits them that way while
 * Redmine keeps all of them in one table with an is_default flag.
 */
export interface EmailAddress {
  id: string;
  userId: string;
  address: string;
  /** Redmine EmailAddress#notify — whether notifications are copied to this address too. */
  notify: boolean;
  createdAt: Date;
}

/** Redmine normalises the address by stripping whitespace; the IDN punycode step has no counterpart here. */
export function normalizeEmailAddress(address: string): string {
  return address.trim();
}

/**
 * Redmine's EmailAddress validates against URI::MailTo::EMAIL_REGEXP. This is the same shape
 * check the rest of next-pm applies through zod's email validator, kept here so the use case
 * can reject before touching the database.
 */
export function isValidEmailAddress(address: string): boolean {
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(address);
}

/**
 * Which addresses a notification for this user is delivered to — Redmine's
 * `User#notified_mails` (the default address plus every additional one flagged notify).
 * The default address is always included: Redmine's default EmailAddress row is created with
 * notify true and its checkbox is not offered, so there is no way to silence it either.
 */
export function notifiedAddresses(defaultMail: string, additional: EmailAddress[]): string[] {
  return [defaultMail, ...additional.filter((address) => address.notify).map((address) => address.address)];
}
