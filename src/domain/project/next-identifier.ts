/**
 * Redmine's Project.next_identifier, used to pre-fill the new-project form when
 * `sequential_project_identifiers` is on. Redmine takes the identifier of the project with
 * the highest id — the most recently created one — and applies Ruby's String#succ.
 *
 * Two deliberate deviations, both forced:
 *
 * - next-pm's projects have a UUID primary key and no created_at column, so "most recently
 *   created" is not recoverable. The greatest identifier in sort order is used instead,
 *   which agrees with Redmine for a run of project-1, project-2, … and only differs when
 *   identifiers were not created in sorted order.
 * - String#succ is not reproduced character for character. Its carry rules across letters
 *   and separators are genuinely surprising ("ab-9" succeeds to "ab-10" but "1.9" to "2.0")
 *   and produce identifiers nobody wants ("myproject" succeeds to "myprojecu"). The
 *   trailing-number rule below agrees with String#succ on every identifier of the form
 *   `<name>-<n>`, which is the shape the setting exists to generate, and falls back to
 *   appending "-1" rather than mangling a word.
 */
export function succIdentifier(identifier: string): string {
  const match = /^(.*?)(\d+)$/.exec(identifier);
  if (!match) {
    return `${identifier}-1`;
  }

  const [, prefix, digits] = match;
  const next = String(Number(digits) + 1);
  // Keep zero padding ("project-09" -> "project-10") until the number outgrows it.
  return prefix + next.padStart(digits.length, "0");
}

export function nextProjectIdentifier(existingIdentifiers: string[]): string | null {
  if (existingIdentifiers.length === 0) return null;
  const last = [...existingIdentifiers].sort().at(-1)!;
  return succIdentifier(last);
}
