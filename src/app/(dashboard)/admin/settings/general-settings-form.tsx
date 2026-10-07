"use client";

import { useActionState } from "react";
import { updateGeneralSettingsAction, type SettingsActionState } from "@/interface/actions/settings-actions";
import type { GeneralSettings } from "@/domain/settings/general-settings";

const initialState: SettingsActionState = { error: null };

export function GeneralSettingsForm({ settings }: { settings: GeneralSettings }) {
  const [state, formAction, pending] = useActionState(updateGeneralSettingsAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 max-w-md">
      <label className="flex flex-col gap-1 text-sm">
        添付ファイルの最大サイズ（MB）
        <input
          type="number"
          name="attachmentMaxSizeMb"
          step="0.1"
          min="0.1"
          defaultValue={settings.attachmentMaxSizeBytes / (1024 * 1024)}
          className="border rounded px-2 py-1"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="restApiEnabled" defaultChecked={settings.restApiEnabled} />
        REST APIを有効にする
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Atomフィードの最大件数
        <input
          type="number"
          name="feedsLimit"
          min="1"
          step="1"
          defaultValue={settings.feedsLimit}
          className="border rounded px-2 py-1"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        アクティビティのデフォルト表示日数
        <input
          type="number"
          name="activityDaysDefault"
          min="1"
          step="1"
          defaultValue={settings.activityDaysDefault}
          className="border rounded px-2 py-1"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="timelogAccept0Hours" defaultChecked={settings.timelogAccept0Hours} />
        作業時間の記録で0時間を許可する
      </label>
      <label className="flex flex-col gap-1 text-sm">
        リポジトリのコミット履歴表示件数
        <input
          type="number"
          name="repositoryLogDisplayLimit"
          min="1"
          step="1"
          defaultValue={settings.repositoryLogDisplayLimit}
          className="border rounded px-2 py-1"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="crossProjectIssueRelations" defaultChecked={settings.crossProjectIssueRelations} />
        異なるプロジェクトのチケット同士を関連付けられるようにする
      </label>
      <label className="flex flex-col gap-1 text-sm">
        進捗率の算出方法
        <select name="issueDoneRatio" defaultValue={settings.issueDoneRatio} className="border rounded px-2 py-1">
          <option value="issue_field">チケットごとに入力する</option>
          <option value="issue_status">チケットのステータスから算出する</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="webhooksEnabled" defaultChecked={settings.webhooksEnabled} />
        Webhookを有効にする
      </label>

      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="bg-black text-white rounded px-3 py-2 disabled:opacity-50 self-start"
      >
        {pending ? "保存中…" : "保存"}
      </button>
    </form>
  );
}
