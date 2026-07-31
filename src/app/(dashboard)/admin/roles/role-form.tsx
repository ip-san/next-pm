"use client";

import { useActionState } from "react";
import { createRoleAction, type AdminActionState } from "@/interface/actions/admin-actions";
import { PERMISSION_REGISTRY } from "@/domain/authorization/permission-registry";

const initialState: AdminActionState = { error: null };

const MODULE_LABEL: Record<string, string> = {
  core: "プロジェクト",
  issue_tracking: "チケット管理",
  time_tracking: "工数管理",
  wiki: "Wiki",
  boards: "フォーラム",
  news: "ニュース",
  documents: "ドキュメント",
  files: "ファイル",
  repository: "リポジトリ",
};

const PERMISSIONS_BY_MODULE = Object.entries(PERMISSION_REGISTRY).reduce<Record<string, string[]>>(
  (acc, [key, def]) => {
    const moduleKey = def.module ?? "core";
    acc[moduleKey] = acc[moduleKey] ?? [];
    acc[moduleKey].push(key);
    return acc;
  },
  {},
);

export function RoleForm() {
  const [state, formAction, pending] = useActionState(createRoleAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 max-w-lg border-t pt-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium">
          名称
        </label>
        <input id="name" name="name" required maxLength={30} className="border rounded px-3 py-2" />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="issuesVisibility" className="text-sm font-medium">
          チケットの参照
        </label>
        <select id="issuesVisibility" name="issuesVisibility" defaultValue="default" className="border rounded px-3 py-2">
          <option value="all">すべてのチケット</option>
          <option value="default">担当のチケットとウォッチしているチケット</option>
          <option value="own">自分が登録したチケットのみ</option>
        </select>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">権限</legend>
        {Object.entries(PERMISSIONS_BY_MODULE).map(([moduleKey, keys]) => (
          <div key={moduleKey} className="flex flex-col gap-1">
            <p className="text-xs font-medium text-gray-600">{MODULE_LABEL[moduleKey] ?? moduleKey}</p>
            {keys.map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="permissions" value={key} />
                {key}
              </label>
            ))}
          </div>
        ))}
      </fieldset>

      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50 self-start">
        {pending ? "追加中…" : "ロールを追加"}
      </button>
    </form>
  );
}
