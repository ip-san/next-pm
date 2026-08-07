import { resolveGeneralSettings, type GeneralSettings } from "@/domain/settings/general-settings";
import type { SettingsRepository } from "@/domain/settings/repository";

export async function loadGeneralSettings(settingsRepository: SettingsRepository): Promise<GeneralSettings> {
  const overrides = await settingsRepository.getAll();
  return resolveGeneralSettings(overrides);
}

export interface UpdateGeneralSettingsInput {
  attachmentMaxSizeMb: number;
  restApiEnabled: boolean;
}

export async function updateGeneralSettings(
  settingsRepository: SettingsRepository,
  input: UpdateGeneralSettingsInput,
): Promise<void> {
  await settingsRepository.setMany({
    attachment_max_size: String(Math.round(input.attachmentMaxSizeMb * 1024)),
    rest_api_enabled: input.restApiEnabled ? "1" : "0",
  });
}
