/**
 * A leading =, +, -, or @ (or a leading tab/CR, which some spreadsheet engines also
 * treat as a formula prefix after trimming) makes Excel/Sheets/LibreOffice evaluate the
 * field as a formula on open — e.g. an issue subject of `=cmd|'/c calc'!A1`. Since every
 * field here can originate from free-text user input (subject, tracker/status name),
 * neutralize that by prefixing with a literal quote, which forces text interpretation
 * without changing the value a human reads.
 */
function neutralizeFormulaPrefix(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/**
 * RFC 4180-style CSV encoding: a field is quoted (with internal quotes doubled) whenever
 * it contains a comma, double quote, or newline — otherwise left bare.
 */
function encodeField(value: string): string {
  const safe = neutralizeFormulaPrefix(value);
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function encodeCsv(rows: string[][]): string {
  return rows.map((row) => row.map(encodeField).join(",")).join("\r\n") + "\r\n";
}
