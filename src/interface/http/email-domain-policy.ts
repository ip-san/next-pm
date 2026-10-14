import type { EmailDomainPolicy } from "@/domain/email-address/domain-policy";
import { loadAuthSettings } from "@/application/settings/auth-settings";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";

/** The allowed and denied email domains from the settings (email_domains_allowed / email_domains_denied). */
export async function emailDomainPolicy(): Promise<EmailDomainPolicy> {
  const settings = await loadAuthSettings(new DrizzleSettingsRepository());
  return { allowed: settings.emailDomainsAllowed, denied: settings.emailDomainsDenied };
}
