import {
  resolveAuthSettings,
  serializePasswordCharClasses,
  type AuthSettings,
  type PasswordCharClass,
  type SelfRegistrationMode,
  type TwofaMode,
} from "@/domain/settings/auth-settings";
import type { SettingsRepository } from "@/domain/settings/repository";

export async function loadAuthSettings(settingsRepository: SettingsRepository): Promise<AuthSettings> {
  const overrides = await settingsRepository.getAll();
  return resolveAuthSettings(overrides);
}

export interface UpdateAuthSettingsInput {
  loginRequired: boolean;
  autologinDays: number;
  selfRegistration: SelfRegistrationMode;
  passwordMinLength: number;
  passwordRequiredCharClasses: PasswordCharClass[];
  lostPasswordEnabled: boolean;
  twofa: TwofaMode;
  unsubscribeEnabled: boolean;
  gravatarEnabled: boolean;
  sessionLifetimeMinutes: number;
  sessionTimeoutMinutes: number;
  maxAdditionalEmails: number;
}

export async function updateAuthSettings(
  settingsRepository: SettingsRepository,
  input: UpdateAuthSettingsInput,
): Promise<void> {
  await settingsRepository.setMany({
    login_required: input.loginRequired ? "1" : "0",
    autologin: String(Math.round(input.autologinDays)),
    self_registration: input.selfRegistration,
    password_min_length: String(Math.round(input.passwordMinLength)),
    password_required_char_classes: serializePasswordCharClasses(input.passwordRequiredCharClasses),
    lost_password: input.lostPasswordEnabled ? "1" : "0",
    twofa: input.twofa,
    unsubscribe: input.unsubscribeEnabled ? "1" : "0",
    gravatar_enabled: input.gravatarEnabled ? "1" : "0",
    session_lifetime: String(Math.round(input.sessionLifetimeMinutes)),
    session_timeout: String(Math.round(input.sessionTimeoutMinutes)),
    max_additional_emails: String(Math.round(input.maxAdditionalEmails)),
  });
}
