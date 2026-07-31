/**
 * RFC 4180-style CSV decoding, the inverse of encode.ts's encodeCsv: a field wrapped in
 * double quotes may contain commas/newlines and escapes an internal quote by doubling it
 * (`""`); an unquoted field ends at the next comma or line break. Accepts both \r\n and
 * bare \n line endings since pasted/uploaded CSV commonly normalizes to one or the other.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  function endField() {
    row.push(field);
    field = "";
  }
  function endRow() {
    endField();
    rows.push(row);
    row = [];
  }

  while (i < text.length) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += char;
      i++;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (char === ",") {
      endField();
      i++;
      continue;
    }
    if (char === "\r") {
      if (text[i + 1] === "\n") i++;
      endRow();
      i++;
      continue;
    }
    if (char === "\n") {
      endRow();
      i++;
      continue;
    }
    field += char;
    i++;
  }

  // Trailing field/row, unless the input ended cleanly on a row break.
  if (field.length > 0 || row.length > 0) {
    endRow();
  }

  return rows;
}
