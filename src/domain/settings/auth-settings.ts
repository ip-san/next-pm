/**
 * Redmine's Administration > Settings > Authentication tab (settings.yml + the
 * `_authentication.html.erb` partial), plus the two account-facing toggles that live on other
 * tabs but belong to the same subject (`unsubscribe`, `gravatar_enabled`).
 *
 * Same defaulting rule as general-settings.ts: every default preserves next-pm's prior
 * hardcoded behavior, which for several keys is the *opposite* of Redmine's own default —
 * self_registration and unsubscribe especially. Shipping Redmine's defaults here would open
 * public signup and account deletion on every existing deployment the moment this page lands.
 */
export const AUTH_SETTING_KEYS = [
  "login_required",
  "autologin",
  "self_registration",
  "password_min_length",
  "password_required_char_classes",
  "lost_password",
  "twofa",
  "unsubscribe",
  "gravatar_enabled",
  "session_lifetime",
  "session_timeout",
  "max_additional_emails",
] as const;

export type AuthSettingKey = (typeof AUTH_SETTING_KEYS)[number];

/** Redmine Setting.self_registration: '0' disabled, '1' activation by email, '2' manual activation by admin, '3' automatic. */
export const SELF_REGISTRATION_MODES = ["0", "1", "2", "3"] as const;
export type SelfRegistrationMode = (typeof SELF_REGISTRATION_MODES)[number];

/** Redmine Setting.twofa: '0' disabled, '1' optional, '2' required for everyone, '3' required for administrators. */
export const TWOFA_MODES = ["0", "1", "2", "3"] as const;
export type TwofaMode = (typeof TWOFA_MODES)[number];

/** Redmine Setting::PASSWORD_CHAR_CLASSES — the keys only; the character ranges live in password-policy.ts. */
export const PASSWORD_CHAR_CLASSES = ["uppercase", "lowercase", "digits", "special_chars"] as const;
export type PasswordCharClass = (typeof PASSWORD_CHAR_CLASSES)[number];

/** Redmine offers a fixed set of autologin durations rather than a free-form number of days. */
export const AUTOLOGIN_DAY_OPTIONS = [0, 1, 7, 30, 365] as const;

export const AUTH_SETTING_DEFAULTS: Record<AuthSettingKey, string> = {
  // next-pm has always let anonymous visitors read public projects — "0" keeps that.
  login_required: "0",
  // Redmine's own default too (0 = disabled). next-pm had no autologin at all before this.
  autologin: "0",
  // Redmine defaults to '2' (manual activation). next-pm had no registration form, so only
  // '0' preserves "accounts exist because an admin made one".
  self_registration: "0",
  // The literal value change-password.ts enforced before this setting existed.
  password_min_length: "8",
  // Comma-separated subset of PASSWORD_CHAR_CLASSES. Empty = no class requirement, as before.
  password_required_char_classes: "",
  // next-pm already shipped /account/lost_password unconditionally.
  lost_password: "1",
  // next-pm already let any user pair TOTP voluntarily, which is exactly Redmine's '1'.
  twofa: "1",
  // Redmine defaults to 1 (self-deletion allowed). next-pm had no such path — "0" keeps it shut.
  unsubscribe: "0",
  // Redmine's own default. Off means no outbound requests to gravatar.com at render time.
  gravatar_enabled: "0",
  // Minutes; 0 = unlimited. next-pm's session cookie/JWT lived a fixed 7 days.
  session_lifetime: "0",
  session_timeout: "0",
  // Redmine's own default.
  max_additional_emails: "5",
};

export interface AuthSettings {
  loginRequired: boolean;
  /** Days an autologin cookie stays valid. 0 disables the remember-me checkbox entirely. */
  autologinDays: number;
  selfRegistration: SelfRegistrationMode;
  passwordMinLength: number;
  passwordRequiredCharClasses: PasswordCharClass[];
  lostPasswordEnabled: boolean;
  twofa: TwofaMode;
  unsubscribeEnabled: boolean;
  gravatarEnabled: boolean;
  /** Minutes from login after which a session dies regardless of activity. 0 = unlimited. */
  sessionLifetimeMinutes: number;
  /** Minutes of inactivity after which a session dies. 0 = unlimited. */
  sessionTimeoutMinutes: number;
  maxAdditionalEmails: number;
}

function nonNegativeIntOr(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return raw !== undefined && Number.isFinite(value) && Number.isInteger(value) && value >= 0 ? value : fallback;
}

function positiveIntOr(raw: string | undefined, fallback: number): number {
  const value = nonNegativeIntOr(raw, fallback);
  return value > 0 ? value : fallback;
}

export function parsePasswordCharClasses(raw: string): PasswordCharClass[] {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry): entry is PasswordCharClass => (PASSWORD_CHAR_CLASSES as readonly string[]).includes(entry));
}

export function serializePasswordCharClasses(classes: PasswordCharClass[]): string {
  return PASSWORD_CHAR_CLASSES.filter((charClass) => classes.includes(charClass)).join(",");
}

export function resolveAuthSettings(overrides: Record<string, string>): AuthSettings {
  const selfRegistration = overrides.self_registration;
  const twofa = overrides.twofa;

  return {
    loginRequired: (overrides.login_required ?? AUTH_SETTING_DEFAULTS.login_required) === "1",
    autologinDays: nonNegativeIntOr(overrides.autologin, Number(AUTH_SETTING_DEFAULTS.autologin)),
    selfRegistration: (SELF_REGISTRATION_MODES as readonly string[]).includes(selfRegistration ?? "")
      ? (selfRegistration as SelfRegistrationMode)
      : (AUTH_SETTING_DEFAULTS.self_registration as SelfRegistrationMode),
    passwordMinLength: positiveIntOr(overrides.password_min_length, Number(AUTH_SETTING_DEFAULTS.password_min_length)),
    passwordRequiredCharClasses: parsePasswordCharClasses(
      overrides.password_required_char_classes ?? AUTH_SETTING_DEFAULTS.password_required_char_classes,
    ),
    lostPasswordEnabled: (overrides.lost_password ?? AUTH_SETTING_DEFAULTS.lost_password) === "1",
    twofa: (TWOFA_MODES as readonly string[]).includes(twofa ?? "") ? (twofa as TwofaMode) : (AUTH_SETTING_DEFAULTS.twofa as TwofaMode),
    unsubscribeEnabled: (overrides.unsubscribe ?? AUTH_SETTING_DEFAULTS.unsubscribe) === "1",
    gravatarEnabled: (overrides.gravatar_enabled ?? AUTH_SETTING_DEFAULTS.gravatar_enabled) === "1",
    sessionLifetimeMinutes: nonNegativeIntOr(overrides.session_lifetime, Number(AUTH_SETTING_DEFAULTS.session_lifetime)),
    sessionTimeoutMinutes: nonNegativeIntOr(overrides.session_timeout, Number(AUTH_SETTING_DEFAULTS.session_timeout)),
    maxAdditionalEmails: nonNegativeIntOr(overrides.max_additional_emails, Number(AUTH_SETTING_DEFAULTS.max_additional_emails)),
  };
}

/** Mirrors Redmine's Setting.self_registration? — any mode other than '0' shows the registration form. */
export function isSelfRegistrationEnabled(settings: AuthSettings): boolean {
  return settings.selfRegistration !== "0";
}

/** Mirrors Setting.twofa? — '0' hides 2FA entirely, every other mode at least allows it. */
export function isTwofaAvailable(settings: AuthSettings): boolean {
  return settings.twofa !== "0";
}
