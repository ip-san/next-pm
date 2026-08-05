import {
  resolveCommitKeywordSettings,
  serializeKeywordList,
  type CommitKeywordSettings,
} from "@/domain/settings/commit-keywords";
import type { SettingsRepository } from "@/domain/settings/repository";

export async function loadCommitKeywordSettings(settingsRepository: SettingsRepository): Promise<CommitKeywordSettings> {
  const overrides = await settingsRepository.getAll();
  return resolveCommitKeywordSettings(overrides);
}

export interface UpdateCommitKeywordSettingsInput {
  refKeywords: string[];
  fixKeywords: string[];
  logtimeEnabled: boolean;
}

export async function updateCommitKeywordSettings(
  settingsRepository: SettingsRepository,
  input: UpdateCommitKeywordSettingsInput,
): Promise<void> {
  await settingsRepository.setMany({
    commit_ref_keywords: serializeKeywordList(input.refKeywords),
    commit_update_keywords: serializeKeywordList(input.fixKeywords),
    commit_logtime_enabled: input.logtimeEnabled ? "1" : "0",
  });
}
