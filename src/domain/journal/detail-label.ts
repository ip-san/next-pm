import { CUSTOM_VALUE_SEPARATOR } from "@/domain/custom-value/separator";
import { DEFAULT_LOCALE, type Locale } from "@/domain/i18n/locales";
import { interpolate, translate, type MessageKey } from "@/domain/i18n/messages";
import type { JournalDetail } from "./entity";

/** Message keys for the issue attributes that get journalled, mirroring Redmine's field_* keys. */
const ATTR_LABEL_KEYS: Record<string, MessageKey> = {
  projectId: "issue.attr.projectId",
  trackerId: "issue.attr.trackerId",
  statusId: "issue.attr.statusId",
  priorityId: "issue.attr.priorityId",
  subject: "issue.attr.subject",
  description: "issue.attr.description",
  assignedToId: "issue.attr.assignedToId",
  parentId: "issue.attr.parentId",
  fixedVersionId: "issue.attr.fixedVersionId",
  categoryId: "issue.attr.categoryId",
  isPrivate: "issue.attr.isPrivate",
  doneRatio: "issue.attr.doneRatio",
  estimatedHours: "issue.attr.estimatedHours",
  startDate: "issue.attr.startDate",
  dueDate: "issue.attr.dueDate",
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

/**
 * Port of the shape of Redmine's `details_to_strings`: one readable sentence per journal
 * detail rather than a raw column name and two ids.
 *
 * `description` reports as "updated" with no values, as Redmine does — the before and after
 * are whole documents and belong in a diff view, not in the history list.
 *
 * `locale` is the language the labels are written in; it defaults to Japanese, which is what the
 * activity feed and mail have always shown.
 */
export function describeJournalDetail(
  detail: JournalDetail,
  names: JournalDetailNames,
  locale: Locale = DEFAULT_LOCALE,
): JournalDetailDescription {
  if (detail.property === "attachment") {
    // The filename sits in newValue when added and oldValue when removed.
    const added = detail.newValue !== null;
    return {
      kind: added ? "added" : "removed",
      label: translate(locale, "issue.file"),
      value: (added ? detail.newValue : detail.oldValue) ?? shortId(detail.fieldName),
    };
  }

  if (detail.property === "relation") {
    return {
      kind: detail.newValue !== null ? "added" : "removed",
      label: translate(locale, "issue.related"),
      value: displayValue(detail.fieldName, (detail.newValue ?? detail.oldValue) ?? "", names, locale),
    };
  }

  const label =
    detail.property === "cf"
      ? (names.customFields.get(detail.fieldName) ?? shortId(detail.fieldName))
      : (ATTR_LABEL_KEYS[detail.fieldName] ? translate(locale, ATTR_LABEL_KEYS[detail.fieldName]) : detail.fieldName);

  if (detail.property === "attr" && detail.fieldName === "description") {
    return { kind: "updated", label };
  }

  return {
    kind: "changed",
    label,
    from: detail.oldValue === null ? translate(locale, "issue.none") : displayValue(detail.fieldName, detail.oldValue, names, locale),
    to: detail.newValue === null ? translate(locale, "issue.none") : displayValue(detail.fieldName, detail.newValue, names, locale),
  };
}

function displayValue(fieldName: string, raw: string, names: JournalDetailNames, locale: Locale): string {
  if (fieldName === "isPrivate") return translate(locale, raw === "true" ? "issue.yes" : "issue.no");
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
export function summariseJournalDetail(described: JournalDetailDescription, locale: Locale = DEFAULT_LOCALE): string {
  switch (described.kind) {
    case "updated":
      return interpolate(translate(locale, "issue.journalUpdated"), { label: described.label });
    case "changed":
      return interpolate(translate(locale, "issue.journalChanged"), { label: described.label, from: described.from, to: described.to });
    case "added":
      return interpolate(translate(locale, "issue.journalAdded"), { label: described.label, value: described.value });
    case "removed":
      return interpolate(translate(locale, "issue.journalRemoved"), { label: described.label, value: described.value });
  }
}
