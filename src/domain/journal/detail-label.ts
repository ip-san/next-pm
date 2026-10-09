import { CUSTOM_VALUE_SEPARATOR } from "@/domain/custom-value/separator";
import type { JournalDetail } from "./entity";

/** Japanese labels for the issue attributes that get journalled, mirroring Redmine's field_* keys. */
const ATTR_LABELS: Record<string, string> = {
  projectId: "プロジェクト",
  trackerId: "トラッカー",
  statusId: "ステータス",
  priorityId: "優先度",
  subject: "件名",
  description: "説明",
  assignedToId: "担当者",
  parentId: "親チケット",
  fixedVersionId: "対象バージョン",
  categoryId: "カテゴリ",
  isPrivate: "プライベート",
  doneRatio: "進捗率",
  estimatedHours: "予定工数",
  startDate: "開始日",
  dueDate: "期日",
};

/**
 * Names the viewer is allowed to see, keyed by id. Anything absent renders as a short id
 * instead — resolving blindly would leak, since a move journal's project id, a parent id or
 * a relation target can point at a private project or an issue this viewer can't open.
 * Callers populate these maps only from records they already showed the viewer.
 */
export interface JournalDetailNames {
  customFields: ReadonlyMap<string, string>;
  values: ReadonlyMap<string, string>;
}

export type JournalDetailDescription =
  | { kind: "updated"; label: string }
  | { kind: "changed"; label: string; from: string; to: string }
  | { kind: "added"; label: string; value: string }
  | { kind: "removed"; label: string; value: string };

const BLANK = "(なし)";

/**
 * Port of the shape of Redmine's `details_to_strings`: one readable sentence per journal
 * detail rather than a raw column name and two ids.
 *
 * `description` reports as "updated" with no values, as Redmine does — the before and after
 * are whole documents and belong in a diff view, not in the history list.
 */
export function describeJournalDetail(detail: JournalDetail, names: JournalDetailNames): JournalDetailDescription {
  if (detail.property === "attachment") {
    // The filename sits in newValue when added and oldValue when removed.
    const added = detail.newValue !== null;
    return {
      kind: added ? "added" : "removed",
      label: "ファイル",
      value: (added ? detail.newValue : detail.oldValue) ?? shortId(detail.fieldName),
    };
  }

  if (detail.property === "relation") {
    return {
      kind: detail.newValue !== null ? "added" : "removed",
      label: "関連チケット",
      value: displayValue(detail.fieldName, (detail.newValue ?? detail.oldValue) ?? "", names),
    };
  }

  const label =
    detail.property === "cf"
      ? (names.customFields.get(detail.fieldName) ?? shortId(detail.fieldName))
      : (ATTR_LABELS[detail.fieldName] ?? detail.fieldName);

  if (detail.property === "attr" && detail.fieldName === "description") {
    return { kind: "updated", label };
  }

  return {
    kind: "changed",
    label,
    from: detail.oldValue === null ? BLANK : displayValue(detail.fieldName, detail.oldValue, names),
    to: detail.newValue === null ? BLANK : displayValue(detail.fieldName, detail.newValue, names),
  };
}

function displayValue(fieldName: string, raw: string, names: JournalDetailNames): string {
  if (fieldName === "isPrivate") return raw === "true" ? "はい" : "いいえ";
  // A multiple-valued custom field's values come one per line; each is shown on its own, joined with commas.
  return raw
    .split(CUSTOM_VALUE_SEPARATOR)
    .map((item) => names.values.get(item) ?? (looksLikeId(item) ? shortId(item) : item))
    .join(", ");
}

function looksLikeId(raw: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw);
}

/** next-pm shows issue ids as the first 8 hex characters everywhere else, so an unresolved id matches. */
function shortId(raw: string): string {
  return `#${raw.slice(0, 8)}`;
}

/** One-line rendering of a described detail, for places with no room for markup. */
export function summariseJournalDetail(described: JournalDetailDescription): string {
  switch (described.kind) {
    case "updated":
      return `${described.label} を更新`;
    case "changed":
      return `${described.label}: ${described.from} → ${described.to}`;
    case "added":
      return `${described.label} ${described.value} を追加`;
    case "removed":
      return `${described.label} ${described.value} を削除`;
  }
}
