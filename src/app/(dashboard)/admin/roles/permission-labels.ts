import { PERMISSION_REGISTRY, type PermissionKey } from "@/domain/authorization/permission-registry";

export const MODULE_LABEL: Record<string, string> = {
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

export const PERMISSIONS_BY_MODULE = Object.entries(PERMISSION_REGISTRY).reduce<Record<string, PermissionKey[]>>(
  (acc, [key, def]) => {
    const moduleKey = def.module ?? "core";
    acc[moduleKey] = acc[moduleKey] ?? [];
    acc[moduleKey].push(key as PermissionKey);
    return acc;
  },
  {},
);
