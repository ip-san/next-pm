import { timingSafeEqual } from "node:crypto";

/**
 * Redmine's `sys_api_enabled` and `sys_api_key`: the repository-management web service
 * (SysController) is off until an admin enables it, and every call must carry the key.
 */
export interface SysApiSettings {
  enabled: boolean;
  key: string;
}

export function resolveSysApiSettings(overrides: Record<string, string>): SysApiSettings {
  return { enabled: overrides.sys_api_enabled === "1", key: overrides.sys_api_key ?? "" };
}

/**
 * Mirrors SysController#check_enabled. Deliberately stricter than Redmine's `secure_compare`
 * against a possibly-empty key: an empty configured key never authorizes anything, so a request
 * with no `key` parameter cannot pass just because nothing was set.
 */
export function isSysApiKeyValid(settings: SysApiSettings, providedKey: string | null): boolean {
  if (!settings.enabled || settings.key.length === 0 || providedKey === null) return false;
  const expected = Buffer.from(settings.key);
  const provided = Buffer.from(providedKey);
  // timingSafeEqual throws on unequal lengths, so compare lengths first; the length itself is not secret.
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}
