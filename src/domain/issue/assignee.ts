/** Parses a `<select>` value of a bare uuid (user) or "group:<uuid>" (group) into a Principal reference. */
export function parseAssigneeValue(value: string): { id: string; type: "user" | "group" } | null {
  if (value === "") return null;
  if (value.startsWith("group:")) {
    const id = value.slice("group:".length);
    return id ? { id, type: "group" } : null;
  }
  return { id: value, type: "user" };
}
