/* Minimal CSV reader/writer (RFC4180-ish), no dependencies.
   Handles a UTF-8 BOM, CRLF line endings and quoted fields containing
   commas, quotes or newlines — enough for the pipeline exports. */

export function parseCsv(text) {
  const src = String(text).replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < src.length; i += 1) {
    const char = src[i];
    if (quoted) {
      if (char === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  const clean = rows.filter((cells) => cells.some((cell) => cell !== ""));
  if (!clean.length) return [];
  const header = clean[0].map((name) => name.trim());
  return clean.slice(1).map((cells) => {
    const out = {};
    header.forEach((name, index) => {
      out[name] = cells[index] == null ? "" : String(cells[index]).trim();
    });
    return out;
  });
}

function cell(value) {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Write rows in the same dialect Python's csv module uses (CRLF, trailing newline). */
export function toCsv(rows, columns) {
  const lines = [columns.map(cell).join(",")];
  for (const row of rows) lines.push(columns.map((name) => cell(row[name])).join(","));
  return `${lines.join("\r\n")}\r\n`;
}

/** Format a number the way Python's str(float) does, so exported files match. */
export function pyFloat(value) {
  if (value == null || !Number.isFinite(value)) return "";
  return Number.isInteger(value) ? `${value}.0` : String(value);
}
