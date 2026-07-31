import type { Issue } from "@/domain/issue/entity";
import type { IssueUpdate } from "@/domain/issue/repository";
import type { JournalDetail } from "./entity";

const TRACKED_FIELDS: (keyof IssueUpdate & keyof Issue)[] = [
  "statusId",
  "priorityId",
  "subject",
  "assignedToId",
  "fixedVersionId",
  "categoryId",
  "isPrivate",
  "doneRatio",
  "estimatedHours",
  "startDate",
  "dueDate",
];

function stringifyFieldValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

/** Pure diff between the pre-update Issue and the applied changes, one detail row per changed field. */
export function diffIssueChanges(before: Issue, changes: IssueUpdate): JournalDetail[] {
  const details: JournalDetail[] = [];
  for (const field of TRACKED_FIELDS) {
    // Distinguish "field omitted" (undefined — leave untouched) from "field explicitly
    // cleared" (null — e.g. unassigning an issue), which `field in changes` cannot.
    if (changes[field] === undefined) continue;
    const oldValue = stringifyFieldValue(before[field]);
    const newValue = stringifyFieldValue(changes[field]);
    if (oldValue !== newValue) {
      details.push({ property: "attr", fieldName: field, oldValue, newValue });
    }
  }
  return details;
}
