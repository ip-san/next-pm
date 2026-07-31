/**
 * RFC 4180-style CSV encoding: a field is quoted (with internal quotes doubled) whenever
 * it contains a comma, double quote, or newline — otherwise left bare.
 */
function encodeField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function encodeCsv(rows: string[][]): string {
  return rows.map((row) => row.map(encodeField).join(",")).join("\r\n") + "\r\n";
}
