import {
  resolveMailHandlerSettings,
  type MailHandlerSettings,
  type PreferredBodyPart,
} from "@/domain/settings/mail-handler-settings";
import type { SettingsRepository } from "@/domain/settings/repository";

export async function loadMailHandlerSettings(settingsRepository: SettingsRepository): Promise<MailHandlerSettings> {
  const overrides = await settingsRepository.getAll();
  return resolveMailHandlerSettings(overrides);
}

export interface UpdateMailHandlerSettingsInput {
  apiEnabled: boolean;
  apiKey: string;
  bodyDelimiters: string;
  enableRegexDelimiters: boolean;
  excludedFilenames: string;
  enableRegexExcludedFilenames: boolean;
  preferredBodyPart: PreferredBodyPart;
}

export async function updateMailHandlerSettings(
  settingsRepository: SettingsRepository,
  input: UpdateMailHandlerSettingsInput,
): Promise<void> {
  await settingsRepository.setMany({
    mail_handler_api_enabled: input.apiEnabled ? "1" : "0",
    mail_handler_api_key: input.apiKey.trim(),
    mail_handler_body_delimiters: input.bodyDelimiters,
    mail_handler_enable_regex_delimiters: input.enableRegexDelimiters ? "1" : "0",
    mail_handler_excluded_filenames: input.excludedFilenames,
    mail_handler_enable_regex_excluded_filenames: input.enableRegexExcludedFilenames ? "1" : "0",
    mail_handler_preferred_body_part: input.preferredBodyPart,
  });
}
