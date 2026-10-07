import type { Version } from "./entity";

type ComparableVersion = Pick<Version, "id" | "name" | "effectiveDate">;

/**
 * Port of Version#<=>: dated versions come first in date order, undated ones last, and ties
 * break on the name then the id. FilesController#index reverses the result, so the newest
 * release's files sit at the top of the page.
 */
export function compareVersions(a: ComparableVersion, b: ComparableVersion): number {
  if (a.effectiveDate && b.effectiveDate) {
    if (a.effectiveDate !== b.effectiveDate) {
      return a.effectiveDate < b.effectiveDate ? -1 : 1;
    }
  } else if (a.effectiveDate) {
    return -1;
  } else if (b.effectiveDate) {
    return 1;
  }
  return a.name === b.name ? a.id.localeCompare(b.id) : a.name.localeCompare(b.name);
}
