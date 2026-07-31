export type DiffLine = { kind: "same" | "add" | "remove"; text: string };

/**
 * Line-based diff via a classic LCS dynamic-programming table — the same shape of
 * algorithm Redmine's wiki diff view (using Ruby's `diff-lcs`) produces, reimplemented
 * directly rather than pulled in as a dependency (no field-format-style registry needed,
 * unlike the custom-field formats).
 */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.length > 0 ? oldText.split("\n") : [];
  const newLines = newText.length > 0 ? newText.split("\n") : [];

  const m = oldLines.length;
  const n = newLines.length;
  const lcs: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      lcs[i][j] =
        oldLines[i] === newLines[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (oldLines[i] === newLines[j]) {
      result.push({ kind: "same", text: oldLines[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      result.push({ kind: "remove", text: oldLines[i] });
      i++;
    } else {
      result.push({ kind: "add", text: newLines[j] });
      j++;
    }
  }
  while (i < m) {
    result.push({ kind: "remove", text: oldLines[i] });
    i++;
  }
  while (j < n) {
    result.push({ kind: "add", text: newLines[j] });
    j++;
  }

  return result;
}
