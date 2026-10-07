import { resolveGeneralSettings, type GeneralSettings, type IssueDoneRatioMode } from "@/domain/settings/general-settings";
import type { SettingsRepository } from "@/domain/settings/repository";

export async function loadGeneralSettings(settingsRepository: SettingsRepository): Promise<GeneralSettings> {
  const overrides = await settingsRepository.getAll();
  return resolveGeneralSettings(overrides);
}

export interface UpdateGeneralSettingsInput {
  attachmentMaxSizeMb: number;
  restApiEnabled: boolean;
  feedsLimit: number;
  activityDaysDefault: number;
  timelogAccept0Hours: boolean;
  repositoryLogDisplayLimit: number;
  crossProjectIssueRelations: boolean;
  issueDoneRatio: IssueDoneRatioMode;
  webhooksEnabled: boolean;
}

export async function updateGeneralSettings(
  settingsRepository: SettingsRepository,
  input: UpdateGeneralSettingsInput,
): Promise<void> {
  await settingsRepository.setMany({
    attachment_max_size: String(Math.round(input.attachmentMaxSizeMb * 1024)),
    rest_api_enabled: input.restApiEnabled ? "1" : "0",
    feeds_limit: String(Math.round(input.feedsLimit)),
    activity_days_default: String(Math.round(input.activityDaysDefault)),
    timelog_accept_0_hours: input.timelogAccept0Hours ? "1" : "0",
    repository_log_display_limit: String(Math.round(input.repositoryLogDisplayLimit)),
    cross_project_issue_relations: input.crossProjectIssueRelations ? "1" : "0",
    issue_done_ratio: input.issueDoneRatio,
    webhooks_enabled: input.webhooksEnabled ? "1" : "0",
  });
}
