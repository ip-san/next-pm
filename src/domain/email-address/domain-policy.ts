import { domainToASCII } from "node:url";

/** Redmine's Setting.email_domains_allowed / email_domains_denied: domains separated by spaces, commas or line breaks. */
export interface EmailDomainPolicy {
  allowed: string;
  denied: string;
}

/** EmailAddress.domain_in?: an entry starting with "." matches the domain and its subdomains' suffix, others match exactly. */
function domainIn(domain: string, list: string): boolean {
  return list
    .split(/[\s,]+/)
    .filter((entry) => entry !== "")
    .map((entry) => entry.toLowerCase())
    .some((entry) => (entry.startsWith(".") ? domain.endsWith(entry) : domain === entry));
}

/**
 * The domain of `address` when the policy refuses it (EmailAddress.valid_domain?), or null when it's allowed. A denied
 * domain is refused first; with an allow list, anything not on it is refused. An internationalized domain is compared
 * in Punycode, as Redmine normalizes it.
 */
export function rejectedEmailDomain(address: string, policy: EmailDomainPolicy): string | null {
  const at = address.lastIndexOf("@");
  if (at < 0) return null;
  const domain = address.slice(at + 1);
  if (domain === "") return null;
  const ascii = (domainToASCII(domain) || domain).toLowerCase();
  if (policy.denied.trim() !== "" && domainIn(ascii, policy.denied)) return domain;
  if (policy.allowed.trim() !== "" && !domainIn(ascii, policy.allowed)) return domain;
  return null;
}

/**
 * The message for a refused address: Redmine's domain_not_allowed for a signed-in user, and the plain "invalid"
 * one for an anonymous registrant, so the form doesn't tell strangers which domains are allowed.
 */
export function emailDomainMessage(domain: string, options: { anonymous?: boolean } = {}): string {
  return options.anonymous ? "正しいメールアドレスを入力してください。" : `メールアドレスは許可されていないドメインを含んでいます (${domain})`;
}
