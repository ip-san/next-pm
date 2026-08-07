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
